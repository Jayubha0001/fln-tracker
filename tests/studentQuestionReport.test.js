import test from 'node:test';
import assert from 'node:assert/strict';
import { GRADE_RULES } from '../supabase/functions/_shared/assessmentRules.js';
import { ALL as SERVER_ALL } from '../supabase/functions/_shared/statements.js';
import { assembleStudentQuestionRows, questionStats, statusCounts } from '../supabase/functions/_shared/studentQuestionReport.js';
import { buildStudentQuestionWorkbook, studentQuestionMeta, studentQuestionPlainTables } from '../supabase/functions/_shared/studentQuestionWorkbook.js';

const yesAll = (grade) => Object.fromEntries(GRADE_RULES[grade].statementIds.map((id) => [id, true]));
const schoolsById = new Map([['s1', { code: '24280101102', name: 'ADARSH', district: 'Botad', block: 'BARVALA' }]]);
const students = [
  { id: 'a', name: 'AMIT', reg: '11', school_id: 's1', dhoran: 'B' },
  { id: 'b', name: 'BINA', reg: '', school_id: 's1', dhoran: 'B' },
  { id: 'c', name: 'CHIRAG', reg: '13', school_id: 's1', dhoran: 'B' },
  { id: 'd', name: 'DIVYA', reg: '14', school_id: 's1', dhoran: 'B' },
  { id: 'e', name: 'ESHA', reg: '15', school_id: 's1', dhoran: '1' },
  { id: 'x', name: 'ORPHAN', reg: '99', school_id: 'missing', dhoran: 'B' },
];
const entries = [
  { student_id: 'a', dhoran: 'B', answers: yesAll('B'), assessment_date: '2026-11-10' },
  { student_id: 'b', dhoran: 'B', answers: { absent: 'yes' }, updated_at: '2026-11-11T05:00:00Z' },
  { student_id: 'c', dhoran: 'B', answers: { 1: true, 3: false } },
];
const data = assembleStudentQuestionRows({ students, entries, schoolsById });

test('every student gets a status: complete / absent / incomplete / pending; students without a school are skipped', () => {
  assert.deepEqual(data.B.map((row) => [row.name, row.status, row.category]), [
    ['AMIT', 'complete', 'N'], ['BINA', 'absent', null], ['CHIRAG', 'incomplete', null], ['DIVYA', 'pending', null],
  ]);
  assert.equal(data.B[0].yes, 6);
  assert.equal(data.B[1].date, '2026-11-11');
  assert.equal(data.B[2].answered, 2);
  assert.equal(data['1'].length, 1);
  assert.equal(data['1'][0].status, 'pending');
  assert.deepEqual(statusCounts(data.B), { total: 4, complete: 1, incomplete: 1, absent: 1, pending: 1, U: 0, P: 0, N: 1 });
});

test('question-wise yes % is calculated on answered students only; grade filter works', () => {
  const stats = questionStats(data.B, GRADE_RULES.B.statementIds);
  assert.equal(stats[0].answered, 2);
  assert.equal(stats[0].percent, 1);
  assert.equal(stats[1].percent, 0.5);
  const onlyOne = assembleStudentQuestionRows({ students, entries, schoolsById, grade: '1' });
  assert.equal(onlyOne.B.length, 0);
  assert.equal(onlyOne['1'].length, 1);
});

test('server copy of statements matches the app statements', async () => {
  const app = await import('../src/data/statements.js');
  assert.deepEqual(SERVER_ALL, app.ALL);
});

test('plain fallback headers are bilingual; styled workbook has Q headers, absent row and question key (needs exceljs)', async (t) => {
  const meta = studentQuestionMeta({ level: 'district', district: 'Botad', month: '2026-10', generatedAt: new Date('2026-11-17T00:00:00Z') });
  const tables = studentQuestionPlainTables(data, meta);
  assert.ok(tables.some((table) => table.name === 'Question Key'));
  assert.match(tables[0].rows[0][5], /[઀-૿].*\/.*[A-Za-z]/);
  let ExcelJS;
  try { ({ default: ExcelJS } = await import('exceljs')); } catch { t.skip('exceljs not installed'); return; }
  const workbook = buildStudentQuestionWorkbook(ExcelJS, data, meta);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['સારાંશ - Summary', 'બાલવાટિકા - Balvatika', 'ધોરણ 1 - Std 1', 'વિધાન યાદી - Question Key']);
  const sheet = workbook.getWorksheet('બાલવાટિકા - Balvatika');
  assert.equal(sheet.getCell('H5').value, 'Q1');
  assert.equal(sheet.getCell('H7').value, '✓');
  assert.match(String(sheet.getCell('P8').value), /ગેરહાજર/);
  assert.ok((await workbook.xlsx.writeBuffer()).byteLength > 6000);
});
