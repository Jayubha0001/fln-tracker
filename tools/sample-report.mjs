import ExcelJS from 'exceljs';
import { GRADE_RULES } from '../supabase/functions/_shared/assessmentRules.js';
import { buildSchoolYearRows } from '../supabase/functions/_shared/schoolYearReport.js';
import { buildSchoolYearWorkbook } from '../supabase/functions/_shared/schoolYearWorkbook.js';
import { writeFileSync } from 'node:fs';

const ids = (g, yes) => Object.fromEntries(GRADE_RULES[g].statementIds.map((id, i) => [id, i < yes]));
const students = []; const entries = [];
let n = 0;
for (const [g, count] of [['B', 22], ['1', 30], ['2', 28]]) {
  for (let i = 0; i < count; i += 1) {
    const id = `${g}-${i}`;
    students.push({ id, dhoran: g });
    for (const month of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
      if (month === '2026-10' && i % 5 === 0) continue; // pending
      const total = GRADE_RULES[g].statementIds.length;
      let answers;
      if (i % 11 === 0) answers = { absent: 'yes' };
      else if (i % 13 === 0) answers = { 1: true };
      else answers = ids(g, (i * 7 + n++) % (total + 1));
      entries.push({ student_id: id, dhoran: g, month, answers });
    }
  }
}
const gradeRows = buildSchoolYearRows(students, entries);
const school = { id: 's', code: '24280101102', name: 'ADARSH PRIMARY SCHOOL KHAMBHADA', district: 'Botad', block: 'BARVALA' };
const wb = buildSchoolYearWorkbook(ExcelJS, { school, gradeRows }, { generatedAt: new Date('2026-11-12T10:00:00Z') });
writeFileSync('/tmp/report.xlsx', Buffer.from(await wb.xlsx.writeBuffer()));
console.log('sheets:', wb.worksheets.map((w) => w.name).join(' | '));
const r = gradeRows.B[4];
console.log('B oct', r, 'identity', r.enrolled === r.complete + r.incomplete + r.absent + r.pending);
