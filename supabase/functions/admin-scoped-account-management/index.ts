import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  accountListError,
  accountListResponse,
  isActiveAdmin,
  isSupportedAccountType,
  resetCanRevealCredential,
  resetFailureReason,
  validScopedTarget,
} from '../_shared/scopedAccountManagement.js';
import { resetTemporaryPassword } from '../_shared/temporaryPassword.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
type Role = 'district' | 'block';

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

function temporaryPassword() {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@$%*-_'];
  const alphabet = groups.join('');
  const random = new Uint32Array(32);
  crypto.getRandomValues(random);
  const characters = groups.map((group, index) => group[random[index] % group.length]);
  for (let index = groups.length; index < random.length; index += 1) {
    characters.push(alphabet[random[index] % alphabet.length]);
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = random[index] % (index + 1);
    [characters[index], characters[swap]] = [characters[swap], characters[index]];
  }
  return characters.join('');
}

async function listAccounts(
  admin: ReturnType<typeof createClient>,
  projectRef: string,
  payload: { accountType?: unknown; filters?: unknown; page?: unknown; pageSize?: unknown },
) {
  const accountType = payload.accountType;
  const filters = payload.filters && typeof payload.filters === 'object' && !Array.isArray(payload.filters)
    ? payload.filters as Record<string, unknown>
    : {};
  const page = Number.isInteger(payload.page) ? Number(payload.page) : 1;
  const pageSize = Number.isInteger(payload.pageSize) ? Number(payload.pageSize) : 50;
  const statuses = ['', 'active', 'missing', 'inactive', 'password_change_required', 'needs_attention'];
  if (!isSupportedAccountType(accountType)
    || page < 1 || pageSize < 1 || pageSize > 100
    || (filters.status !== undefined && !statuses.includes(String(filters.status)))) {
    throw new Error('Account type, filters અથવા page માન્ય નથી.');
  }
  const filterValue = (name: string) => {
    const value = filters[name];
    if (value === undefined || value === '') return '';
    if (typeof value !== 'string' || value.length > 100) throw new Error(`${name} filter માન્ય નથી.`);
    return value.trim();
  };
  const { data, error } = await admin.rpc('admin_login_targets', {
    p_account_type: accountType,
    p_district: filterValue('district'),
    p_block: filterValue('block'),
    p_school: filterValue('school'),
    p_status: filterValue('status'),
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) {
    console.error('Central login target query failed:', error.message);
    throw error;
  }
  if (!Array.isArray(data)) {
    throw new Error('Central login target RPC returned a non-array response.');
  }

  const projectHost = `${projectRef}.supabase.co`;
  const rows = await Promise.all(data.map(async (row: any) => {
    let authUser = null;
    let lookupFailed = false;
    if (row.profile_id) {
      const { data: authData, error: authError } = await admin.auth.admin.getUserById(row.profile_id);
      authUser = authData?.user || null;
      lookupFailed = Boolean(authError);
    }
    const expectedEmail = `${row.account_type}-${row.login_id}@${projectHost}`.toLowerCase();
    const identityConsistent = !row.profile_id
      || (!lookupFailed && authUser?.id === row.profile_id
        && authUser.email?.toLowerCase() === row.email?.toLowerCase()
        && row.email?.toLowerCase() === expectedEmail);
    const status = lookupFailed || (row.profile_id && !identityConsistent)
      ? 'needs_attention'
      : row.account_status;
    return {
      accountType: row.account_type,
      districtName: row.district_name || '',
      districtCode: row.district_code || '',
      blockName: row.block_name || '',
      blockCode: row.block_code || '',
      schoolName: row.school_name || '',
      schoolId: row.school_id || '',
      loginId: row.login_id,
      email: row.email || expectedEmail,
      profileId: row.profile_id,
      accountStatus: status,
      lastUpdated: authUser?.updated_at || null,
      mustChangePassword: row.must_change_password === true,
      identityConsistent,
      active: row.target_active === true,
    };
  }));
  return accountListResponse(rows, Number(data[0]?.total_count || 0), page, pageSize);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'માત્ર POST વિનંતી માન્ય છે.' });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return response(401, { error: 'Admin login જરૂરી છે.' });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    console.error('Scoped account management secrets are missing.');
    return response(500, { error: 'Server configuration અધૂરી છે.' });
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return response(401, { error: 'Admin session માન્ય નથી.' });
  const actorId = authData.user.id;
  const { data: actor, error: actorError } = await admin.from('profiles')
    .select('role,active').eq('id', actorId).maybeSingle();
  if (actorError) {
    console.error('Unable to verify scoped account management caller:', actorError.message);
    return response(500, { error: 'Admin અધિકાર ચકાસી શકાયા નથી.' });
  }
  if (!isActiveAdmin(actor)) {
    return response(403, { error: 'સક્રિય State Admin અધિકાર જરૂરી છે.' });
  }

  const { error: schemaError } = await admin.from('profiles')
    .select('district_code,block_code,must_change_password').limit(0);
  if (schemaError) {
    console.error('Scoped account management schema is unavailable:', schemaError.message);
    return response(503, { error: 'District/Block migration 202610140002_scoped_district_block_accounts.sql લાગુ નથી અથવા schema cache જૂનો છે.' });
  }

  let payload: {
    action?: unknown;
    role?: unknown;
    code?: unknown;
    accountType?: unknown;
    filters?: unknown;
    page?: unknown;
    pageSize?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: 'Request માન્ય JSON નથી.' });
  }

  if (payload.action === 'list') {
    try {
      const projectRef = new URL(url).hostname.split('.')[0];
      return response(200, await listAccounts(admin, projectRef, payload));
    } catch (cause) {
      const databaseError = cause && typeof cause === 'object'
        ? cause as { code?: unknown; message?: unknown }
        : { message: cause instanceof Error ? cause.message : 'અજાણી server ભૂલ.' };
      const diagnosis = accountListError(databaseError);
      console.error('Scoped account listing failed:', diagnosis.databaseCode, diagnosis.databaseMessage);
      return response(diagnosis.status, diagnosis);
    }
  }

  const role = payload.role;
  const code = payload.code;
  if ((role !== 'district' && role !== 'block') || !validScopedTarget(role, code)) {
    return response(400, { error: 'ચોક્કસ District Code (4 અંક) અથવા Block Code (6 અંક) જરૂરી છે.' });
  }
  const targetRole: Role = role;
  const districtCode = targetRole === 'district' ? code as string : (code as string).slice(0, 4);
  const blockCode = targetRole === 'block' ? code as string : null;
  const { error: auditSchemaError } = await admin.from('scoped_password_reset_audit').select('id').limit(0);
  if (auditSchemaError) {
    console.error('Scoped password reset audit schema is unavailable:', auditSchemaError.message);
    const missingTable = ['PGRST205', '42P01'].includes(auditSchemaError.code || '');
    return response(503, {
      error: missingTable
        ? `scoped_password_reset_audit table API schemaમાં મળતી નથી (${auditSchemaError.code}). આ project પર supabase/migrations/202610140005_scoped_password_reset_audit.sql apply કરો; table હાજર હોય તો NOTIFY pgrst, 'reload schema'; ચલાવો.`
        : `scoped_password_reset_audit ચકાસણી નિષ્ફળ (${auditSchemaError.code || 'unknown'}): ${auditSchemaError.message}. કોઈ password reset કરાયો નથી.`,
    });
  }
  const { error: centralAuditSchemaError } = await admin.from('admin_account_audit').select('id').limit(0);
  if (centralAuditSchemaError) {
    console.error('Central account audit schema is unavailable:', centralAuditSchemaError.message);
    return response(503, {
      error: `admin_account_audit table ઉપલબ્ધ નથી (${centralAuditSchemaError.code || 'unknown'}). 202610150001_central_login_management.sql યોગ્ય Supabase project પર apply કરો અને જરૂરી હોય તો PostgREST schema cache reload કરો; કોઈ password reset કરાયો નથી.`,
    });
  }

  async function audit(profileId: string | null, result: 'success' | 'failed', detailCode: string) {
    const { error } = await admin.from('scoped_password_reset_audit').insert({
      profile_id: profileId,
      actor_id: actorId,
      role: targetRole,
      district_code: districtCode,
      block_code: blockCode,
      result,
      detail_code: detailCode,
    });
    if (error) throw error;
  }
  async function auditCentral(profileId: string | null, result: 'success' | 'failed', detailCode: string) {
    const { error } = await admin.from('admin_account_audit').insert({
      actor_id: actorId,
      account_type: targetRole,
      target_profile_id: profileId,
      district_code: districtCode,
      block_code: blockCode,
      result,
      detail_code: detailCode,
    });
    if (error) throw error;
  }

  const profileQuery = admin.from('profiles')
    .select('id,email,role,active,school_id,district_code,block_code,must_change_password')
    .eq('role', targetRole);
  if (targetRole === 'district') profileQuery.eq('district_code', code as string).is('block_code', null);
  else profileQuery.eq('district_code', districtCode).eq('block_code', code as string);
  const { data: profile, error: profileError } = await profileQuery.maybeSingle();
  if (profileError) {
    console.error('Unable to locate scoped password reset target:', profileError.message);
    try {
      await audit(null, 'failed', 'profile_lookup_failed');
      await auditCentral(null, 'failed', 'profile_lookup_failed');
    } catch (cause) {
      console.error('Unable to audit scoped profile lookup failure:', cause);
    }
    return response(500, { error: 'District/Block account ચકાસી શકાયું નથી.' });
  }
  if (!profile) {
    try {
      await audit(null, 'failed', 'profile_missing');
      await auditCentral(null, 'failed', 'profile_missing');
    } catch (cause) {
      console.error('Unable to audit missing scoped account reset:', cause);
    }
    return response(404, { error: 'આ code માટે District/Block profile મળ્યું નથી. Create Loginથી account બનાવો.' });
  }
  const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(profile.id);
  const failure = resetFailureReason(
    profile,
    authUserError ? null : authUserData.user,
    targetRole,
    code as string,
    new URL(url).hostname,
  );
  if (failure) {
    try {
      await audit(profile.id, 'failed', failure);
      await auditCentral(profile.id, 'failed', failure);
    } catch (cause) {
      console.error('Unable to audit scoped account reset validation failure:', cause);
    }
    if (failure === 'profile_inactive') {
      return response(409, { error: 'District/Block profile inactive છે; કોઈ password બદલ્યો નથી.' });
    }
    return response(409, { error: 'Auth user અને District/Block profile/scope મેળ ખાતા નથી; કોઈ password બદલ્યો નથી.' });
  }

  let temporaryCredential;
  try {
    temporaryCredential = resetTemporaryPassword(
      temporaryPassword(),
      Deno.env.get('ADMIN_TEMPORARY_PASSWORD'),
    );
  } catch (cause) {
    console.error('Configured scoped reset password does not meet the required complexity:', cause);
    try {
      await audit(profile.id, 'failed', 'password_config_invalid');
      await auditCentral(profile.id, 'failed', 'password_config_invalid');
    } catch (auditError) {
      console.error('Unable to audit scoped reset password configuration failure:', auditError);
    }
    return response(500, { error: 'Server password-reset configuration is invalid; no password was changed.' });
  }
  const password = temporaryCredential.password;
  let passwordError;
  try {
    ({ error: passwordError } = await admin.auth.admin.updateUserById(profile.id, { password }));
  } catch (cause) {
    console.error('Scoped Auth reset outcome is unknown:', cause);
    try {
      await audit(profile.id, 'failed', 'auth_reset_outcome_unknown');
      await auditCentral(profile.id, 'failed', 'auth_reset_outcome_unknown');
    } catch (auditError) {
      console.error('Unable to audit unknown scoped reset outcome:', auditError);
    }
    return response(502, {
      error: 'Auth reset requestનો response મળ્યો નથી; password બદલાયો હોઈ શકે છે. ફરી reset ન કરો; Auth, profile અને audit સ્થિતિ verify કરો.',
      outcomeUnknown: true,
    });
  }
  if (passwordError) {
    try {
      await audit(profile.id, 'failed', 'auth_password_update_failed');
      await auditCentral(profile.id, 'failed', 'auth_password_update_failed');
    } catch (cause) {
      console.error('Unable to audit scoped password update failure:', cause);
    }
    console.error('Supabase Auth rejected scoped password reset:', passwordError.message);
    return response(500, { error: 'Supabase Auth password reset નિષ્ફળ થયું; password દર્શાવ્યો નથી.' });
  }
  let flagQuery = admin.from('profiles')
    .update({ must_change_password: true })
    .eq('id', profile.id)
    .eq('role', targetRole)
    .eq('district_code', districtCode)
    .is('school_id', null)
    .eq('active', true);
  if (targetRole === 'block') flagQuery = flagQuery.eq('block_code', blockCode);
  else flagQuery = flagQuery.is('block_code', null);
  const { data: changedProfile, error: markError } = await flagQuery
    .select('id')
    .maybeSingle();
  if (markError || !changedProfile) {
    console.error('Scoped Auth password reset applied but first-login flag was not confirmed:', markError?.message || 'No profile updated.');
    try {
      await audit(profile.id, 'failed', 'password_change_flag_failed');
      await auditCentral(profile.id, 'failed', 'password_change_flag_failed');
    } catch (cause) {
      console.error('Unable to audit scoped password flag failure:', cause);
    }
    return response(500, {
      error: 'Password reset લાગુ થયું હોઈ શકે, પરંતુ ફરજિયાત password-change flagની પુષ્ટિ નથી. Credential બતાવ્યો નથી; ફરી reset પહેલાં Auth/profile તપાસો.',
      resetApplied: true,
    });
  }
  try {
    await audit(profile.id, 'success', 'reset_complete');
    await auditCentral(profile.id, 'success', 'reset_complete');
  } catch (cause) {
    console.error('Scoped password reset succeeded but audit insert failed:', cause);
    return response(500, {
      error: 'Password reset થયું પરંતુ audit log સાચવાયો નથી. સુરક્ષા માટે credential બતાવ્યો નથી; retry પહેલાં સ્થિતિ તપાસો.',
      resetApplied: true,
    });
  }
  if (!resetCanRevealCredential({
    authUpdated: !passwordError,
    firstLoginFlag: !markError && Boolean(changedProfile),
    auditSaved: true,
  })) {
    return response(500, {
      error: 'Password resetની તમામ સુરક્ષા ચકાસણી પૂર્ણ નથી; credential દર્શાવ્યો નથી.',
      resetApplied: true,
    });
  }
  return response(200, {
    role: targetRole,
    loginId: code,
    temporaryPassword: password,
    mustChangePassword: true,
    temporaryPasswordMode: temporaryCredential.mode,
  });
});
