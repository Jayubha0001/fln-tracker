import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  accountManagementScope,
  canManageAccount,
  schoolMatchesManagementScope,
} from '../_shared/accountManagementAuthorization.js';

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

function createTemporaryPassword() {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@$%*-_'];
  const alphabet = groups.join('');
  const random = new Uint32Array(28);
  crypto.getRandomValues(random);
  const password = groups.map((group, index) => group[random[index] % group.length]);
  for (let index = groups.length; index < random.length; index += 1) password.push(alphabet[random[index] % alphabet.length]);
  for (let index = password.length - 1; index > 0; index -= 1) {
    const swap = random[index] % (index + 1);
    [password[index], password[swap]] = [password[swap], password[index]];
  }
  return password.join('');
}

async function handle(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'માત્ર POST વિનંતી માન્ય છે.' });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return response(401, { error: 'Admin login જરૂરી છે.' });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    console.error('Scoped-account function secrets are missing.');
    return response(500, { error: 'Server configuration અધૂરી છે.' });
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return response(401, { error: 'Admin session માન્ય નથી.' });
  const { data: actor, error: actorError } = await admin.from('profiles')
    .select('role,active,district_code,block_code').eq('id', authData.user.id).maybeSingle();
  if (actorError) {
    console.error('Unable to verify scoped-account caller:', actorError.message);
    return response(500, { error: 'Admin અધિકાર ચકાસી શકાયા નથી.' });
  }
  const scope = accountManagementScope(actor);
  if (!scope) return response(403, { error: 'સક્રિય અને માન્ય account-management scope જરૂરી છે.' });

  const { error: schemaError } = await admin.from('profiles')
    .select('district_code,block_code,must_change_password').limit(0);
  if (schemaError) {
    console.error('Scoped-account schema is not ready:', schemaError.message);
    return response(503, { error: 'District/Block migration 202610140002_scoped_district_block_accounts.sql લાગુ થયેલી નથી અથવા API schema cache જૂનો છે.' });
  }

  let payload: { role?: unknown; code?: unknown };
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: 'Request માન્ય JSON નથી.' });
  }
  if (payload.role !== 'district' && payload.role !== 'block') {
    return response(400, { error: 'Account role district અથવા block હોવો જોઈએ.' });
  }
  if (typeof payload.code !== 'string'
    || (payload.role === 'district' && !/^\d{4}$/.test(payload.code))
    || (payload.role === 'block' && !/^\d{6}$/.test(payload.code))) {
    return response(400, { error: payload.role === 'district' ? 'District Code 4 અંકનો હોવો જોઈએ.' : 'Block Code 6 અંકનો હોવો જોઈએ.' });
  }
  const code = payload.code;
  const districtCode = payload.role === 'district' ? code : code.slice(0, 4);
  const blockCode = payload.role === 'block' ? code : null;
  if (!canManageAccount(scope, payload.role, districtCode, blockCode)) {
    return response(403, { error: 'આ account તમારા અધિકૃત scopeમાં બનાવી શકાતું નથી.' });
  }
  const { error: auditSchemaError } = await admin.from('admin_account_audit').select('id').limit(0);
  if (auditSchemaError) {
    console.error('Central account audit schema is unavailable:', auditSchemaError.message);
    return response(503, {
      error: `admin_account_audit migration 202610150001_central_login_management.sql યોગ્ય Supabase project પર લાગુ નથી અથવા API schema cache જૂનો છે. કોઈ account create કરાયો નથી.`,
    });
  }
  async function audit(profileId: string | null, result: 'success' | 'failed', detailCode: string) {
    const { error } = await admin.from('admin_account_audit').insert({
      actor_id: authData.user.id,
      account_type: payload.role,
      target_profile_id: profileId,
      district_code: districtCode,
      block_code: blockCode,
      result,
      detail_code: detailCode,
    });
    if (error) throw error;
  }
  const { data: matchingSchool, error: schoolError } = await admin.from('schools')
    .select('id,code').like('code', `${code}%`).eq('active', true).limit(1).maybeSingle();
  if (schoolError) {
    console.error('Unable to validate regional code against schools:', schoolError.message);
    await audit(null, 'failed', 'school_scope_lookup_failed');
    return response(500, { error: 'આ code માટે શાળાઓ ચકાસી શકાઈ નથી.' });
  }
  if (!matchingSchool) {
    await audit(null, 'failed', 'active_school_missing');
    return response(404, { error: 'આ code સાથે મેળ ખાતી સક્રિય શાળા મળી નથી.' });
  }
  if (!schoolMatchesManagementScope(scope, matchingSchool.code)) {
    await audit(null, 'failed', 'school_scope_mismatch');
    return response(403, { error: 'આ વિસ્તાર તમારા અધિકૃત scope બહાર છે.' });
  }

  const scopeColumn = payload.role === 'district' ? 'district_code' : 'block_code';
  const { data: existingProfile, error: existingError } = await admin.from('profiles')
    .select('id,email,active').eq('role', payload.role).eq(scopeColumn, code)
    .eq('district_code', districtCode).maybeSingle();
  if (existingError) {
    console.error('Unable to inspect existing scoped profile:', existingError.message);
    await audit(null, 'failed', 'profile_lookup_failed');
    return response(500, { error: 'હાલનો scoped account ચકાસી શકાયો નથી.' });
  }
  if (existingProfile) {
    await audit(existingProfile.id, 'failed', 'profile_already_exists');
    return response(409, { error: 'આ વિસ્તારનું login પહેલેથી છે. કોઈ duplicate Auth user બનાવ્યો નથી.', exists: true, loginId: code });
  }

  const projectRef = new URL(url).hostname.split('.')[0];
  const email = `${payload.role}-${code}@${projectRef}.supabase.co`;
  const password = createTemporaryPassword();
  let created;
  let createError;
  try {
    ({ data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: {},
    }));
  } catch (cause) {
    console.error(`Scoped Auth creation outcome is unknown for ${payload.role}-${code}:`, cause);
    await audit(null, 'failed', 'auth_create_outcome_unknown');
    return response(502, {
      error: 'Auth create requestનો response મળ્યો નથી; સ્થિતિ અસ્પષ્ટ છે. ફરી પ્રયાસ કરતાં પહેલાં Auth અને profiles તપાસો.',
      outcomeUnknown: true,
    });
  }
  if (createError || !created.user) {
    const status = typeof (createError as { status?: unknown })?.status === 'number'
      ? (createError as { status: number }).status
      : 502;
    const duplicate = status === 422 || /already|exists|duplicate/i.test(createError?.message || '');
    console.error(`Unable to create scoped Auth user ${payload.role}-${code}:`, { status, message: createError?.message });
    await audit(null, 'failed', duplicate ? 'auth_user_conflict' : 'auth_user_create_failed');
    return response(duplicate ? 409 : 502, {
      error: createError?.message || 'Supabase Authએ user બનાવ્યો નથી.',
      code: duplicate ? 'AUTH_USER_EXISTS_OR_CONFLICT' : 'AUTH_USER_CREATE_FAILED',
      upstreamStatus: status,
    });
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    email,
    role: payload.role,
    school_id: null,
    district_code: districtCode,
    block_code: blockCode,
    active: true,
    must_change_password: true,
  });
  if (profileError) {
    console.error(`Scoped profile insert failed for ${payload.role}-${code}:`, profileError.message);
    await audit(null, 'failed', 'profile_insert_failed');
    return response(500, {
      error: 'Auth user બન્યો, પણ profile insert નિષ્ફળ. Password બતાવ્યો નથી; user delete નથી કર્યો. ફરી પ્રયાસ પહેલાં Auth/profiles reconcile કરો.',
      profileInsertFailed: true,
    });
  }
  try {
    await audit(created.user.id, 'success', 'account_created');
  } catch (cause) {
    console.error('Scoped account created but central audit insert failed:', cause);
    return response(500, {
      error: 'Auth/profile account બન્યું પરંતુ audit log સાચવાયો નથી. Password દર્શાવ્યો નથી; retry પહેલાં Auth, profile અને audit તપાસો.',
      outcomeUnknown: true,
    });
  }
  return response(200, { role: payload.role, loginId: code, temporaryPassword: password, mustChangePassword: true });
}

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (cause) {
    console.error('Unexpected scoped-account failure:', cause);
    return response(500, { error: 'Scoped account server error; Supabase Edge Function logs તપાસો.' });
  }
});
