import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function temporaryPassword() {
  const groups = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@$%*-_',
  ];
  const alphabet = groups.join('');
  const random = new Uint32Array(32);
  crypto.getRandomValues(random);
  const characters = groups.map((group, index) => group[random[index] % group.length]);
  for (let index = groups.length; index < random.length; index += 1) {
    characters.push(alphabet[random[index] % alphabet.length]);
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = random[index] % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'માત્ર POST વિનંતી માન્ય છે.' });

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return response(401, { error: 'Admin login જરૂરી છે.' });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    console.error('Supabase password reset function secrets are missing.');
    return response(500, { error: 'Server configuration અધૂરી છે.' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return response(401, { error: 'Admin session માન્ય નથી.' });
  const actorId = authData.user.id;

  const { data: actor, error: actorError } = await admin
    .from('profiles')
    .select('role, active')
    .eq('id', actorId)
    .maybeSingle();
  if (actorError) {
    console.error('Unable to verify reset caller:', actorError.message);
    return response(500, { error: 'Admin અધિકાર ચકાસી શકાયા નથી.' });
  }
  if (actor?.role !== 'admin' || !actor.active) {
    return response(403, { error: 'Password reset માટે સક્રિય Admin અધિકાર જરૂરી છે.' });
  }

  let payload: { schoolId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: 'Request માન્ય JSON નથી.' });
  }
  if (typeof payload.schoolId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.schoolId)) {
    return response(400, { error: 'માન્ય school UUID આપો.' });
  }

  const { data: school, error: schoolError } = await admin
    .from('schools')
    .select('id, code, name, active')
    .eq('id', payload.schoolId)
    .maybeSingle();
  if (schoolError) {
    console.error('Unable to validate school for reset:', schoolError.message);
    return response(500, { error: 'School ચકાસી શકાતી નથી.' });
  }
  if (!school) return response(404, { error: 'શાળા મળી નથી.' });

  async function audit(result: 'success' | 'failed', detailCode: string | null) {
    const { error } = await admin.from('school_password_reset_audit').insert({
      school_id: school.id,
      actor_id: actorId,
      result,
      detail_code: detailCode,
    });
    if (error) throw error;
  }

  if (!school.active) {
    try {
      await audit('failed', 'school_inactive');
    } catch (auditError) {
      console.error('Unable to audit inactive-school reset attempt:', auditError);
    }
    return response(404, { error: 'સક્રિય શાળા મળી નથી.' });
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, role, school_id, active, must_change_password')
    .eq('school_id', school.id)
    .eq('role', 'school')
    .maybeSingle();
  if (profileError) {
    console.error('Unable to inspect school profile for password reset:', profileError.message);
    try {
      await audit('failed', 'profile_lookup_failed');
    } catch (auditError) {
      console.error('Unable to audit school profile lookup failure:', auditError);
    }
    return response(500, { error: 'School account તપાસી શકાતું નથી.' });
  }
  if (!profile || !profile.active || profile.school_id !== school.id) {
    try {
      await audit('failed', 'school_profile_missing_or_inactive');
    } catch (auditError) {
      console.error('Unable to audit missing school profile:', auditError);
    }
    return response(404, { error: 'આ school માટે સક્રિય school profile મળ્યું નથી; નવું Auth account બનાવ્યું નથી.' });
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id);
  if (userError || !userData.user || userData.user.email?.toLowerCase() !== profile.email.toLowerCase()) {
    try {
      await audit('failed', 'auth_profile_mismatch');
    } catch (auditError) {
      console.error('Unable to audit school reset validation failure:', auditError);
    }
    return response(409, { error: 'Auth user અને school profile મેળ ખાતા નથી; કોઈ password બદલ્યો નથી.' });
  }

  const password = temporaryPassword();
  const { error: resetError } = await admin.auth.admin.updateUserById(profile.id, { password });
  if (resetError) {
    try {
      await audit('failed', 'auth_password_update_failed');
    } catch (auditError) {
      console.error('Unable to audit Auth password update failure:', auditError);
    }
    console.error('Supabase Auth rejected school password reset:', resetError.message);
    return response(500, { error: 'Supabase Auth password reset નિષ્ફળ થયું; credential દર્શાવવામાં આવ્યો નથી.' });
  }

  const { error: markError } = await admin
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', profile.id)
    .eq('school_id', school.id)
    .eq('role', 'school')
    .eq('active', true);
  if (markError) {
    console.error('Password reset succeeded but mandatory password change could not be set:', markError.message);
    try {
      await audit('failed', 'password_change_flag_failed');
    } catch (auditError) {
      console.error('Unable to audit password-change flag failure:', auditError);
    }
    return response(500, {
      error: 'Password reset થયું પરંતુ ફરજિયાત password-change flag સેટ ન થયું. Credential દર્શાવ્યો નથી; ફરી પ્રયાસ કરતાં પહેલાં Auth અને profile સ્થિતિ તપાસો.',
      resetApplied: true,
    });
  }

  try {
    await audit('success', null);
  } catch (auditError) {
    console.error('Password reset succeeded but audit insert failed:', auditError);
    return response(500, {
      error: 'Password reset થયું, પરંતુ audit log સાચવાયો નથી. સુરક્ષા માટે credential દર્શાવાયો નથી; retry પહેલાં Auth/profile સ્થિતિ ચકાસો.',
      resetApplied: true,
    });
  }

  return response(200, {
    schoolCode: school.code,
    schoolName: school.name,
    loginId: school.code,
    temporaryPassword: password,
    mustChangePassword: true,
  });
});
