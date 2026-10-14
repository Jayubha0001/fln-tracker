import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as XLSX from 'npm:@e965/xlsx@0.20.3';
import { buildReportMetrics } from '../_shared/reportMetrics.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const PAGE_SIZE = 500;
const MAX_REPORT_ROWS = 50000;
const MAX_RANGE_DAYS = 92;
const GRADES = ['B', '1', '2'];

type Filters = {
  startDate: string;
  endDate: string;
  schoolId?: string;
  schoolCode?: string;
  district?: string;
  block?: string;
  dhoran?: string;
  month?: string;
};

type School = {
  id: string;
  code: string;
  name: string;
  district: string;
  block: string;
};

type Entry = {
  student_id: string;
  school_id: string;
  month: string;
  dhoran: string;
  assessment_date: string | null;
  updated_at: string;
  answers: Record<string, boolean>;
  student: { name: string };
  school: School;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

function nextDate(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function validateFilters(value: unknown): Filters | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'Filters જરૂરી છે.';
  const filters = value as Partial<Filters>;
  if (!validDate(filters.startDate) || !validDate(filters.endDate) || filters.startDate > filters.endDate) {
    return 'Start/end date માન્ય નથી.';
  }
  const days = (Date.parse(`${filters.endDate}T00:00:00.000Z`) - Date.parse(`${filters.startDate}T00:00:00.000Z`)) / 86400000;
  if (days > MAX_RANGE_DAYS) return `એક reportમાં વધુમાં વધુ ${MAX_RANGE_DAYS} દિવસ પસંદ કરો.`;
  if (filters.dhoran && !GRADES.includes(filters.dhoran)) return 'ધોરણ B, 1 અથવા 2 પસંદ કરો.';
  if (filters.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.month)) return 'Assessment month YYYY-MM હોવો જોઈએ.';
  if (filters.schoolCode && !/^\d{11}$/.test(filters.schoolCode.trim())) return 'School Code 11 અંકનો હોવો જોઈએ.';
  if (filters.schoolId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filters.schoolId)) {
    return 'School UUID માન્ય નથી.';
  }
  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    schoolId: filters.schoolId,
    schoolCode: typeof filters.schoolCode === 'string' ? filters.schoolCode.trim() : '',
    district: typeof filters.district === 'string' ? filters.district.trim() : '',
    block: typeof filters.block === 'string' ? filters.block.trim() : '',
    dhoran: filters.dhoran,
    month: filters.month,
  };
}

async function loadRows(query: any, pageSize = 1000, maxRows = Number.POSITIVE_INFINITY) {
  const rows: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (rows.length > maxRows) throw new Error(`REPORT_TOO_LARGE:${maxRows}`);
    if (!data || data.length < pageSize) return rows;
  }
}

async function buildReport(client: ReturnType<typeof createClient>, filters: Filters) {
  const schoolQuery = client.from('schools')
    .select('id,code,name,district,block')
    .order('district').order('block').order('code');
  if (filters.schoolId) schoolQuery.eq('id', filters.schoolId);
  if (filters.schoolCode) schoolQuery.eq('code', filters.schoolCode);
  if (filters.district) schoolQuery.eq('district', filters.district);
  if (filters.block) schoolQuery.eq('block', filters.block);
  const schools = await loadRows(schoolQuery);
  const schoolMap = new Map((schools as School[]).map((school) => [school.id, school]));

  const rawEntries: any[] = [];
  const schoolIds = (schools as School[]).map((school) => school.id);
  for (let schoolOffset = 0; schoolOffset < schoolIds.length; schoolOffset += 300) {
    const schoolBatch = schoolIds.slice(schoolOffset, schoolOffset + 300);
    const entryQuery = client.from('entries')
      .select('student_id,school_id,month,dhoran,assessment_date,updated_at,answers')
      .in('school_id', schoolBatch)
      .gte('updated_at', `${filters.startDate}T00:00:00.000Z`)
      .lt('updated_at', `${nextDate(filters.endDate)}T00:00:00.000Z`)
      .order('updated_at', { ascending: true })
      .order('school_id')
      .order('student_id');
    if (filters.dhoran) entryQuery.eq('dhoran', filters.dhoran);
    if (filters.month) entryQuery.eq('month', filters.month);
    const batch = await loadRows(entryQuery, PAGE_SIZE, MAX_REPORT_ROWS - rawEntries.length);
    rawEntries.push(...batch);
  }
  rawEntries.sort((left, right) => left.updated_at.localeCompare(right.updated_at));
  const studentIds = [...new Set(rawEntries.map((entry) => entry.student_id))];
  const studentMap = new Map<string, { name: string; school_id: string }>();
  for (let offset = 0; offset < studentIds.length; offset += 500) {
    const ids = studentIds.slice(offset, offset + 500);
    const { data, error } = await client.from('students').select('id,name,school_id').in('id', ids);
    if (error) throw error;
    for (const student of data || []) studentMap.set(student.id, student);
  }
  const entries: Entry[] = rawEntries.flatMap((entry) => {
    const student = studentMap.get(entry.student_id);
    const school = schoolMap.get(entry.school_id);
    return student && school && student.school_id === school.id
      ? [{ ...entry, student: { name: student.name }, school }]
      : [];
  });

  const enrollmentBySchoolGrade = new Map<string, number>();
  const allSchools = (schools as School[]);
  for (let offset = 0; offset < allSchools.length; offset += 200) {
    const batch = allSchools.slice(offset, offset + 200);
    const ids = batch.map((item) => item.id);
    const studentQuery = client.from('students').select('school_id,dhoran').in('school_id', ids);
    if (filters.dhoran) studentQuery.eq('dhoran', filters.dhoran);
    const students = await loadRows(studentQuery, PAGE_SIZE);
    for (const student of students) {
      const key = `${student.school_id}:${student.dhoran}`;
      enrollmentBySchoolGrade.set(key, (enrollmentBySchoolGrade.get(key) || 0) + 1);
    }
  }

  const metrics = buildReportMetrics(
    allSchools,
    enrollmentBySchoolGrade,
    entries,
    filters.dhoran ? [filters.dhoran] : GRADES,
  );

  return {
    entries,
    ...metrics,
  };
}

function makeWorkbook(report: Awaited<ReturnType<typeof buildReport>>, filters: Filters) {
  const workbook = XLSX.utils.book_new();
  const statementCount = 30;
  const headers = [
    'School Code', 'School Name', 'District', 'Taluka', 'Student Name', 'Student UUID',
    'Grade', 'Assessment Date', 'Assessment Month', 'Saved At',
    ...Array.from({ length: statementCount }, (_, index) => `Outcome ${index + 1}`),
  ];
  const rows = (entries: Entry[]) => entries.map((entry) => [
    entry.school.code,
    entry.school.name,
    entry.school.district,
    entry.school.block,
    entry.student.name,
    entry.student_id,
    entry.dhoran,
    entry.assessment_date || '',
    entry.month,
    entry.updated_at,
    ...Array.from({ length: statementCount }, (_, index) => {
      const value = entry.answers?.[String(index + 1)];
      return value === undefined ? '' : value ? 'હા' : 'ના';
    }),
  ]);

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([headers, ...rows(report.entries)]),
    'Consolidated',
  );
  for (const grade of GRADES) {
    const gradeEntries = report.entries.filter((entry) => entry.dhoran === grade);
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([headers, ...rows(gradeEntries)]),
      `ધોરણ ${grade}`,
    );
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.schools.map((row) => ({
    'School Code': row.schoolCode,
    'School Name': row.schoolName,
    'District': row.district,
    'Taluka': row.taluka,
    'Enrolled': row.enrolled,
    'Submitted': row.submitted,
    'Pending': row.pending,
    'Completion %': row.completionPercent,
  }))), 'School status');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.outcomes.map((row) => ({
    'Grade': row.dhoran,
    'Learning Outcome': row.outcome,
    'Yes': row.yes,
    'No': row.no,
    'Answered': row.answered,
  }))), 'Learning outcomes');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.daily.map((row) => ({
    'Saved Date': row.date,
    'Submitted Entries': row.submitted,
  }))), 'Day-wise');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { Metric: 'Schools', Value: report.totals.schools },
    { Metric: 'Enrolled', Value: report.totals.enrolled },
    { Metric: 'Submitted entries', Value: report.totals.submitted },
    { Metric: 'Pending', Value: report.totals.pending },
    { Metric: 'Completion percent', Value: report.totals.completionPercent },
    { Metric: 'Submission timestamp date filter', Value: `${filters.startDate} to ${filters.endDate}` },
    { Metric: 'Assessment date', Value: 'Separate column; historical NULL means unknown.' },
  ]), 'Totals');

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'માત્ર POST વિનંતી માન્ય છે.' });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse(401, { error: 'Admin login જરૂરી છે.' });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    console.error('Admin report function secrets are missing.');
    return jsonResponse(500, { error: 'Server configuration અધૂરી છે.' });
  }

  const serviceClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await serviceClient.auth.getUser(token);
  if (authError || !authData.user) return jsonResponse(401, { error: 'Admin session માન્ય નથી.' });
  const { data: profile, error: profileError } = await serviceClient.from('profiles')
    .select('role,active').eq('id', authData.user.id).maybeSingle();
  if (profileError) {
    console.error('Admin report authorization lookup failed:', profileError.message);
    return jsonResponse(500, { error: 'Admin અધિકાર ચકાસી શકાયા નથી.' });
  }
  if (profile?.role !== 'admin' || !profile.active) return jsonResponse(403, { error: 'સક્રિય Admin અધિકાર જરૂરી છે.' });

  const userClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  let body: { action?: unknown; filters?: unknown; page?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Request માન્ય JSON નથી.' });
  }
  const filters = validateFilters(body.filters);
  if (typeof filters === 'string') return jsonResponse(400, { error: filters });

  try {
    const report = await buildReport(userClient, filters);
    if (body.action === 'export') {
      const workbook = makeWorkbook(report, filters);
      return new Response(workbook, {
        headers: {
          ...corsHeaders,
          'Cache-Control': 'no-store',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="fln-admin-${filters.startDate}-${filters.endDate}.xlsx"`,
        },
      });
    }
    if (body.action !== 'report') return jsonResponse(400, { error: 'action report અથવા export હોવું જોઈએ.' });

    const page = Number.isInteger(body.page) && Number(body.page) >= 1 ? Number(body.page) : 1;
    const pageSize = 100;
    return jsonResponse(200, {
      filters,
      totals: report.totals,
      daily: report.daily,
      outcomes: report.outcomes,
      schools: report.schools.slice((page - 1) * pageSize, page * pageSize),
      schoolPage: page,
      schoolPageSize: pageSize,
      schoolPageCount: Math.max(1, Math.ceil(report.schools.length / pageSize)),
      entries: report.entries.slice((page - 1) * pageSize, page * pageSize).map((entry) => ({
        schoolCode: entry.school.code,
        schoolName: entry.school.name,
        district: entry.school.district,
        taluka: entry.school.block,
        student: entry.student.name,
        studentId: entry.student_id,
        dhoran: entry.dhoran,
        assessmentDate: entry.assessment_date,
        month: entry.month,
        savedAt: entry.updated_at,
        answers: entry.answers,
      })),
      entryPageCount: Math.max(1, Math.ceil(report.entries.length / pageSize)),
      page,
    });
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('REPORT_TOO_LARGE:')) {
      return jsonResponse(413, {
        error: `આ filterમાં ${MAX_REPORT_ROWS.toLocaleString()}થી વધુ entries છે. નાની date range, month, grade અથવા school filter પસંદ કરો.`,
        maxRows: MAX_REPORT_ROWS,
      });
    }
    console.error('Admin report query failed:', cause);
    return jsonResponse(500, { error: 'Admin report બનાવી શકાયો નથી; Edge Function logs તપાસો.' });
  }
});
