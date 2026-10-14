import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_BATCH = 500;

type ImportRow = {
  rowNumber: number;
  district: string;
  block: string;
  clusterId: string;
  cluster: string;
  schoolId: string;
  school: string;
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

function validateRow(row: ImportRow) {
  if (!/^\d{11}$/.test(row.schoolId)) return 'SchoolId 11 અંકનો numeric text હોવો જોઈએ.';
  if (typeof row.district !== 'string' || !row.district.trim()) return 'District ખાલી છે.';
  if (typeof row.block !== 'string' || !row.block.trim()) return 'Block ખાલી છે.';
  if (typeof row.clusterId !== 'string' || !row.clusterId.trim()) return 'ClusterId ખાલી છે.';
  if (typeof row.cluster !== 'string' || !row.cluster.trim()) return 'Cluster ખાલી છે.';
  if (typeof row.school !== 'string' || !row.school.trim()) return 'School ખાલી છે.';
  return '';
}

Deno.serve(async (request) => {
  try {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'માત્ર POST વિનંતી માન્ય છે.' });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return response(401, { error: 'Admin login જરૂરી છે.' });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    console.error('Admin school import secrets are missing.');
    return response(500, { error: 'Server configuration અધૂરી છે.' });
  }
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return response(401, { error: 'Admin session માન્ય નથી.' });
  const { data: actor, error: actorError } = await admin.from('profiles')
    .select('role,active').eq('id', authData.user.id).maybeSingle();
  if (actorError) {
    console.error('Unable to verify school-import admin:', actorError.message);
    return response(500, { error: 'Admin અધિકાર ચકાસી શકાયા નથી.' });
  }
  if (actor?.role !== 'admin' || !actor.active) return response(403, { error: 'સક્રિય Admin અધિકાર જરૂરી છે.' });

  let payload: { action?: unknown; rows?: unknown };
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: 'Request માન્ય JSON નથી.' });
  }
  if (payload.action !== 'preview' && payload.action !== 'import') return response(400, { error: 'action preview અથવા import હોવો જોઈએ.' });
  if (!Array.isArray(payload.rows) || payload.rows.length < 1 || payload.rows.length > MAX_BATCH) {
    return response(400, { error: `દરેક batchમાં 1થી ${MAX_BATCH} rows જ મોકલો.` });
  }
  const rows = payload.rows as ImportRow[];
  const seen = new Set<string>();
  const outcomes = rows.map((row) => {
    const invalidReason = validateRow(row);
    if (invalidReason) return { rowNumber: row.rowNumber, schoolId: row.schoolId, status: 'invalid', reason: invalidReason };
    if (seen.has(row.schoolId)) return { rowNumber: row.rowNumber, schoolId: row.schoolId, status: 'duplicate_file', reason: 'આ SchoolId uploadમાં એકથી વધુ વખત છે.' };
    seen.add(row.schoolId);
    return { rowNumber: row.rowNumber, schoolId: row.schoolId, status: 'new', reason: '' };
  });
  const candidates = outcomes.filter((outcome) => outcome.status === 'new');
  const ids = candidates.map((item) => item.schoolId);
  const existingCodes = new Set<string>();
  for (let offset = 0; offset < ids.length; offset += 500) {
    const { data, error } = await admin.from('schools').select('code').in('code', ids.slice(offset, offset + 500));
    if (error) {
      console.error('Existing school-code check failed:', error.message);
      return response(500, { error: `હાલના SchoolId ચકાસી શકાયા નથી: ${error.message}` });
    }
    for (const item of data || []) existingCodes.add(item.code);
  }
  for (const outcome of candidates) {
    if (existingCodes.has(outcome.schoolId)) {
      outcome.status = 'existing';
      outcome.reason = 'આ SchoolId schools.codeમાં પહેલેથી છે; existing data બદલાયું નથી.';
    }
  }
  if (payload.action === 'preview') return response(200, { outcomes });

  const newOutcomes = outcomes.filter((item) => item.status === 'new');
  const rowsById = new Map(rows.map((row) => [row.schoolId, row]));
  const inserted = new Set<string>();
  const racedExisting = new Set<string>();
  for (let offset = 0; offset < newOutcomes.length; offset += MAX_BATCH) {
    const batch = newOutcomes.slice(offset, offset + MAX_BATCH);
    const records = batch.map((item) => {
      const row = rowsById.get(item.schoolId) as ImportRow;
      return {
        district: row.district.trim(),
        block: row.block.trim(),
        cluster_id: row.clusterId.trim(),
        cluster: row.cluster.trim(),
        code: row.schoolId,
        name: row.school.trim(),
        active: true,
      };
    });
    const { data, error } = await admin.from('schools')
      .upsert(records, { onConflict: 'code', ignoreDuplicates: true })
      .select('code');
    if (error) {
      console.error('School import batch failed:', error.message);
      return response(500, {
        error: `School import batch નિષ્ફળ: ${error.message}. પહેલાના batches સફળ થયા હોઈ શકે; retry પહેલાં exact SchoolId duplicates ચકાસો.`,
        outcomes,
      });
    }
    for (const item of data || []) inserted.add(item.code);
    for (const item of batch) if (!inserted.has(item.schoolId)) racedExisting.add(item.schoolId);
  }
  for (const outcome of newOutcomes) {
    if (inserted.has(outcome.schoolId)) {
      outcome.status = 'inserted';
      outcome.reason = '';
    } else if (racedExisting.has(outcome.schoolId)) {
      outcome.status = 'existing';
      outcome.reason = 'બીજી requestએ આ SchoolId પહેલાં ઉમેર્યો; કોઈ record overwrite થયો નથી.';
    }
  }
  return response(200, { outcomes });
  } catch (cause) {
    console.error('Unexpected admin school import failure:', cause);
    return response(500, { error: 'School import server error. અગાઉના batches ઉમેરાયા હોઈ શકે; retry કરતાં પહેલાં Preview કરો.' });
  }
});
