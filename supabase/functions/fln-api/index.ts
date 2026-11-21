import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { accountManagementScope } from '../_shared/accountManagementAuthorization.js';
import { authVerificationFailureStatus } from '../_shared/scopedAccountManagement.js';
import { schoolMatchesManagementScope } from '../_shared/accountManagementAuthorization.js';
import { API_ACTIONS, API_MAX_SCHOOLS, API_MAX_STUDENTS, planStudentRows, validateApiSchool, normalizeGrade } from '../_shared/apiRules.js';

// FLN public API (JWT login ni jarur). Badha scope check server par: RLS (caller no JWT) + code prefix.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

const PAGE = 1000;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond(405, { error: 'POST only' });
  const authorization = request.headers.get('Authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return respond(401, { error: 'Authorization: Bearer <access_token> required' });
  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publicKey || !serviceKey) return respond(500, { error: 'Server configuration incomplete' });

  const token = authorization.replace(/^Bearer\s+/i, '');
  const authClient = createClient(url, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    const status = authVerificationFailureStatus(authError?.status);
    return respond(status, { error: status === 401 ? 'Invalid or expired token' : 'Session verification unavailable' });
  }
  // caller no JWT -> RLS laagu padse (service key fakt gateway apikey tarike)
  const user = createClient(url, serviceKey, { global: { headers: { Authorization: authorization } }, auth: { autoRefreshToken: false, persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('role,active,district_code,block_code,school_id').eq('id', authData.user.id).maybeSingle();
  if (profileError || !profile?.active) return respond(403, { error: 'Active account required' });
  const role = profile.role as string;
  if (!['admin', 'district', 'block', 'school'].includes(role)) return respond(403, { error: 'Role not allowed' });
  const management = accountManagementScope(profile);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return respond(400, { error: 'Body must be JSON' }); }
  const action = String(body?.action ?? '');
  if (!API_ACTIONS.includes(action)) return respond(400, { error: `Unknown action. Use one of: ${API_ACTIONS.join(', ')}` });

  async function loadAll(query: { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> }) {
    const rows: unknown[] = [];
    for (let from = 0; from < 100000; from += PAGE) {
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return rows;
  }

  async function findSchool(input: Record<string, unknown>) {
    const code = String(input.schoolCode ?? '').trim();
    const id = String(input.schoolId ?? '').trim();
    let query = user.from('schools').select('id,code,name,district,block,active');
    if (/^\d{11}$/.test(code)) query = query.eq('code', code);
    else if (/^[0-9a-f-]{36}$/i.test(id)) query = query.eq('id', id);
    else return { error: respond(400, { error: 'schoolCode (11 digits) or schoolId required' }) };
    const { data, error } = await query.maybeSingle();
    if (error) return { error: respond(500, { error: 'School lookup failed' }) };
    if (!data) return { error: respond(404, { error: 'School not found or not in your scope' }) };
    return { school: data as { id: string; code: string; name: string; district: string; block: string; active: boolean } };
  }

  async function addSchool(input: Record<string, unknown>) {
    const checked = validateApiSchool(input);
    if (!checked.value) return { status: 'invalid', reason: checked.error };
    const { code, name, cluster } = checked.value;
    if (role === 'school') return { status: 'forbidden', reason: 'School login cannot add schools' };
    if (role !== 'admin' && (!management || !schoolMatchesManagementScope(management, code))) return { status: 'forbidden', reason: 'School code is outside your area' };
    let { district, block } = checked.value;
    if (role !== 'admin' || !district || !block) {
      const { data: sibling } = await admin.from('schools').select('district,block').like('code', `${code.slice(0, 6)}%`).limit(1).maybeSingle();
      if (sibling) { district = sibling.district; block = sibling.block; }
    }
    if (!district || !block) return { status: 'invalid', reason: 'district and block names required (no existing school in this block)' };
    const { data, error } = await admin.from('schools').insert({ code, name, cluster, district, block }).select('id,code,name,district,block').single();
    if (error) return { status: error.code === '23505' ? 'duplicate' : 'error', reason: error.code === '23505' ? 'School code already exists' : 'Insert failed' };
    return { status: 'added', school: data };
  }

  try {
    if (action === 'whoami') {
      return respond(200, { role, districtCode: profile.district_code ?? null, blockCode: profile.block_code ?? null, schoolId: profile.school_id ?? null, userId: authData.user.id });
    }

    if (action === 'add-school') {
      const result = await addSchool(body);
      const status = result.status === 'added' ? 200 : result.status === 'duplicate' ? 409 : result.status === 'forbidden' ? 403 : 422;
      return respond(status, result);
    }

    if (action === 'add-schools') {
      const schools = Array.isArray(body.schools) ? body.schools as Record<string, unknown>[] : [];
      if (!schools.length || schools.length > API_MAX_SCHOOLS) return respond(422, { error: `schools: 1 to ${API_MAX_SCHOOLS} items required` });
      const results = [];
      for (let index = 0; index < schools.length; index += 1) results.push({ row: index + 1, ...(await addSchool(schools[index])) });
      const summary = { added: 0, duplicate: 0, invalid: 0, forbidden: 0, error: 0 } as Record<string, number>;
      for (const item of results) summary[item.status] = (summary[item.status] || 0) + 1;
      return respond(200, { summary, results });
    }

    if (action === 'add-students') {
      const found = await findSchool(body);
      if (found.error) return found.error;
      const school = found.school!;
      if (!school.active) return respond(409, { error: 'School is inactive' });
      const rows = Array.isArray(body.students) ? body.students as Record<string, unknown>[] : [];
      if (!rows.length || rows.length > API_MAX_STUDENTS) return respond(422, { error: `students: 1 to ${API_MAX_STUDENTS} items required` });
      const existing = await loadAll(user.from('students').select('name,dhoran,reg,student_id').eq('school_id', school.id).order('id')) as Array<{ name: string; dhoran: string; reg: string; student_id: string | null }>;
      const plan = planStudentRows(rows, existing);
      let inserted = 0;
      const failed: Array<{ row: number; reason: string }> = [];
      for (let start = 0; start < plan.toInsert.length; start += 200) {
        const batch = plan.toInsert.slice(start, start + 200).map((item) => ({ school_id: school.id, dhoran: item.dhoran, name: item.name, reg: item.reg, student_id: item.reg || null }));
        const { error } = await user.from('students').insert(batch);
        if (!error) { inserted += batch.length; continue; }
        for (const row of batch) {
          const single = await user.from('students').insert(row);
          if (single.error) failed.push({ row: start + batch.indexOf(row) + 1, reason: single.error.code === '23505' ? 'duplicate register no.' : 'insert refused' });
          else inserted += 1;
        }
      }
      const summary = { added: inserted, duplicate: plan.outcomes.filter((item) => item.status === 'duplicate').length, invalid: plan.outcomes.filter((item) => item.status === 'invalid').length, failed: failed.length };
      return respond(200, { school: { code: school.code, name: school.name }, summary, results: plan.outcomes, failed });
    }

    if (action === 'list-students') {
      const found = await findSchool(body);
      if (found.error) return found.error;
      const grade = body.dhoran === undefined && body.class === undefined ? '' : normalizeGrade(body.dhoran ?? body.class);
      const pageSize = Math.min(Math.max(Number(body.pageSize) || 200, 1), 500);
      const page = Math.max(Number(body.page) || 1, 1);
      let query = user.from('students').select('id,name,reg,dhoran,created_at', { count: 'exact' }).eq('school_id', found.school!.id);
      if (grade) query = query.eq('dhoran', grade);
      const { data, count, error } = await query.order('dhoran').order('name').range((page - 1) * pageSize, page * pageSize - 1);
      if (error) return respond(500, { error: 'Student query failed' });
      return respond(200, { school: { code: found.school!.code, name: found.school!.name }, total: count ?? 0, page, pageSize, students: data || [] });
    }

    // list-schools
    const pageSize = Math.min(Math.max(Number(body.pageSize) || 200, 1), 500);
    const page = Math.max(Number(body.page) || 1, 1);
    let query = user.from('schools').select('id,code,name,district,block,cluster,active', { count: 'exact' });
    const district = String(body.district ?? '').trim();
    const block = String(body.block ?? '').trim();
    if (district) query = query.eq('district', district);
    if (block) query = query.eq('block', block);
    const { data, count, error } = await query.order('code').range((page - 1) * pageSize, page * pageSize - 1);
    if (error) return respond(500, { error: 'School query failed' });
    return respond(200, { total: count ?? 0, page, pageSize, schools: data || [] });
  } catch (cause) {
    console.error('fln-api failed:', cause instanceof Error ? cause.message : cause);
    return respond(500, { error: 'Request failed' });
  }
});
