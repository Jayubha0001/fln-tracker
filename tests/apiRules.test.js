import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGrade, planStudentRows, validateApiSchool } from '../supabase/functions/_shared/apiRules.js';

test('grade aliases (English + Gujarati) map to B / 1 / 2', () => {
  assert.equal(normalizeGrade('Balvatika'), 'B');
  assert.equal(normalizeGrade('બાલવાટિકા'), 'B');
  assert.equal(normalizeGrade('ધોરણ 1'), '1');
  assert.equal(normalizeGrade('std 2'), '2');
  assert.equal(normalizeGrade(' 2 '), '2');
  assert.equal(normalizeGrade('3'), '');
  assert.equal(normalizeGrade(''), '');
});

test('student rows: valid / invalid / duplicate (name+class and register no.) are separated', () => {
  const existing = [{ name: 'AMIT KUMAR', dhoran: '1', reg: '11', student_id: '11' }];
  const { toInsert, outcomes } = planStudentRows([
    { name: ' amit  kumar ', class: '1' },
    { name: 'BINA', class: 'Std 1', reg: '12' },
    { name: 'CHIRAG', class: '1', reg: '11' },
    { name: '', class: '1' },
    { name: 'DIVYA', class: '9' },
    { name: 'BINA', dhoran: '1', reg: '12' },
    { name: 'ESHA', grade: 'બાલવાટિકા' },
  ], existing);
  assert.deepEqual(outcomes.map((item) => item.status), ['duplicate', 'added', 'duplicate', 'invalid', 'invalid', 'duplicate', 'added']);
  assert.deepEqual(toInsert, [{ name: 'BINA', dhoran: '1', reg: '12' }, { name: 'ESHA', dhoran: 'B', reg: '' }]);
});

test('school payload validation', () => {
  assert.ok(validateApiSchool({ code: '24280101102', name: ' New  School ' }).value);
  assert.equal(validateApiSchool({ code: '2428', name: 'X' }).value, undefined);
  assert.equal(validateApiSchool({ code: '24280101102', name: '' }).value, undefined);
});
