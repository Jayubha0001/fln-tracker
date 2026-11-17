import ExcelJS from 'exceljs';
import { assembleScopeYearReport } from '../supabase/functions/_shared/scopeYearReport.js';
import { buildSchoolYearWorkbook, scopeMeta } from '../supabase/functions/_shared/schoolYearWorkbook.js';
import { writeFileSync } from 'node:fs';
const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const blocks = ['BARVALA', 'BOTAD', 'GADHADA', 'RANPUR', 'JAMKHAMBHALIYA', 'DWARKA'];
const statRows = { B: {}, 1: {}, 2: {} };
let seed = 7;
const rnd = (n) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * n); };
for (const g of ['B', '1', '2']) for (const m of months) {
  statRows[g][m] = blocks.map((b, i) => { const reg = 200 + i * 40; const ent = m === '2026-10' && i === 5 ? 0 : Math.floor(reg * (0.7 + rnd(25) / 100)); const n = Math.floor(ent * 0.4); const p = Math.floor(ent * 0.35); const u = Math.floor(ent * 0.15); return { group_key: b, group_label: b, registered: reg, entered: ent, uday: u, pragati: p, nipun: n }; });
}
const schools = []; const absentRows = [];
blocks.forEach((b, i) => { for (let k = 0; k < 3; k += 1) { const id = `${b}-${k}`; schools.push({ id, code: `2428${String(i).padStart(2, '0')}0${k}`, district: 'Botad', block: b }); absentRows.push({ school_id: id, dhoran: 'B', month: '2026-10' }); } });
const schoolRows = blocks.flatMap((b, i) => [{ registered: 100, entered: 100 }, { registered: 100, entered: i === 5 ? 0 : 40 }, { registered: 0, entered: 0 }]);
const report = assembleScopeYearReport({ level: 'district', statRows, absentRows, schools, schoolRows });
const wb = buildSchoolYearWorkbook(ExcelJS, { ...report, meta: scopeMeta('district', { district: 'Botad' }, new Date(), schoolRows.length) });
writeFileSync('/tmp/scope.xlsx', Buffer.from(await wb.xlsx.writeBuffer()));
console.log(wb.worksheets.map((w) => w.name).join(' | '));
