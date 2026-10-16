import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as XLSX from 'npm:@e965/xlsx@0.20.3';
import {
  assessmentCompletion,
  buildPendingStudents,
  buildFilteredReportMetrics,
  buildReportMetrics,
  deduplicateAssessmentEntries,
  filterAssessmentEntries,
} from '../_shared/reportMetrics.js';
import { GRADE_RULES } from '../_shared/assessmentRules.js';
import { buildSchoolYearRows, SCHOOL_YEAR_MONTHS } from '../_shared/schoolYearReport.js';
import { canAccessSchoolReport, reportScope } from '../_shared/reportAuthorization.js';

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
  status?: 'all' | 'complete' | 'incomplete' | 'pending';
};

type School = {
  id: string;
  code: string;
  name: string;
  district: string;
  block: string;
};

type SchoolMetric = ReturnType<typeof buildReportMetrics>['schools'][number];

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

type ReportScope = {
  role: 'admin' | 'district' | 'block' | 'school';
  districtCode?: string;
  blockCode?: string;
  schoolId?: string;
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
  if (filters.status && !['all', 'complete', 'incomplete', 'pending'].includes(filters.status)) {
    return 'Assessment status all, complete, incomplete અથવા pending હોવો જોઈએ.';
  }
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
    status: filters.status || 'all',
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

async function buildReport(client: ReturnType<typeof createClient>, filters: Filters, scope: ReportScope) {
  const schoolQuery = client.from('schools')
    .select('id,code,name,district,block')
    .order('district').order('block').order('code');
  if (scope.role === 'district') schoolQuery.like('code', `${scope.districtCode}%`);
  if (scope.role === 'block') schoolQuery.like('code', `${scope.blockCode}%`);
  if (scope.role === 'school') schoolQuery.eq('id', scope.schoolId);
  if (filters.schoolId) schoolQuery.eq('id', filters.schoolId);
  if (filters.schoolCode) schoolQuery.eq('code', filters.schoolCode);
  if (filters.district) schoolQuery.eq('district', filters.district);
  if (filters.block) schoolQuery.eq('block', filters.block);
  const schools = await loadRows(schoolQuery, PAGE_SIZE, MAX_REPORT_ROWS);
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
  const canonicalEntries = deduplicateAssessmentEntries(rawEntries);
  const studentIds = [...new Set(canonicalEntries.map((entry) => entry.student_id))];
  const studentMap = new Map<string, { name: string; school_id: string }>();
  for (let offset = 0; offset < studentIds.length; offset += 500) {
    const ids = studentIds.slice(offset, offset + 500);
    const { data, error } = await client.from('students').select('id,name,school_id').in('id', ids);
    if (error) throw error;
    for (const student of data || []) studentMap.set(student.id, student);
  }
  const entries: Entry[] = canonicalEntries.flatMap((entry) => {
    const student = studentMap.get(entry.student_id);
    const school = schoolMap.get(entry.school_id);
    return student && school && student.school_id === school.id
      ? [{ ...entry, student: { name: student.name }, school }]
      : [];
  });

  const enrollmentBySchoolGrade = new Map<string, number>();
  const enrolledStudents: { id: string; name: string; school_id: string; dhoran: string }[] = [];
  const allSchools = (schools as School[]);
  for (let offset = 0; offset < allSchools.length; offset += 200) {
    const batch = allSchools.slice(offset, offset + 200);
    const ids = batch.map((item) => item.id);
    const studentQuery = client.from('students').select('id,name,school_id,dhoran').in('school_id', ids);
    if (filters.dhoran) studentQuery.eq('dhoran', filters.dhoran);
    const students = await loadRows(
      studentQuery,
      PAGE_SIZE,
      MAX_REPORT_ROWS - enrolledStudents.length,
    );
    for (const student of students) {
      enrolledStudents.push(student);
      const key = `${student.school_id}:${student.dhoran}`;
      enrollmentBySchoolGrade.set(key, (enrollmentBySchoolGrade.get(key) || 0) + 1);
    }
  }

  const allMetrics = buildReportMetrics(
    allSchools,
    enrollmentBySchoolGrade,
    entries,
    filters.dhoran ? [filters.dhoran] : GRADES,
  );
  const pendingStudents = buildPendingStudents(
    allSchools,
    enrolledStudents,
    entries,
    filters.dhoran ? [filters.dhoran] : GRADES,
  );
  const visibleEntries = filterAssessmentEntries(entries, filters.status);
  const metrics = buildFilteredReportMetrics(
    allSchools,
    enrollmentBySchoolGrade,
    entries,
    pendingStudents,
    filters.dhoran ? [filters.dhoran] : GRADES,
    filters.status,
  );
  const monthlyCounts = new Map<string, {
    submitted: Set<string>;
    complete: number;
    incomplete: number;
  }>();
  for (const entry of visibleEntries) {
    const month = monthlyCounts.get(entry.month) || {
      submitted: new Set<string>(),
      complete: 0,
      incomplete: 0,
    };
    month.submitted.add(`${entry.school_id}:${entry.student_id}:${entry.dhoran}`);
    month[assessmentCompletion(entry) ? 'complete' : 'incomplete'] += 1;
    monthlyCounts.set(entry.month, month);
  }
  if (filters.status === 'pending') {
    monthlyCounts.clear();
    monthlyCounts.set(filters.month || 'All', { submitted: new Set(), complete: 0, incomplete: 0 });
  } else if (filters.month && !monthlyCounts.has(filters.month)) {
    monthlyCounts.set(filters.month, { submitted: new Set(), complete: 0, incomplete: 0 });
  }
  const monthly = [...monthlyCounts.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([month, counts]) => ({
      month,
      enrolled: metrics.totals.enrolled,
      submitted: counts.submitted.size,
      complete: counts.complete,
      incomplete: counts.incomplete,
      pending: filters.status === 'all'
        ? Math.max(0, allMetrics.totals.enrolled - counts.submitted.size)
        : 0,
    }));
  const districts = aggregateSchoolMetrics(metrics.schools, (school) => school.district);
  const blocks = aggregateSchoolMetrics(
    metrics.schools,
    (school) => `${school.district}\u0000${school.taluka}`,
    (school) => ({ district: school.district, block: school.taluka }),
  );

  return {
    entries: visibleEntries,
    pendingStudents: filters.status === 'all' || filters.status === 'pending' ? pendingStudents : [],
    monthly,
    districts,
    blocks,
    ...metrics,
  };
}

function aggregateSchoolMetrics(
  schools: SchoolMetric[],
  keyFor: (school: SchoolMetric) => string,
  labelsFor: (school: SchoolMetric) => Record<string, string> = (school) => ({ district: school.district }),
) {
  const grouped = new Map<string, Record<string, string | number>>();
  for (const school of schools) {
    const key = keyFor(school);
    const row = grouped.get(key) || {
      ...labelsFor(school),
      schools: 0,
      enrolled: 0,
      assessed: 0,
      submitted: 0,
      complete: 0,
      incomplete: 0,
      pending: 0,
    };
    row.schools = Number(row.schools) + 1;
    row.enrolled = Number(row.enrolled) + school.enrolled;
    row.assessed = Number(row.assessed) + school.assessed;
    row.submitted = Number(row.submitted) + school.submitted;
    row.complete = Number(row.complete) + school.complete;
    row.incomplete = Number(row.incomplete) + school.incomplete;
    row.pending = Number(row.pending) + school.pending;
    grouped.set(key, row);
  }
  return [...grouped.values()].map((row) => ({
    ...row,
    completionPercent: Number(row.enrolled)
      ? Math.round(Number(row.submitted) * 1000 / Number(row.enrolled)) / 10
      : 0,
  })).sort((left, right) =>
    String(left.district).localeCompare(String(right.district))
    || String(left.block || '').localeCompare(String(right.block || '')));
}

async function buildSchoolYearReport(client: ReturnType<typeof createClient>, schoolId: string, scope: ReportScope) {
  const { data: school, error: schoolError } = await client.from('schools')
    .select('id,code,name,district,block')
    .eq('id', schoolId)
    .maybeSingle();
  if (schoolError) throw schoolError;
  if (!school) return null;
  if (!canAccessSchoolReport(scope, school)) return null;

  const students = await loadRows(
    client.from('students').select('id,name,dhoran').eq('school_id', schoolId).order('name'),
    PAGE_SIZE,
    MAX_REPORT_ROWS,
  );
  const entries = await loadRows(
    client.from('entries')
      .select('student_id,school_id,month,dhoran,answers,updated_at')
      .eq('school_id', schoolId)
      .in('month', SCHOOL_YEAR_MONTHS.map((month) => month.key))
      .order('month')
      .order('student_id'),
    PAGE_SIZE,
    MAX_REPORT_ROWS,
  );
  const gradeRows = buildSchoolYearRows(students, entries);
  return { school, gradeRows };
}

function schoolYearWorkbook(report: NonNullable<Awaited<ReturnType<typeof buildSchoolYearReport>>>) {
  const workbook = XLSX.utils.book_new();
  const { school, gradeRows } = report;
  const actionPlanRows = SCHOOL_YEAR_MONTHS.map((month, index) => {
    const row: Record<string, string | number> = {
      'માસ': month.label,
      'શાળા કોડ': school.code,
      'શાળાનું નામ': school.name,
    };
    for (const grade of GRADES) {
      const result = gradeRows[grade][index];
      row[`${GRADE_RULES[grade].label} – નોંધાયેલા`] = result.enrolled;
      row[`${GRADE_RULES[grade].label} – સાચવેલી`] = result.saved;
      for (const category of ['U', 'P', 'N'] as const) {
        const column = `${GRADE_RULES[grade].label} – ${category === 'U' ? 'ઉદયમાન' : category === 'P' ? 'પ્રગતિશીલ' : 'નિપુણ'}`;
        row[`${column} (ગણતરી)`] = result[category];
        row[`${column} (%)`] = result.enrolled
          ? `${Math.round(result[category] * 1000 / result.enrolled) / 10}%`
          : '—';
      }
    }
    return row;
  });
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(actionPlanRows), 'FLN Action Plan');

  for (const grade of GRADES) {
    const threshold = GRADE_RULES[grade];
    const rows = gradeRows[grade].map((month) => ({
      'માસ': month.label,
      'ધોરણ': threshold.label,
      'નોંધાયેલા વિદ્યાર્થીઓ': month.enrolled,
      'સાચવેલી એન્ટ્રી': month.saved,
      'પૂર્ણ મૂલ્યાંકન': month.complete,
      'અપૂર્ણ એન્ટ્રી': month.incomplete,
      'બાકી': month.pending,
      [`ઉદયમાન (0 થી ${threshold.udayMax}) – સંખ્યા`]: month.U,
      'ઉદયમાન (%)': month.enrolled ? `${Math.round(month.U * 1000 / month.enrolled) / 10}%` : '—',
      'પ્રગતિશીલ – સંખ્યા': month.P,
      'પ્રગતિશીલ (%)': month.enrolled ? `${Math.round(month.P * 1000 / month.enrolled) / 10}%` : '—',
      [`નિપુણ (${threshold.nipunMin} થી ${threshold.statementIds.length}) – સંખ્યા`]: month.N,
      'નિપુણ (%)': month.enrolled ? `${Math.round(month.N * 1000 / month.enrolled) / 10}%` : '—',
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), `ધોરણ ${grade}`);
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { 'માહિતી': 'શાળા', 'વિગત': `${school.name} (${school.code})` },
    { 'માહિતી': 'જિલ્લો / તાલુકો', 'વિગત': `${school.district} / ${school.block}` },
    { 'માહિતી': 'અપૂર્ણ એન્ટ્રી', 'વિગત': 'બધા learning outcomesના હા/ના જવાબ ન હોય તેવી entry.' },
    { 'માહિતી': 'શ્રેણી ટકાવારીનો આધાર', 'વિગત': 'દરેક ધોરણના નોંધાયેલા વિદ્યાર્થીઓ; અધૂરા અને બાકી વિદ્યાર્થીઓ category countમાં આવતા નથી.' },
    ...GRADES.map((grade) => ({
      'માહિતી': GRADE_RULES[grade].label,
      'વિગત': `કુલ ${GRADE_RULES[grade].statementIds.length}; ઉદયમાન 0–${GRADE_RULES[grade].udayMax}; પ્રગતિશીલ ${GRADE_RULES[grade].udayMax + 1}–${GRADE_RULES[grade].nipunMin - 1}; નિપુણ ${GRADE_RULES[grade].nipunMin}–${GRADE_RULES[grade].statementIds.length}.`,
    })),
  ]), 'માપદંડ');

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true });
}

function appendWorkbookTable(
  workbook: XLSX.WorkBook,
  name: string,
  headers: string[],
  rows: (string | number | boolean)[][],
  widths: number[],
) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  sheet['!rows'] = [{ hpt: 26 }];
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function makeWorkbook(report: Awaited<ReturnType<typeof buildReport>>, filters: Filters) {
  const workbook = XLSX.utils.book_new();
  const statementCount = 30;
  const headers = [
    'School Code', 'School Name', 'District', 'Taluka', 'Student Name', 'Student UUID',
    'Grade', 'Assessment Date', 'Assessment Month', 'Saved At', 'Assessment Status', 'Answered Outcomes',
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
    assessmentCompletion(entry) ? 'Complete' : 'Incomplete',
    Object.values(entry.answers || {}).filter((value) => typeof value === 'boolean').length,
    ...Array.from({ length: statementCount }, (_, index) => {
      const value = entry.answers?.[String(index + 1)];
      return value === undefined ? '' : value ? 'હા' : 'ના';
    }),
  ]);

  const detailWidths = [14, 28, 22, 22, 28, 38, 12, 15, 16, 23, 16, 18, ...Array(statementCount).fill(12)];
  appendWorkbookTable(
    workbook,
    'Consolidated',
    headers,
    rows(report.entries),
    detailWidths,
  );
  for (const grade of GRADES) {
    const gradeEntries = report.entries.filter((entry) => entry.dhoran === grade);
    appendWorkbookTable(
      workbook,
      `ધોરણ ${grade}`,
      headers,
      rows(gradeEntries),
      detailWidths,
    );
  }
  appendWorkbookTable(workbook, 'District status', [
    'District', 'Schools', 'Enrolled', 'Assessed students', 'Assessment records', 'Complete', 'Incomplete', 'Pending', 'Completion %',
  ], report.districts.map((row) => [
    String(row.district), Number(row.schools), Number(row.enrolled), Number(row.assessed), Number(row.submitted),
    Number(row.complete), Number(row.incomplete), Number(row.pending), Number(row.completionPercent),
  ]), [24, 12, 14, 18, 18, 14, 14, 14, 16]);
  appendWorkbookTable(workbook, 'Block status', [
    'District', 'Block', 'Schools', 'Enrolled', 'Assessed students', 'Assessment records', 'Complete', 'Incomplete', 'Pending', 'Completion %',
  ], report.blocks.map((row) => [
    String(row.district), String(row.block), Number(row.schools), Number(row.enrolled), Number(row.assessed),
    Number(row.submitted), Number(row.complete), Number(row.incomplete), Number(row.pending),
    Number(row.completionPercent),
  ]), [24, 24, 12, 14, 18, 18, 14, 14, 14, 16]);
  appendWorkbookTable(workbook, 'School status', [
    'School Code', 'School Name', 'District', 'Taluka', 'Enrolled', 'Assessed students', 'Assessment records',
    'Complete', 'Incomplete', 'Pending', 'Completion %',
  ], report.schools.map((row) => [
    row.schoolCode, row.schoolName, row.district, row.taluka, row.enrolled, row.assessed, row.submitted,
    row.complete, row.incomplete, row.pending, row.completionPercent,
  ]), [14, 28, 22, 22, 14, 18, 18, 14, 14, 14, 16]);
  appendWorkbookTable(workbook, 'Learning outcomes', [
    'Grade', 'Learning Outcome', 'Yes', 'No', 'Answered',
  ], report.outcomes.map((row) => [
    row.dhoran, row.outcome, row.yes, row.no, row.answered,
  ]), [12, 20, 12, 12, 14]);
  appendWorkbookTable(workbook, 'Day-wise', [
    'Saved Date', 'Submitted Entries',
  ], report.daily.map((row) => [row.date, row.submitted]), [18, 20]);
  appendWorkbookTable(workbook, 'Monthly', [
    'Assessment Month', 'Enrolled', 'Submitted', 'Complete', 'Incomplete', 'Pending',
  ], report.monthly.map((row) => [
    row.month, row.enrolled, row.submitted, row.complete, row.incomplete, row.pending,
  ]), [20, 14, 14, 14, 14, 14]);
  appendWorkbookTable(workbook, 'Pending students', [
    'School Code', 'School Name', 'District', 'Block', 'Student Name', 'Student UUID', 'Grade',
  ], report.pendingStudents.map((student) => [
    student.schoolCode, student.schoolName, student.district, student.block,
    student.studentName, student.studentId, student.dhoran,
  ]), [14, 28, 22, 22, 28, 38, 12]);
  appendWorkbookTable(workbook, 'Totals', ['Metric', 'Value'], [
    ['Schools', report.totals.schools],
    ['Enrolled', report.totals.enrolled],
    ['Assessed students', report.totals.assessed],
    ['Assessment records', report.totals.submitted],
    ['Complete assessments', report.totals.complete],
    ['Incomplete assessments', report.totals.incomplete],
    ['Pending', report.totals.pending],
    ['Completion percent', report.totals.completionPercent],
    ['Saved-at date filter', `${filters.startDate} to ${filters.endDate}`],
    ['Assessment month', filters.month || 'All'],
    ['Assessment status', filters.status || 'all'],
    ['Assessment date', 'Separate column; historical NULL means unknown.'],
  ], [30, 72]);

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true });
}

function makeIncompleteWorkbook(report: Awaited<ReturnType<typeof buildReport>>, filters: Filters) {
  const workbook = XLSX.utils.book_new();
  const incomplete = report.entries.filter((entry) => !assessmentCompletion(entry));
  appendWorkbookTable(workbook, 'Incomplete assessments', [
    'School Code', 'School Name', 'District', 'Block', 'Student Name', 'Student UUID',
    'Grade', 'Assessment Month', 'Answered Outcomes', 'Required Outcomes', 'Saved At',
  ], incomplete.map((entry) => [
    entry.school.code,
    entry.school.name,
    entry.school.district,
    entry.school.block,
    entry.student.name,
    entry.student_id,
    entry.dhoran,
    entry.month,
    Object.values(entry.answers || {}).filter((value) => typeof value === 'boolean').length,
    GRADE_RULES[entry.dhoran]?.statementIds.length || 0,
    entry.updated_at,
  ]), [14, 28, 22, 22, 28, 38, 12, 16, 18, 18, 23]);
  appendWorkbookTable(workbook, 'Filters', ['Metric', 'Value'], [
    ['Incomplete assessments', incomplete.length],
    ['Saved-at date range', `${filters.startDate} to ${filters.endDate}`],
    ['Grade filter', filters.dhoran || 'All'],
    ['Assessment month filter', filters.month || 'All'],
    ['Assessment status', filters.status || 'all'],
    ['Definition', 'At least one required learning outcome has no boolean answer.'],
  ], [30, 72]);
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true });
}

function makePendingWorkbook(report: Awaited<ReturnType<typeof buildReport>>, filters: Filters) {
  const workbook = XLSX.utils.book_new();
  appendWorkbookTable(workbook, 'Pending students', [
    'School Code', 'School Name', 'District', 'Block', 'Student Name', 'Student UUID', 'Grade',
  ], report.pendingStudents.map((student) => [
    student.schoolCode, student.schoolName, student.district, student.block,
    student.studentName, student.studentId, student.dhoran,
  ]), [14, 28, 22, 22, 28, 38, 12]);
  appendWorkbookTable(workbook, 'Filters', ['Metric', 'Value'], [
    ['Pending students', report.pendingStudents.length],
    ['Saved-at date range', `${filters.startDate} to ${filters.endDate}`],
    ['Grade filter', filters.dhoran || 'All'],
    ['Assessment month filter', filters.month || 'All'],
    ['Assessment status', filters.status || 'all'],
    ['Definition', 'Enrolled students without an entry matching the selected date range, grade and assessment month.'],
  ], [30, 90]);
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
    .select('role,active,district_code,block_code,school_id').eq('id', authData.user.id).maybeSingle();
  if (profileError) {
    console.error('Admin report authorization lookup failed:', profileError.message);
    return jsonResponse(500, { error: 'Admin અધિકાર ચકાસી શકાયા નથી.' });
  }
  const scope = reportScope(profile);
  if (!scope) {
    return jsonResponse(403, { error: 'સક્રિય account report માટે અધિકૃત નથી.' });
  }

  const userClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  let body: { action?: unknown; filters?: unknown; page?: unknown; schoolId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Request માન્ય JSON નથી.' });
  }
  try {
    if (body.action === 'school-year-report') {
      if (typeof body.schoolId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.schoolId)) {
        return jsonResponse(400, { error: 'School UUID માન્ય નથી.' });
      }
      const schoolReport = await buildSchoolYearReport(userClient, body.schoolId, scope);
      if (!schoolReport) return jsonResponse(404, { error: 'આ accountને આ શાળાનો report જોવાની પરવાનગી નથી અથવા શાળા મળી નથી.' });
      return new Response(schoolYearWorkbook(schoolReport), {
        headers: {
          ...corsHeaders,
          'Cache-Control': 'no-store',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="fln-school-${schoolReport.school.code}-2026-27.xlsx"`,
        },
      });
    }
    const filters = validateFilters(body.filters);
    if (typeof filters === 'string') return jsonResponse(400, { error: filters });
    const report = await buildReport(userClient, filters, scope);
    if (body.action === 'export' || body.action === 'pending-export' || body.action === 'incomplete-export') {
      if (body.action === 'pending-export') {
        return new Response(makePendingWorkbook(report, filters), {
          headers: {
            ...corsHeaders,
            'Cache-Control': 'no-store',
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="fln-pending-${filters.startDate}-${filters.endDate}.xlsx"`,
          },
        });
      }
      if (body.action === 'incomplete-export') {
        return new Response(makeIncompleteWorkbook(report, filters), {
          headers: {
            ...corsHeaders,
            'Cache-Control': 'no-store',
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="fln-incomplete-${filters.startDate}-${filters.endDate}.xlsx"`,
          },
        });
      }
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
      monthly: report.monthly,
      outcomes: report.outcomes,
      districts: report.districts,
      blocks: report.blocks,
      schools: report.schools.slice((page - 1) * pageSize, page * pageSize),
      schoolPage: page,
      schoolPageSize: pageSize,
      schoolPageCount: Math.max(1, Math.ceil(report.schools.length / pageSize)),
      pendingStudents: report.pendingStudents.slice((page - 1) * pageSize, page * pageSize),
      pendingPage: page,
      pendingPageCount: Math.max(1, Math.ceil(report.pendingStudents.length / pageSize)),
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
        complete: assessmentCompletion(entry),
      })),
      entryPageCount: Math.max(1, Math.ceil(report.entries.length / pageSize)),
      page,
      generatedAt: new Date().toISOString(),
    });
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('REPORT_TOO_LARGE:')) {
      return jsonResponse(413, {
        error: `આ filterમાં ${MAX_REPORT_ROWS.toLocaleString()}થી વધુ records છે. નાની date range, month, grade અથવા school filter પસંદ કરો.`,
        maxRows: MAX_REPORT_ROWS,
      });
    }
    const databaseError = cause as { code?: string; message?: string; details?: string; hint?: string };
    const code = typeof databaseError?.code === 'string' ? databaseError.code : 'UNKNOWN';
    const message = typeof databaseError?.message === 'string' ? databaseError.message.slice(0, 500) : 'અજાણી server ભૂલ.';
    console.error('Admin report query failed:', { code, message, details: databaseError?.details, hint: databaseError?.hint });
    if (code === '42703' && /assessment_date/i.test(message)) {
      return jsonResponse(500, {
        error: `SQLSTATE ${code}: ${message} Apply the additive repair in migration 202610140004_admin_report_assessment_date_compat.sql, then reload the PostgREST schema cache.`,
        code,
        message,
      });
    }
    return jsonResponse(500, { error: `Report નિષ્ફળ (SQLSTATE ${code}): ${message}`, code, message });
  }
});
