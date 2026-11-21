import { classifyAnswers, GRADE_RULES } from './assessmentRules.js';

export const QUESTION_GRADES = ['B', '1', '2'];

const textCompare = (a, b) => String(a ?? '').localeCompare(String(b ?? ''));

/**
 * students: [{ id, name, reg, school_id, dhoran }]
 * entries : [{ student_id, dhoran, answers, assessment_date, updated_at }]  (one month)
 * schoolsById: Map(school_id -> { code, name, district, block })
 * Returns { B: [...], '1': [...], '2': [...] } sorted by district, block, school code, student name.
 */
export function assembleStudentQuestionRows({ students, entries, schoolsById, grade = '' }) {
  const entryByStudent = new Map();
  for (const entry of entries) entryByStudent.set(`${entry.student_id}|${entry.dhoran}`, entry);
  const result = { B: [], '1': [], '2': [] };
  for (const student of students) {
    if (!QUESTION_GRADES.includes(student.dhoran) || (grade && student.dhoran !== grade)) continue;
    const school = schoolsById.get(student.school_id);
    if (!school) continue;
    const entry = entryByStudent.get(`${student.id}|${student.dhoran}`);
    const rule = GRADE_RULES[student.dhoran];
    const base = {
      school, studentId: student.id, name: student.name || '', reg: student.reg || '',
      total: rule.statementIds.length, answers: {}, yes: 0, answered: 0, status: 'pending', category: null, date: '',
    };
    if (entry) {
      base.date = entry.assessment_date || (entry.updated_at ? String(entry.updated_at).slice(0, 10) : '');
      if (entry.answers?.absent === 'yes') {
        base.status = 'absent';
      } else {
        for (const id of rule.statementIds) if (typeof entry.answers?.[id] === 'boolean') base.answers[id] = entry.answers[id];
        const verdict = classifyAnswers(student.dhoran, entry.answers || {});
        base.yes = verdict.yes;
        base.answered = Object.keys(base.answers).length;
        base.status = verdict.complete ? 'complete' : 'incomplete';
        base.category = verdict.category;
      }
    }
    result[student.dhoran].push(base);
  }
  for (const key of QUESTION_GRADES) {
    result[key].sort((a, b) => textCompare(a.school.district, b.school.district) || textCompare(a.school.block, b.school.block)
      || textCompare(a.school.code, b.school.code) || textCompare(a.name, b.name));
  }
  return result;
}

export function questionStats(rows, ids) {
  return ids.map((id) => {
    const answered = rows.filter((row) => typeof row.answers[id] === 'boolean');
    const yes = answered.filter((row) => row.answers[id] === true).length;
    return { id, answered: answered.length, yes, percent: answered.length ? yes / answered.length : null };
  });
}

export function statusCounts(rows) {
  const counts = { total: rows.length, complete: 0, incomplete: 0, absent: 0, pending: 0, U: 0, P: 0, N: 0 };
  for (const row of rows) {
    counts[row.status] += 1;
    if (row.category) counts[row.category] += 1;
  }
  return counts;
}
