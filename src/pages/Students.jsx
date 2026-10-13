import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { db } from '../db';
import { CLASSES } from '../lib/category';
import { SCHOOL } from '../config/school';
import { normDhoran, detectStandard, parseStandard } from '../lib/importStudents';

export default function Students({ dhoran }) {
  const students = useLiveQuery(
    () => db.students.where('dhoran').equals(dhoran).sortBy('name'),
    [dhoran]
  );
  const [name, setName] = useState('');
  const [reg, setReg] = useState('');
  const [sheet, setSheet] = useState(null); // {rows, headers, std, parsed}
  const [map, setMap] = useState({ name: '', reg: '', dhoran: '', school: '' });
  const [msg, setMsg] = useState('');

  async function add() {
    if (!name.trim()) return;
    await db.students.add({ dhoran, name: name.trim(), reg: reg.trim(), schoolId: SCHOOL.id });
    setName('');
    setReg('');
  }

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setSheet(null);
    try {
      const buf = await f.arrayBuffer();
      const head = new TextDecoder().decode(buf.slice(0, 3000));
      if (/Workbook Frameset/i.test(head)) {
        return setMsg(
          'આ ફાઈલ ફક્ત "wrapper" છે, અસલી ડેટા તેની બાજુના "_files" ફોલ્ડરની sheet001.htm ફાઈલમાં છે. ' +
          'કાં તો તે sheet001.htm ફાઈલ પસંદ કરો, કાં તો આ ફાઈલ Excel માં ખોલી .xlsx તરીકે Save As કરી પસંદ કરો.'
        );
      }
      const wb = XLSX.read(buf);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) return setMsg('ફાઈલમાં ડેટા મળ્યો નહીં');
      const headers = Object.keys(rows[0]);

      const h = detectStandard(headers);
      if (h) {
        // Portal format: kain pasand karvanu nathi
        setSheet({ rows, headers, std: true, parsed: parseStandard(rows, h, SCHOOL.id) });
        setMsg('');
        return;
      }
      const find = (re) => headers.find((x) => re.test(x.toLowerCase())) || '';
      setMap({
        name: find(/name|નામ|student/),
        reg: find(/reg|roll|id|રજી|ક્રમ/),
        dhoran: find(/std|class|dhoran|ધોરણ/),
        school: find(/school.?id|udise|schoolid/),
      });
      setSheet({ rows, headers, std: false });
      setMsg('');
    } catch (err) {
      setMsg('ફાઈલ વાંચી શકાઈ નહીં: ' + err.message);
    }
  }

  async function saveList(list) {
    const existing = await db.students.toArray();
    const keyOf = (x) => (x.studentId ? `id|${x.studentId}` : `${x.dhoran}|${x.name.toLowerCase()}|${x.reg}`);
    const seen = new Set(existing.map(keyOf));
    const fresh = [];
    let dup = 0;
    for (const x of list) {
      const k = keyOf(x);
      if (seen.has(k)) { dup++; continue; }
      seen.add(k);
      fresh.push(x);
    }
    await db.students.bulkAdd(fresh);
    return { added: fresh.length, dup };
  }

  async function doImportStd() {
    const p = sheet.parsed;
    const { added, dup } = await saveList(p.list);
    setSheet(null);
    setMsg(`${added} વિદ્યાર્થી ઉમેર્યા. પહેલેથી હતા: ${dup}, બીજી શાળાના: ${p.other}, બીજું ધોરણ: ${p.skipped}`);
  }

  async function doImportGeneric() {
    if (!map.name) return setMsg('નામ વાળો કૉલમ પસંદ કરો');
    const list = [];
    let other = 0, skipped = 0;
    for (const r of sheet.rows) {
      const nm = String(r[map.name] ?? '').trim();
      if (!nm) continue;
      if (map.school && String(r[map.school]).trim() !== SCHOOL.id) { other++; continue; }
      const d = map.dhoran ? normDhoran(r[map.dhoran]) : dhoran;
      if (!d) { skipped++; continue; }
      list.push({ dhoran: d, name: nm, reg: map.reg ? String(r[map.reg]).trim() : '', schoolId: SCHOOL.id });
    }
    const { added, dup } = await saveList(list);
    setSheet(null);
    setMsg(`${added} વિદ્યાર્થી ઉમેર્યા. પહેલેથી હતા: ${dup}, બીજી શાળાના: ${other}, બીજું ધોરણ: ${skipped}`);
  }

  async function remove(id) {
    if (!confirm('આ વિદ્યાર્થી કાઢી નાખવો?')) return;
    await db.students.delete(id);
    await db.entries.where('studentId').equals(id).delete();
  }

  const Sel = ({ k, label, optional }) => (
    <label>
      {label}
      <select value={map[k]} onChange={(e) => setMap({ ...map, [k]: e.target.value })}>
        <option value="">{optional ? '— નથી —' : '— પસંદ કરો —'}</option>
        {sheet.headers.map((x) => <option key={x}>{x}</option>)}
      </select>
    </label>
  );

  const counts = sheet?.std
    ? sheet.parsed.list.reduce((a, x) => ({ ...a, [x.dhoran]: (a[x.dhoran] || 0) + 1 }), {})
    : null;

  return (
    <div>
      <h2>{CLASSES[dhoran].label} – વિદ્યાર્થી ({students?.length ?? 0})</h2>

      <div className="card">
        <h3>Excel / CSV માંથી ઇમ્પોર્ટ</h3>
        <input type="file" accept=".xlsx,.xls,.csv,.htm,.html" onChange={onFile} />

        {sheet?.std && (
          <>
            <p>
              <b>{SCHOOL.name}</b> ({SCHOOL.id}) ના વિદ્યાર્થી: <b>{sheet.parsed.list.length}</b>
            </p>
            <p className="muted">
              બાલવાટિકા {counts.B || 0} · ધોરણ 1: {counts['1'] || 0} · ધોરણ 2: {counts['2'] || 0}
              <br />બીજી શાળાના: {sheet.parsed.other} · બીજું ધોરણ (3 થી 8): {sheet.parsed.skipped}
            </p>
            {sheet.parsed.list.length === 0 ? (
              <p className="muted">આ શાળાનો (SchoolId {SCHOOL.id}) કોઈ વિદ્યાર્થી ફાઈલમાં મળ્યો નથી.</p>
            ) : (
              <button className="primary" onClick={doImportStd}>ઇમ્પોર્ટ કરો</button>
            )}
          </>
        )}

        {sheet && !sheet.std && (
          <>
            <p className="muted">આ ફાઈલ પોર્ટલના ફોર્મેટની નથી, એટલે કૉલમ જાતે પસંદ કરો.</p>
            <Sel k="name" label="નામ કૉલમ" />
            <Sel k="reg" label="રજીસ્ટર નં. કૉલમ" optional />
            <Sel k="dhoran" label="ધોરણ કૉલમ" optional />
            <Sel k="school" label="School ID કૉલમ" optional />
            <p className="muted">ઉદાહરણ: {sheet.rows.slice(0, 3).map((r) => String(r[map.name] ?? '')).join(' | ')}</p>
            <button className="primary" onClick={doImportGeneric}>ઇમ્પોર્ટ કરો</button>
          </>
        )}
        {msg && <p className="muted">{msg}</p>}
      </div>

      <div className="card">
        <h3>એક વિદ્યાર્થી ઉમેરો</h3>
        <input placeholder="વિદ્યાર્થીનું નામ" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="રજીસ્ટર નં. (વૈકલ્પિક)" value={reg} onChange={(e) => setReg(e.target.value)} />
        <button className="primary" onClick={add}>ઉમેરો</button>
      </div>

      <ul className="list">
        {students?.map((s, i) => (
          <li key={s.id}>
            <span>{i + 1}. {s.name} {s.reg && <small>({s.reg})</small>}</span>
            <button className="link" onClick={() => remove(s.id)}>કાઢો</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
