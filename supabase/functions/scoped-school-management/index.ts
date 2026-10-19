import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { accountManagementScope } from '../_shared/accountManagementAuthorization.js';
import { authVerificationFailureStatus } from '../_shared/scopedAccountManagement.js';
import { SCHOOL_ACTIONS, canChangeSchool, validateNewSchool } from '../_shared/schoolManagement.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'માત્ર POST વિનંતી માન્ય છે.' });
  const authorization = request.headers.get('Authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return response(401, { error: 'Login જરૂરી છે.' });
  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publicKey || !serviceKey) return response(500, { error: 'Server configuration અધૂરી છે.' });

  const callerClient = createClient(url, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) {
    const status = authVerificationFailureStatus(authError?.status);
    return response(status, { error: status === 401 ? 'Session માન્ય નથી.' : 'Session ચકાસણી સેવા ઉપલબ્ધ નથી.' });
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: actor, error: actorError } = await admin.from('profiles')
    .select('role,active,district_code,block_code').eq('id', authData.user.id).maybeSingle();
  if (actorError) return response(500, { error: 'Profile ચકાસી શકાઈ નથી.' });
  const scope = accountManagementScope(actor);
  if (!scope) return response(403, { error: 'સક્રિય Admin/District/Block અધિકાર જરૂરી છે.' });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: 'વિનંતી માન્ય JSON નથી.' });
  }
  const action = String(body?.action ?? '');
  if (!SCHOOL_ACTIONS.includes(action)) return response(400, { error: 'અમાન્ય action.' });

  if (action === 'add') {
    const checked = validateNewSchool(scope, body);
    if (!checked.value) return response(checked.status || 422, { error: checked.error });
    const { code, name, cluster } = checked.value;
    // District/Block names come from existing schools of the same code prefix, never from the client.
    const { data: sibling, error: siblingError } = await admin.from('schools')
      .select('district,block').like('code', `${code.slice(0, 6)}%`).limit(1).maybeSingle();
    if (siblingError) return response(500, { error: 'વિસ્તાર ચકાસી શકાયો નથી.' });
    if (!sibling) {
      return response(422, { error: 'આ બ્લોકમાં હાલ કોઈ શાળા નથી; બ્લોક/જિલ્લાનું નામ નક્કી થઈ શકતું નથી. State Admin પાસે પ્રથમ શાળા ઉમેરાવો.' });
    }
    const { data: created, error: insertError } = await admin.from('schools')
      .insert({ code, name, cluster, district: sibling.district, block: sibling.block })
      .select('id,code,name,district,block,cluster,active').single();
    if (insertError) {
      if (insertError.code === '23505') return response(409, { error: 'આ School Code પહેલેથી અસ્તિત્વમાં છે.' });
      console.error('School insert failed:', insertError.message);
      return response(500, { error: 'શાળા ઉમેરી શકાઈ નથી.' });
    }
    console.info('scoped school added', { actor: authData.user.id, role: scope.role, code });
    return response(200, { school: created });
  }

  const schoolId = String(body?.schoolId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(schoolId)) return response(422, { error: 'અમાન્ય શાળા.' });
  const { data: school, error: schoolError } = await admin.from('schools')
    .select('id,code,name,active').eq('id', schoolId).maybeSingle();
  if (schoolError) return response(500, { error: 'શાળા ચકાસી શકાઈ નથી.' });
  if (!school || !canChangeSchool(scope, school)) {
    return response(403, { error: 'આ શાળા તમારા વિસ્તારની નથી; કોઈ ફેરફાર કરાયો નથી.' });
  }
  const active = action === 'activate';
  const { error: updateError } = await admin.from('schools').update({ active }).eq('id', school.id);
  if (updateError) {
    console.error('School update failed:', updateError.message);
    return response(500, { error: 'શાળામાં ફેરફાર થઈ શક્યો નથી.' });
  }
  console.info('scoped school status changed', { actor: authData.user.id, role: scope.role, code: school.code, active });
  return response(200, { school: { id: school.id, code: school.code, name: school.name, active } });
});
