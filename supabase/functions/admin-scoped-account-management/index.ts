import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  accountStatus,
  isActiveAdmin,
  resetCanRevealCredential,
  resetFailureReason,
  scopedAccountKey,
  validScopedTarget,
} from '../_shared/scopedAccountManagement.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const PAGE_SIZE = 1000;
const AUTH_LOOKUP_CONCURRENCY = 20;

type Role = 'district' | 'block';
type Profile = {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  school_id: string | null;
  district_code: string | null;
  block_code: string | null;
  must_change_password: boolean;
};

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

async function loadRows(query: any) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function addName(map: Map<string, Set<string>>, code: string, name: string | null) {
  if (!name?.trim()) return;
  const names = map.get(code) || new Set<string>();
  names.add(name.trim());
  map.set(code, names);
}

function namesFor(map: Map<string, Set<string>>, code: string) {
  return [...(map.get(code) || [])].sort((left, right) => left.localeCompare(right)).join(', ');
}

async function listAccounts(admin: ReturnType<typeof createClient>, projectRef: string) {
  const schoolRows = await loadRows(admin.from('schools')
    .select('code,district,block,active')
    .order('code'));
  const districtNames = new Map<string, Set<string>>();
  const blockNames = new Map<string, Set<string>>();
  const districtCodes = new Set<string>();
  const blockCodes = new Set<string>();
  for (const school of schoolRows) {
    if (!/^\d{11}$/.test(school.code)) continue;
    const districtCode = school.code.slice(0, 4);
    const blockCode = school.code.slice(0, 6);
    districtCodes.add(districtCode);
    blockCodes.add(blockCode);
    addName(districtNames, districtCode, school.district);
    addName(blockNames, blockCode, school.block);
  }

  const profiles = await loadRows(admin.from('profiles')
    .select('id,email,role,active,school_id,district_code,block_code,must_change_password')
    .in('role', ['district', 'block'])
    .order('role').order('district_code').order('block_code'));

  for (const profile of profiles as Profile[]) {
    if (profile.role === 'district' && /^\d{4}$/.test(profile.district_code || '')) {
      districtCodes.add(profile.district_code as string);
    } else if (profile.role === 'block'
      && /^\d{6}$/.test(profile.block_code || '')
      && profile.block_code?.slice(0, 4) === profile.district_code) {
      blockCodes.add(profile.block_code);
      districtCodes.add(profile.district_code as string);
    }
  }

  const authByProfileId = new Map<string, { user: any; lookupFailed: boolean }>();
  const scopedProfiles = profiles as Profile[];
  for (let offset = 0; offset < scopedProfiles.length; offset += AUTH_LOOKUP_CONCURRENCY) {
    const batch = scopedProfiles.slice(offset, offset + AUTH_LOOKUP_CONCURRENCY);
    const results = await Promise.all(batch.map(async (profile) => {
      const { data, error } = await admin.auth.admin.getUserById(profile.id);
      return {
        id: profile.id,
        user: data.user || null,
        lookupFailed: Boolean(error),
      };
    }));
    for (const result of results) {
      authByProfileId.set(result.id, { user: result.user, lookupFailed: result.lookupFailed });
    }
  }

  const profileByKey = new Map<string, Profile[]>();
  for (const profile of scopedProfiles) {
    const key = profile.role === 'district'
      ? scopedAccountKey('district', profile.district_code, null)
      : scopedAccountKey('block', profile.district_code, profile.block_code);
    profileByKey.set(key, [...(profileByKey.get(key) || []), profile]);
  }
  const projectHost = `${projectRef}.supabase.co`;
  const districtAccounts = [...districtCodes].sort().map((code) => {
    const matches = profileByKey.get(scopedAccountKey('district', code, null)) || [];
    const profile = matches.length === 1 ? matches[0] : null;
    const auth = profile ? authByProfileId.get(profile.id) : null;
    const expectedEmail = `district-${code}@${projectHost}`;
    const identityConsistent = !profile || (
      profile.role === 'district'
      && profile.school_id === null
      && profile.district_code === code
      && profile.block_code === null
      && auth?.user?.email?.toLowerCase() === profile.email.toLowerCase()
      && profile.email.toLowerCase() === expectedEmail.toLowerCase()
    );
    return {
      districtCode: code,
      districtName: namesFor(districtNames, code),
      loginId: code,
      accountStatus: matches.length > 1
        ? 'needs_attention'
        : !identityConsistent
          ? 'needs_attention'
          : accountStatus(profile, auth?.user, auth?.lookupFailed || false),
      lastUpdated: auth?.user?.updated_at || null,
      mustChangePassword: profile?.must_change_password || false,
      identityConsistent,
    };
  });
  const blockAccounts = [...blockCodes].sort().map((code) => {
    const districtCode = code.slice(0, 4);
    const matches = profileByKey.get(scopedAccountKey('block', districtCode, code)) || [];
    const profile = matches.length === 1 ? matches[0] : null;
    const auth = profile ? authByProfileId.get(profile.id) : null;
    const expectedEmail = `block-${code}@${projectHost}`;
    const identityConsistent = !profile || (
      profile.role === 'block'
      && profile.school_id === null
      && profile.district_code === districtCode
      && profile.block_code === code
      && auth?.user?.email?.toLowerCase() === profile.email.toLowerCase()
      && profile.email.toLowerCase() === expectedEmail.toLowerCase()
    );
    return {
      districtCode,
      districtName: namesFor(districtNames, districtCode),
      blockCode: code,
      blockName: namesFor(blockNames, code),
      loginId: code,
      accountStatus: matches.length > 1
        ? 'needs_attention'
        : !identityConsistent
          ? 'needs_attention'
          : accountStatus(profile, auth?.user, auth?.lookupFailed || false),
      lastUpdated: auth?.user?.updated_at || null,
      mustChangePassword: profile?.must_change_password || false,
      identityConsistent,
    };
  });
  return { districts: districtAccounts, blocks: blockAccounts };
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

  let payload: { action?: unknown; role?: unknown; code?: unknown };
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: 'Request માન્ય JSON નથી.' });
  }

  if (payload.action === 'list') {
    try {
      const projectRef = new URL(url).hostname.split('.')[0];
      return response(200, await listAccounts(admin, projectRef));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'અજાણી server ભૂલ.';
      console.error('Scoped account listing failed:', message);
      return response(500, { error: `District/Block accounts લોડ થઈ શક્યા નથી: ${message}` });
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
    return response(503, { error: 'scoped_password_reset_audit migration લાગુ નથી અથવા schema cache જૂનો છે; કોઈ password reset કરાયો નથી.' });
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

  const profileQuery = admin.from('profiles')
    .select('id,email,role,active,school_id,district_code,block_code,must_change_password')
    .eq('role', targetRole);
  if (targetRole === 'district') profileQuery.eq('district_code', code as string).is('block_code', null);
  else profileQuery.eq('district_code', districtCode).eq('block_code', code as string);
  const { data: profile, error: profileError } = await profileQuery.maybeSingle();
  if (profileError) {
    console.error('Unable to locate scoped password reset target:', profileError.message);
    return response(500, { error: 'District/Block account ચકાસી શકાયું નથી.' });
  }
  if (!profile) {
    try {
      await audit(null, 'failed', 'profile_missing');
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
    } catch (cause) {
      console.error('Unable to audit scoped account reset validation failure:', cause);
    }
    if (failure === 'profile_inactive') {
      return response(409, { error: 'District/Block profile inactive છે; કોઈ password બદલ્યો નથી.' });
    }
    return response(409, { error: 'Auth user અને District/Block profile/scope મેળ ખાતા નથી; કોઈ password બદલ્યો નથી.' });
  }

  const password = temporaryPassword();
  const { error: passwordError } = await admin.auth.admin.updateUserById(profile.id, { password });
  if (passwordError) {
    try {
      await audit(profile.id, 'failed', 'auth_password_update_failed');
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
  });
});
