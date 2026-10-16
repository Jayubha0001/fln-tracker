import { GRADE_RULES } from './assessmentRules.js';

export function assessmentCompletion(entry) {
  const statementIds = GRADE_RULES[entry.dhoran]?.statementIds;
  return Boolean(statementIds?.every((id) => typeof entry.answers?.[String(id)] === 'boolean'));
}

export function deduplicateAssessmentEntries(entries) {
  const latestByAssessment = new Map();
  for (const entry of entries) {
    const key = `${entry.school_id}:${entry.student_id}:${entry.month}:${entry.dhoran}`;
    const current = latestByAssessment.get(key);
    if (!current || entry.updated_at > current.updated_at) latestByAssessment.set(key, entry);
  }
  return [...latestByAssessment.values()]
    .sort((left, right) => left.updated_at.localeCompare(right.updated_at)
      || left.school_id.localeCompare(right.school_id)
      || left.student_id.localeCompare(right.student_id));
}

export function filterAssessmentEntries(entries, status = 'all') {
  if (status === 'complete') return entries.filter(assessmentCompletion);
  if (status === 'incomplete') return entries.filter((entry) => !assessmentCompletion(entry));
  if (status === 'pending') return [];
  return entries;
}

export function buildReportMetrics(schools, enrollmentBySchoolGrade, entries, grades) {
  const submittedBySchoolGrade = new Map();
  const dailyCounts = new Map();
  const outcomeCounts = new Map();
  const completionBySchool = new Map();
  const recordsBySchool = new Map();

  for (const entry of entries) {
    recordsBySchool.set(entry.school_id, (recordsBySchool.get(entry.school_id) || 0) + 1);
    const key = `${entry.school_id}:${entry.dhoran}`;
    if (!submittedBySchoolGrade.has(key)) submittedBySchoolGrade.set(key, new Set());
    submittedBySchoolGrade.get(key).add(entry.student_id);
    const savedDate = entry.updated_at.slice(0, 10);
    dailyCounts.set(savedDate, (dailyCounts.get(savedDate) || 0) + 1);
    const completion = completionBySchool.get(entry.school_id) || { complete: 0, incomplete: 0 };
    completion[assessmentCompletion(entry) ? 'complete' : 'incomplete'] += 1;
    completionBySchool.set(entry.school_id, completion);
    for (const [outcome, answer] of Object.entries(entry.answers || {})) {
      if (typeof answer !== 'boolean') continue;
      const key = `${entry.dhoran}:${outcome}`;
      const count = outcomeCounts.get(key) || { dhoran: entry.dhoran, outcome, yes: 0, no: 0 };
      count[answer ? 'yes' : 'no'] += 1;
      outcomeCounts.set(key, count);
    }
  }

  const schoolRows = schools.map((school) => {
    const enrolled = grades.reduce((total, grade) =>
      total + (enrollmentBySchoolGrade.get(`${school.id}:${grade}`) || 0), 0);
    const submitted = grades.reduce((total, grade) =>
      total + (submittedBySchoolGrade.get(`${school.id}:${grade}`)?.size || 0), 0);
    const records = recordsBySchool.get(school.id) || 0;
    return {
      schoolId: school.id,
      schoolCode: school.code,
      schoolName: school.name,
      district: school.district,
      taluka: school.block,
      enrolled,
      assessed: submitted,
      submitted: records,
      complete: completionBySchool.get(school.id)?.complete || 0,
      incomplete: completionBySchool.get(school.id)?.incomplete || 0,
      pending: Math.max(0, enrolled - submitted),
      completionPercent: enrolled ? Math.round((submitted / enrolled) * 1000) / 10 : 0,
    };
  }).filter((row) => row.enrolled > 0);

  const enrolled = schoolRows.reduce((total, row) => total + row.enrolled, 0);
  const submitted = entries.length;
  const assessed = schoolRows.reduce((total, row) => total + row.assessed, 0);
  return {
    schools: schoolRows,
    outcomes: [...outcomeCounts.values()]
      .sort((left, right) => left.dhoran.localeCompare(right.dhoran) || Number(left.outcome) - Number(right.outcome))
      .map((count) => ({
        dhoran: count.dhoran,
        outcome: count.outcome,
        yes: count.yes,
        no: count.no,
        answered: count.yes + count.no,
      })),
    daily: [...dailyCounts.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([date, count]) => ({ date, submitted: count })),
    totals: {
      schools: schoolRows.length,
      enrolled,
      submitted,
      assessed,
      complete: [...completionBySchool.values()].reduce((total, counts) => total + counts.complete, 0),
      incomplete: [...completionBySchool.values()].reduce((total, counts) => total + counts.incomplete, 0),
      pending: schoolRows.reduce((total, row) => total + row.pending, 0),
      completionPercent: enrolled ? Math.round((assessed / enrolled) * 1000) / 10 : 0,
    },
  };
}

export function buildFilteredReportMetrics(schools, enrollmentBySchoolGrade, entries, pendingStudents, grades, status) {
  if (status === 'all') return buildReportMetrics(schools, enrollmentBySchoolGrade, entries, grades);

  if (status === 'pending') {
    const pendingBySchool = new Map();
    for (const student of pendingStudents) {
      pendingBySchool.set(student.schoolId, (pendingBySchool.get(student.schoolId) || 0) + 1);
    }
    const enrolledMetrics = buildReportMetrics(schools, enrollmentBySchoolGrade, [], grades);
    const rows = enrolledMetrics.schools.filter((school) => pendingBySchool.has(school.schoolId))
      .map((school) => ({
        ...school,
        submitted: 0,
        assessed: 0,
        complete: 0,
        incomplete: 0,
        pending: pendingBySchool.get(school.schoolId),
        completionPercent: 0,
      }));
    const enrolled = rows.reduce((total, school) => total + school.enrolled, 0);
    const pending = rows.reduce((total, school) => total + school.pending, 0);
    return {
      schools: rows,
      outcomes: [],
      daily: [],
      totals: {
        schools: rows.length,
        enrolled,
        submitted: 0,
        assessed: 0,
        complete: 0,
        incomplete: 0,
        pending,
        completionPercent: 0,
      },
    };
  }

  const filteredEntries = filterAssessmentEntries(entries, status);
  const report = buildReportMetrics(schools, enrollmentBySchoolGrade, filteredEntries, grades);
  const rows = report.schools.filter((school) => school.submitted > 0)
    .map((school) => ({ ...school, pending: 0 }));
  const enrolled = rows.reduce((total, school) => total + school.enrolled, 0);
  return {
    ...report,
    schools: rows,
    totals: {
      ...report.totals,
      schools: rows.length,
      enrolled,
      submitted: filteredEntries.length,
      assessed: rows.reduce((total, school) => total + school.assessed, 0),
      pending: 0,
      completionPercent: enrolled
        ? Math.round(rows.reduce((total, school) => total + school.assessed, 0) * 1000 / enrolled) / 10
        : 0,
    },
  };
}

export function buildPendingStudents(schools, students, entries, grades) {
  const schoolById = new Map(schools.map((school) => [school.id, school]));
  const submitted = new Set(entries.map((entry) =>
    `${entry.school_id}:${entry.dhoran}:${entry.student_id}`));

  return students.flatMap((student) => {
    const school = schoolById.get(student.school_id);
    if (!school || !grades.includes(student.dhoran)
      || submitted.has(`${student.school_id}:${student.dhoran}:${student.id}`)) return [];
    return [{
      schoolId: school.id,
      schoolCode: school.code,
      schoolName: school.name,
      district: school.district,
      block: school.block,
      studentId: student.id,
      studentName: student.name,
      dhoran: student.dhoran,
    }];
  }).sort((left, right) =>
    left.schoolCode.localeCompare(right.schoolCode)
      || left.dhoran.localeCompare(right.dhoran)
      || left.studentName.localeCompare(right.studentName));
}
