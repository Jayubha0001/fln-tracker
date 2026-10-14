import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAnswers, GRADE_RULES } from '../supabase/functions/_shared/assessmentRules.js';
import { buildSchoolYearRows, SCHOOL_YEAR_MONTHS } from '../supabase/functions/_shared/schoolYearReport.js';

function answersFor(grade, yesCount) {
  return Object.fromEntries(GRADE_RULES[grade].statementIds.map((id, index) => [id, index < yesCount]));
}

test('keeps grade thresholds consistent with the existing FLN category rules', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(GRADE_RULES).map(([grade, rule]) => [grade, rule.statementIds.length])), {
    B: 6,
    '1': 22,
    '2': 30,
  });
  assert.equal(classifyAnswers('B', answersFor('B', 1)).category, 'U');
  assert.equal(classifyAnswers('B', answersFor('B', 2)).category, 'P');
  assert.equal(classifyAnswers('B', answersFor('B', 5)).category, 'N');
  assert.equal(classifyAnswers('1', answersFor('1', 6)).category, 'U');
  assert.equal(classifyAnswers('1', answersFor('1', 18)).category, 'N');
  assert.equal(classifyAnswers('2', answersFor('2', 24)).category, 'N');
  assert.equal(classifyAnswers('2', { 1: true }).complete, false);
});

test('builds a month-by-month school matrix with separate grade outcomes and pending/incomplete counts', () => {
  const students = [
    { id: 'b-nipun', dhoran: 'B' },
    { id: 'one-incomplete', dhoran: '1' },
    { id: 'two-udayman', dhoran: '2' },
    { id: 'two-pending', dhoran: '2' },
  ];
  const entries = [
    { student_id: 'b-nipun', dhoran: 'B', month: '2026-06', answers: answersFor('B', 5) },
    { student_id: 'one-incomplete', dhoran: '1', month: '2026-06', answers: { 1: true } },
    { student_id: 'two-udayman', dhoran: '2', month: '2026-06', answers: answersFor('2', 0) },
    { student_id: 'two-udayman', dhoran: '2', month: '2026-07', answers: answersFor('2', 30) },
  ];

  const rows = buildSchoolYearRows(students, entries);

  assert.equal(SCHOOL_YEAR_MONTHS.length, 10);
  assert.deepEqual(
    (({ enrolled, saved, complete, incomplete, pending, N }) => ({ enrolled, saved, complete, incomplete, pending, N }))(rows.B[0]),
    { enrolled: 1, saved: 1, complete: 1, incomplete: 0, pending: 0, N: 1 },
  );
  assert.deepEqual(
    (({ enrolled, saved, complete, incomplete, pending, U, P, N }) => ({ enrolled, saved, complete, incomplete, pending, U, P, N }))(rows['1'][0]),
    { enrolled: 1, saved: 1, complete: 0, incomplete: 1, pending: 0, U: 0, P: 0, N: 0 },
  );
  assert.deepEqual(
    (({ enrolled, saved, complete, incomplete, pending, U, P, N }) => ({ enrolled, saved, complete, incomplete, pending, U, P, N }))(rows['2'][0]),
    { enrolled: 2, saved: 1, complete: 1, incomplete: 0, pending: 1, U: 1, P: 0, N: 0 },
  );
  assert.equal(rows['2'][1].N, 1);
  assert.equal(rows['2'][1].pending, 1);
});
