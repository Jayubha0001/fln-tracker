import test from 'node:test';
import assert from 'node:assert/strict';
import { GRADE_RULES } from '../supabase/functions/_shared/assessmentRules.js';
import { buildSchoolYearRows } from '../supabase/functions/_shared/schoolYearReport.js';
import { buildSchoolYearWorkbook, schoolYearPlainTables, bi, LABELS } from '../supabase/functions/_shared/schoolYearWorkbook.js';

const school = { id: 's1', code: '24280101102', name: 'ADARSH SCHOOL', district: 'Botad', block: 'BARVALA' };
const students = [{ id: 'x1', dhoran: 'B' }, { id: 'x2', dhoran: 'B' }, { id: 'y1', dhoran: '1' }];
const entries = [
  { student_id: 'x1', dhoran: 'B', month: '2026-10', answers: Object.fromEntries(GRADE_RULES.B.statementIds.map((id) => [id, true])) },
  { student_id: 'x2', dhoran: 'B', month: '2026-10', answers: { absent: 'yes' } },
];
const gradeRows = buildSchoolYearRows(students, entries);

test('every plain-fallback header carries Gujarati and English', () => {
  const tables = schoolYearPlainTables({ school, gradeRows });
  assert.ok(tables.length >= 4);
  for (const table of tables.filter((item) => item.name !== 'Info')) {
    for (const header of table.rows[0]) assert.match(header, /[઀-૿]/, `Gujarati missing in: ${header}`);
    for (const header of table.rows[0]) assert.match(header, /[A-Za-z]/, `English missing in: ${header}`);
  }
  assert.equal(bi(LABELS.absent, ' / '), 'ગેરહાજર / Absent');
});

test('styled workbook has bilingual headers, absent column and reconciling numbers (needs exceljs)', async (t) => {
  let ExcelJS;
  try { ({ default: ExcelJS } = await import('exceljs')); } catch { t.skip('exceljs not installed'); return; }
  const workbook = buildSchoolYearWorkbook(ExcelJS, { school, gradeRows }, { generatedAt: new Date('2026-11-12T00:00:00Z') });
  const names = workbook.worksheets.map((sheet) => sheet.name);
  assert.deepEqual(names, ['સારાંશ - Summary', 'બાલવાટિકા - Balvatika', 'ધોરણ 1 - Std 1', 'ધોરણ 2 - Std 2', 'FLN Action Plan', 'માપદંડ - Criteria']);
  const sheet = workbook.getWorksheet('બાલવાટિકા - Balvatika');
  const header = String(sheet.getCell('G5').value);
  assert.match(header, /ગેરહાજર/);
  assert.match(header, /Absent/);
  const october = 6 + 5; // data rows start at 7, Oct = 5th month
  assert.equal(sheet.getCell(`C${october}`).value, 2); // enrolled
  assert.equal(sheet.getCell(`G${october}`).value, 1); // absent
  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.byteLength > 5000);
});
