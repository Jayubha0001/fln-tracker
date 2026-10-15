import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ProvisionedAccount = {
  schoolCode: string;
  schoolName: string;
  password: string;
};

type AccountOutcome = {
  schoolCode: string;
  schoolName: string;
  status: 'created' | 'already_exists' | 'failed' | 'unknown';
  reason?: string;
};

type AuthUserIndex = {
  byId: Map<string, { id: string; email: string }>;
  byEmail: Map<string, { id: string; email: string }>;
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

async function loadAuthUserIndex(adminClient: ReturnType<typeof createClient>): Promise<AuthUserIndex> {
  const byId = new Map<string, { id: string; email: string }>();
  const byEmail = new Map<string, { id: string; email: string }>();
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const user of data.users) {
      if (!user.email) continue;
      const indexedUser = { id: user.id, email: user.email.toLowerCase() };
      byId.set(indexedUser.id, indexedUser);
      byEmail.set(indexedUser.email, indexedUser);
    }
    if (data.users.length < perPage) break;
  }

  return { byId, byEmail };
}

function createTemporaryPassword() {
  const groups = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@$%*-_',
  ];
  const allCharacters = groups.join('');
  const random = new Uint32Array(24);
  crypto.getRandomValues(random);
  const characters = groups.map((group, index) => group[random[index] % group.length]);
  for (let index = groups.length; index < random.length; index += 1) {
    characters.push(allCharacters[random[index] % allCharacters.length]);
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = random[index] % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join('');
}

async function handleRequest(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return response(405, { error: 'માત્ર POST વિનંતી માન્ય છે.' });
  }

  const authorization = request.headers.get('Authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return response(401, { error: 'લૉગિન જરૂરી છે.' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    console.error('Supabase function secrets are not configured.');
    return response(500, { error: 'સર્વર configuration અધૂરી છે.' });
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authData.user) return response(401, { error: 'લૉગિન માન્ય નથી.' });

  const { data: caller, error: callerError } = await adminClient
    .from('profiles')
    .select('role, active')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (callerError) {
    console.error('Unable to verify caller role:', callerError.message);
    return response(500, { error: 'Admin અધિકાર ચકાસી શકાયા નથી.' });
  }
  if (caller?.role !== 'admin' || !caller.active) {
    return response(403, { error: 'આ કાર્ય માટે Admin અધિકાર જરૂરી છે.' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: 'Request body માન્ય JSON હોવો જોઈએ.' });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return response(400, { error: 'Request body માન્ય object હોવો જોઈએ.' });
  }
  const payload = body as { schoolId?: unknown; schoolIds?: unknown; createAllMissing?: unknown };

  const createAllMissing = payload.createAllMissing === true;
  const schoolId = typeof payload.schoolId === 'string' ? payload.schoolId : '';
  const schoolIds = Array.isArray(payload.schoolIds)
    && payload.schoolIds.every((id) => typeof id === 'string')
    ? payload.schoolIds as string[]
    : [];
  const selectionCount = Number(createAllMissing) + Number(Boolean(schoolId)) + Number(schoolIds.length > 0);
  if (selectionCount !== 1) {
    return response(400, { error: 'એક schoolId, schoolIds batch, અથવા createAllMissing પસંદ કરો.' });
  }
  if (schoolIds.length > 100 || new Set(schoolIds).size !== schoolIds.length) {
    return response(400, { error: 'schoolIds batch 1થી 100 unique IDsનું હોવું જોઈએ.' });
  }
  const { error: auditSchemaError } = await adminClient.from('admin_account_audit').select('id').limit(0);
  if (auditSchemaError) {
    console.error('Central account audit schema is unavailable:', auditSchemaError.message);
    return response(503, {
      error: 'admin_account_audit migration 202610150001_central_login_management.sql યોગ્ય Supabase project પર લાગુ નથી અથવા API schema cache જૂનો છે. કોઈ account create કરાયો નથી.',
    });
  }

  const { data: schools, error: schoolsError } = await adminClient
    .from('schools')
    .select('id, code, name, active')
    .eq('active', true)
    .order('code');
  if (schoolsError) {
    console.error('Unable to load active schools:', schoolsError.message);
    return response(500, { error: 'સક્રિય શાળાઓ લોડ થઈ શકી નથી.' });
  }

  const targets = createAllMissing
    ? schools || []
    : (schools || []).filter((school) => schoolIds.length
      ? schoolIds.includes(school.id)
      : school.id === schoolId);
  if (!targets.length) {
    return response(404, { error: 'સક્રિય શાળા મળી નથી.' });
  }
  if (schoolIds.length && targets.length !== schoolIds.length) {
    return response(404, { error: 'Batchમાંની એક અથવા વધુ શાળા સક્રિય નથી અથવા મળી નથી.' });
  }

  const { data: existingProfiles, error: profilesError } = await adminClient
    .from('profiles')
    .select('id, email, school_id')
    .eq('role', 'school');
  if (profilesError) {
    console.error('Unable to check existing school profiles:', profilesError.message);
    return response(500, { error: 'હાલના school accounts ચકાસી શકાયા નથી.' });
  }

  let projectRef = '';
  try {
    projectRef = new URL(url).hostname.split('.')[0];
  } catch {
    return response(500, { error: 'Supabase project URL માન્ય નથી.' });
  }
  async function audit(
    school: { id: string; code: string },
    profileId: string | null,
    result: 'success' | 'failed',
    detailCode: string,
  ) {
    const schoolCode = String(school.code).trim();
    const { error } = await adminClient.from('admin_account_audit').insert({
      actor_id: authData.user.id,
      account_type: 'school',
      target_profile_id: profileId,
      district_code: /^\d{11}$/.test(schoolCode) ? schoolCode.slice(0, 4) : null,
      block_code: /^\d{11}$/.test(schoolCode) ? schoolCode.slice(0, 6) : null,
      school_id: school.id,
      result,
      detail_code: detailCode,
    });
    if (error) throw error;
  }
  const validTargets = targets.filter((school) => /^\d{11}$/.test(String(school.code).trim()));
  let authUsers: AuthUserIndex = { byId: new Map(), byEmail: new Map() };
  if (validTargets.length) {
    try {
      authUsers = await loadAuthUserIndex(adminClient);
    } catch (cause) {
      console.error('Unable to check existing Auth users before provisioning:', cause);
      return response(500, {
        error: 'હાલના Auth users સુરક્ષિત રીતે ચકાસી શકાયા નથી; કોઈ નવો account બનાવ્યો નથી.',
      });
    }
  }

  const profilesBySchoolId = new Map((existingProfiles || []).map((profile) => [profile.school_id, profile]));
  const profilesByAuthId = new Map((existingProfiles || []).map((profile) => [profile.id, profile]));
  const eligible = [];
  const outcomes: AccountOutcome[] = [];
  for (const school of targets) {
    const schoolCode = String(school.code).trim();
    if (!/^\d{11}$/.test(schoolCode)) {
      await audit(school, null, 'failed', 'invalid_school_code');
      outcomes.push({
        schoolCode: school.code,
        schoolName: school.name,
        status: 'failed',
        reason: 'School Code / Login ID 11 અંકનો હોવો જોઈએ.',
      });
      continue;
    }

    const email = `school-${schoolCode}@${projectRef}.supabase.co`.toLowerCase();
    const profile = profilesBySchoolId.get(school.id);
    const authUser = authUsers.byEmail.get(email);
    if (profile) {
      const profileAuthUser = authUsers.byId.get(profile.id);
      if (profileAuthUser?.email === email && authUser?.id === profile.id) {
        await audit(school, profile.id, 'failed', 'profile_already_exists');
        outcomes.push({
          schoolCode: school.code,
          schoolName: school.name,
          status: 'already_exists',
        });
      } else {
        await audit(school, profile.id, 'failed', 'auth_profile_mismatch');
        outcomes.push({
          schoolCode: school.code,
          schoolName: school.name,
          status: 'failed',
          reason: 'આ SchoolId માટે profile છે, પરંતુ તેની સાથેનો Auth user/login ID મેળ ખાતો નથી. કોઈ account બદલ્યો કે નવો બનાવ્યો નથી; Supabase Auth અને profiles ચકાસો.',
        });
      }
      continue;
    }

    const authUserProfile = authUser ? profilesByAuthId.get(authUser.id) : null;
    if (authUser) {
      await audit(school, null, 'failed', 'auth_user_conflict');
      outcomes.push({
        schoolCode: school.code,
        schoolName: school.name,
        status: 'failed',
        reason: authUserProfile
          ? 'આ Login IDનો Auth user બીજા profile સાથે જોડાયેલો છે. કોઈ duplicate account બનાવ્યો નથી; Supabase Auth અને profiles ચકાસો.'
          : 'આ Login IDનો Auth user પહેલેથી છે, પરંતુ school profile મળ્યો નથી. કોઈ duplicate account બનાવ્યો નથી; profile reconcile કર્યા પછી જ ફરી પ્રયાસ કરો.',
      });
      continue;
    }

    eligible.push(school);
  }

  if (!eligible.length) {
    return response(200, {
      skippedExisting: outcomes
        .filter((outcome) => outcome.status === 'already_exists')
        .map((outcome) => outcome.schoolCode),
      created: [],
      failed: outcomes.filter((outcome) => outcome.status === 'failed'),
      outcomes,
    });
  }
  if (eligible.length > 100) {
    return response(400, { error: 'એક function requestમાં 100થી વધુ નવા accounts નહીં બને. schoolIds batches મોકલો.' });
  }

  const created: ProvisionedAccount[] = [];
  for (const school of eligible) {
    const email = `school-${String(school.code).trim()}@${projectRef}.supabase.co`;
    const password = createTemporaryPassword();
    let createdUserId = '';
    try {
      const { data, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {},
      });
      if (createError || !data.user) {
        console.error(`Unable to create Auth account for school ${school.code}:`, createError?.message || 'No user returned.');
        outcomes.push({
          schoolCode: school.code,
          schoolName: school.name,
          status: 'failed',
          reason: 'Auth account બન્યો નથી. Auth email conflict હોય તો existing user/profileને verify કરીને reconcile કરો; કોઈ existing user બદલાયો નથી.',
        });
        continue;
      }
      createdUserId = data.user.id;
    } catch (cause) {
      console.error(`Auth account creation request failed for school ${school.code}:`, cause);
      outcomes.push({
        schoolCode: school.code,
        schoolName: school.name,
        status: 'unknown',
        reason: 'Auth create requestનો response મળ્યો નથી. ફરી પ્રયાસ કરતાં પહેલાં Auth અને profilesમાં account સ્થિતિ verify કરો.',
      });
      await audit(school, null, 'failed', 'auth_create_outcome_unknown');
      continue;
    }

    let profileError;
    try {
      ({ error: profileError } = await adminClient.from('profiles').insert({
        id: createdUserId,
        email,
        role: 'school',
        school_id: school.id,
        active: true,
        must_change_password: true,
      }));
    } catch (cause) {
      console.error(`Unable to save profile for newly created school account ${school.code}:`, cause);
      profileError = { message: 'Profile insert request failed.' };
    }
    if (profileError) {
      console.error(`Unable to create profile for school ${school.code}:`, profileError.message);
      outcomes.push({
        schoolCode: school.code,
        schoolName: school.name,
        status: 'failed',
        reason: 'Auth user બની ગયો, પરંતુ profile સાચવી શકાયી નથી. User delete કરાયો નથી; Supabase Admin દ્વારા profile reconcile કરો.',
      });
      await audit(school, null, 'failed', 'profile_insert_failed');
      continue;
    }

    const provisioned = {
      schoolCode: school.code,
      schoolName: school.name,
      password,
    };
    try {
      await audit(school, createdUserId, 'success', 'account_created');
    } catch (cause) {
      console.error(`Central account audit failed after creating school ${school.code}:`, cause);
      outcomes.push({
        schoolCode: school.code,
        schoolName: school.name,
        status: 'unknown',
        reason: 'Auth અને profile account બન્યા હોઈ શકે, પણ audit પુષ્ટિ નથી. Password દર્શાવ્યો નથી; ફરી પ્રયાસ પહેલાં સ્થિતિ તપાસો.',
      });
      continue;
    }
    created.push(provisioned);
    outcomes.push({
      schoolCode: school.code,
      schoolName: school.name,
      status: 'created',
    });
  }

  const failed = outcomes.filter((outcome) => outcome.status === 'failed');
  return response(200, {
    created,
    skippedExisting: outcomes
      .filter((outcome) => outcome.status === 'already_exists')
      .map((outcome) => outcome.schoolCode),
    failed,
    outcomes,
    loginMethod: 'School ID અને આપેલો one-time password',
  });
}

Deno.serve(async (request) => {
  try {
    return await handleRequest(request);
  } catch (cause) {
    console.error('Unexpected school-account provisioning failure:', cause);
    return response(500, { error: 'School account request server પર નિષ્ફળ થઈ. Supabase Edge Function logs તપાસો.' });
  }
});
