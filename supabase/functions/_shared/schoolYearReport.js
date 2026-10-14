import { classifyAnswers } from './assessmentRules.js';

export const SCHOOL_YEAR_MONTHS = [
  { key: '2026-06', label: 'જૂન-26' },
  { key: '2026-07', label: 'જુલાઈ-26' },
  { key: '2026-08', label: 'ઓગસ્ટ-26' },
  { key: '2026-09', label: 'સપ્ટેમ્બર-26' },
  { key: '2026-10', label: 'ઓક્ટોબર-26' },
  { key: '2026-11', label: 'નવેમ્બર-26' },
  { key: '2026-12', label: 'ડિસેમ્બર-26' },
  { key: '2027-01', label: 'જાન્યુઆરી-27' },
  { key: '2027-02', label: 'ફેબ્રુઆરી-27' },
  { key: '2027-03', label: 'માર્ચ-27' },
];

const GRADES = ['B', '1', '2'];

export function buildSchoolYearRows(students, entries) {
  const studentById = new Map(students.map((student) => [student.id, student]));
  const entryByKey = new Map();
  for (const entry of entries) {
    const student = studentById.get(entry.student_id);
    if (!student || student.dhoran !== entry.dhoran || !SCHOOL_YEAR_MONTHS.some((month) => month.key === entry.month)) continue;
    const key = `${entry.month}:${entry.dhoran}:${entry.student_id}`;
    if (entryByKey.has(key)) throw new Error('DUPLICATE_SCHOOL_YEAR_ENTRY');
    entryByKey.set(key, entry);
  }

  return Object.fromEntries(GRADES.map((grade) => {
    const enrolledStudents = students.filter((student) => student.dhoran === grade);
    const months = SCHOOL_YEAR_MONTHS.map((month) => {
      const counts = { enrolled: enrolledStudents.length, saved: 0, complete: 0, incomplete: 0, pending: 0, U: 0, P: 0, N: 0 };
      for (const student of enrolledStudents) {
        const entry = entryByKey.get(`${month.key}:${grade}:${student.id}`);
        if (!entry) {
          counts.pending += 1;
          continue;
        }
        counts.saved += 1;
        const result = classifyAnswers(grade, entry.answers);
        if (!result.complete) {
          counts.incomplete += 1;
          continue;
        }
        counts.complete += 1;
        counts[result.category] += 1;
      }
      return { ...month, ...counts };
    });
    return [grade, months];
  }));
}
