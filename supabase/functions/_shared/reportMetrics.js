export function buildReportMetrics(schools, enrollmentBySchoolGrade, entries, grades) {
  const submittedBySchoolGrade = new Map();
  const dailyCounts = new Map();
  const outcomeCounts = new Map();

  for (const entry of entries) {
    const key = `${entry.school_id}:${entry.dhoran}`;
    if (!submittedBySchoolGrade.has(key)) submittedBySchoolGrade.set(key, new Set());
    submittedBySchoolGrade.get(key).add(entry.student_id);
    const savedDate = entry.updated_at.slice(0, 10);
    dailyCounts.set(savedDate, (dailyCounts.get(savedDate) || 0) + 1);
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
    return {
      schoolId: school.id,
      schoolCode: school.code,
      schoolName: school.name,
      district: school.district,
      taluka: school.block,
      enrolled,
      submitted,
      pending: Math.max(0, enrolled - submitted),
      completionPercent: enrolled ? Math.round((submitted / enrolled) * 1000) / 10 : 0,
    };
  }).filter((row) => row.enrolled > 0);

  const enrolled = schoolRows.reduce((total, row) => total + row.enrolled, 0);
  const submitted = entries.length;
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
      pending: schoolRows.reduce((total, row) => total + row.pending, 0),
      completionPercent: enrolled ? Math.round((submitted / enrolled) * 1000) / 10 : 0,
    },
  };
}
