import ExcelJS from 'exceljs';
import { GRADE_RULES } from '../supabase/functions/_shared/assessmentRules.js';
import { assembleStudentQuestionRows } from '../supabase/functions/_shared/studentQuestionReport.js';
import { buildStudentQuestionWorkbook, studentQuestionMeta } from '../supabase/functions/_shared/studentQuestionWorkbook.js';
import { writeFileSync } from 'node:fs';
const names = ['AMRITA VIKRAMBHAI KUMARKHANIYA', 'KULDIP KISHANBHAI BUTIYA', 'MAHIR BATUKBHAI KUMARKHANIYA', 'MANYATA BATUKBHAI KUMARKHANIYA', 'RACHANA KHODABHAI KUMARKHANIYA', 'ANKITA JAYANTIBHAI BHUPATBHAI BUTIYA', 'ARADHANABEN KULDIPBHAI DADUBHAI BORICHA', 'ARUNA VIPULBHAI PARMAR'];
const schoolsById = new Map([['s1', { code: '24280101102', name: 'ADARSH PRIMARY SCHOOL KHAMBHADA', district: 'Botad', block: 'BARVALA' }], ['s2', { code: '24280100401', name: 'BHIMNATH PRIMARY SCHOOL', district: 'Botad', block: 'BARVALA' }]]);
const students = []; const entries = [];
names.forEach((n, i) => { for (const g of ['B', '1']) { const id = `${g}${i}`; students.push({ id, name: n, reg: String(100 + i), school_id: i % 2 ? 's2' : 's1', dhoran: g });
  const ids = GRADE_RULES[g].statementIds;
  if (i === 3) entries.push({ student_id: id, dhoran: g, answers: { absent: 'yes' } });
  else if (i === 7) { /* pending */ }
  else entries.push({ student_id: id, dhoran: g, assessment_date: '2026-11-12', answers: Object.fromEntries(ids.map((q, k) => [q, i === 5 && k > 2 ? undefined : (k + i) % 4 !== 0]).filter(([, v]) => v !== undefined)) }); } });
const data = assembleStudentQuestionRows({ students, entries, schoolsById });
const wb = buildStudentQuestionWorkbook(ExcelJS, data, studentQuestionMeta({ level: 'block', district: 'Botad', block: 'BARVALA', month: '2026-11', generatedAt: new Date('2026-11-17T10:00:00Z') }));
writeFileSync('/tmp/student.xlsx', Buffer.from(await wb.xlsx.writeBuffer()));
console.log(wb.worksheets.map((w) => w.name).join(' | '));
