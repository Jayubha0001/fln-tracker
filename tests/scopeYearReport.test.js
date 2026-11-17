import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleScopeYearReport, scopeLevelAllowed, sampleSchoolInScope, sumGradeMonth } from '../supabase/functions/_shared/scopeYearReport.js';
import { buildSchoolYearWorkbook, scopeMeta, schoolYearPlainTables } from '../supabase/functions/_shared/schoolYearWorkbook.js';

const stat = (key, label, registered, entered, uday, pragati, nipun, extra = {}) => ({
  group_key: key, group_label: label, registered, entered, uday, pragati, nipun, ...extra,
});
const statRows = {
  B: { '2026-10': [stat('BARVALA', 'BARVALA', 40, 30, 5, 10, 12), stat('RANPUR', 'RANPUR', 20, 0, 0, 0, 0)] },
  1: { '2026-10': [stat('BARVALA', 'BARVALA', 50, 40, 8, 12, 15), stat('RANPUR', 'RANPUR', 10, 5, 1, 1, 2)] },
  2: { '2026-10': [stat('BARVALA', 'BARVALA', 30, 20, 4, 6, 8)] },
};
const schools = [
  { id: 's1', code: '24280101102', district: 'Botad', block: 'BARVALA' },
  { id: 's2', code: '24280201101', district: 'Botad', block: 'RANPUR' },
];
const absentRows = [
  { school_id: 's1', dhoran: 'B', month: '2026-10' },
  { school_id: 's1', dhoran: 'B', month: '2026-10' },
  { school_id: 's2', dhoran: '1', month: '2026-10' },
];
const report = assembleScopeYearReport({
  level: 'district', statRows, absentRows, schools,
  schoolRows: [{ registered: 10, entered: 10 }, { registered: 10, entered: 4 }, { registered: 10, entered: 0 }, { registered: 0, entered: 0 }],
});

test('scope totals add up per month: enrolled = complete + incomplete + absent + pending', () => {
  const october = report.gradeRows.B[4];
  assert.equal(october.enrolled, 60);
  assert.equal(october.saved, 30);
  assert.equal(october.absent, 2);
  assert.equal(october.complete, 27);
  assert.equal(october.incomplete, 1);
  assert.equal(october.pending, 30);
  assert.equal(october.enrolled, october.complete + october.incomplete + october.absent + october.pending);
  assert.equal(report.latest, 4);
});

test('units are listed per child (blocks of a district) with their own absent counts', () => {
  assert.deepEqual(report.units.map((unit) => unit.label), ['BARVALA', 'RANPUR']);
  const ranpur = sumGradeMonth(report.units[1].perGrade, 4);
  assert.equal(ranpur.enrolled, 30);
  assert.equal(ranpur.absent, 1);
  assert.equal(report.schoolStats.total, 4);
  assert.equal(report.schoolStats.eligible, 3);
  assert.equal(report.schoolStats.pending, 1);
  assert.equal(report.schoolStats.complete, 1);
  assert.equal(report.schoolStats.partial, 1);
});

test('who may request which level', () => {
  assert.equal(scopeLevelAllowed({ role: 'admin' }, 'state'), true);
  assert.equal(scopeLevelAllowed({ role: 'district', districtCode: '2428' }, 'state'), false);
  assert.equal(scopeLevelAllowed({ role: 'district', districtCode: '2428' }, 'district'), true);
  assert.equal(scopeLevelAllowed({ role: 'block', districtCode: '2428', blockCode: '242801' }, 'district'), false);
  assert.equal(scopeLevelAllowed({ role: 'block', districtCode: '2428', blockCode: '242801' }, 'block'), true);
  assert.equal(scopeLevelAllowed({ role: 'school', schoolId: 'x' }, 'block'), false);
  assert.equal(scopeLevelAllowed({ role: 'admin' }, 'country'), false);
});

test('sample school must sit inside the caller code scope', () => {
  const district = { role: 'district', districtCode: '2428' };
  assert.equal(sampleSchoolInScope(district, 'district', '24280101102'), true);
  assert.equal(sampleSchoolInScope(district, 'district', '24290101102'), false);
  const block = { role: 'block', districtCode: '2428', blockCode: '242801' };
  assert.equal(sampleSchoolInScope(block, 'block', '24280101102'), true);
  assert.equal(sampleSchoolInScope(block, 'block', '24280201101'), false);
  assert.equal(sampleSchoolInScope(block, 'district', '24280101102'), false);
  assert.equal(sampleSchoolInScope({ role: 'admin' }, 'state', '99990000000'), true);
});

test('plain fallback for a scope report has bilingual info and a unit-wise table', () => {
  const meta = scopeMeta('district', { district: 'Botad' }, new Date('2026-11-13T00:00:00Z'), 4);
  const tables = schoolYearPlainTables({ ...report, meta });
  assert.ok(tables.some((table) => table.name === 'By District' || table.name === 'By Block'));
  assert.match(tables[0].rows[1][0], /[઀-૿]/);
});

test('styled scope workbook builds all sheets (needs exceljs)', async (t) => {
  let ExcelJS;
  try { ({ default: ExcelJS } = await import('exceljs')); } catch { t.skip('exceljs not installed'); return; }
  for (const [level, names] of [['state', {}], ['district', { district: 'Botad' }], ['block', { district: 'Botad', block: 'BARVALA' }]]) {
    const workbook = buildSchoolYearWorkbook(ExcelJS, { ...report, level, meta: scopeMeta(level, names, new Date(), 4) });
    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
    assert.ok(sheetNames.length >= 8, `${level}: ${sheetNames.join(',')}`);
    assert.ok((await workbook.xlsx.writeBuffer()).byteLength > 8000);
  }
});
