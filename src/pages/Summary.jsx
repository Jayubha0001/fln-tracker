import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { db } from '../db';
import { CLASSES, CAT, MONTHS, calc } from '../lib/category';
import { SCHOOL } from '../config/school';

function loadInfo() {
  try { return JSON.parse(localStorage.getItem('fln-school')) || {}; } catch { return {}; }
}

export default function Summary({ dhoran, month }) {
  const students = useLiveQuery(() => db.students.where('dhoran').equals(dhoran).sortBy('name'), [dhoran]);
  const entries = useLiveQuery(() => db.entries.filter((e) => e.dhoran === dhoran).toArray(), [dhoran]);
  const [info, setInfo] = useState(loadInfo);
  if (!students || !entries) return <p>લોડ થાય છે…</p>;

  const upd = (k, v) => {
    const n = { ...info, [k]: v };
    setInfo(n);
    try { localStorage.setItem('fln-school', JSON.stringify(n)); } catch { /* ignore */ }
  };

  const c = CLASSES[dhoran];
  const rows = MONTHS.map((m, i) => {
    let U = 0, P = 0, N = 0;
    for (const e of entries.filter((x) => x.month === m.key)) {
      const r = calc(dhoran, e.answers);
      if (!r.cat) continue; // adhuri entry ginti ma nahi
      if (r.cat === 'U') U++; else if (r.cat === 'P') P++; else N++;
    }
    const done = U + P + N;
    return {
      no: i + 1, month: m.label, register: students.length, U, P, N, done,
      pct: done && students.length ? Math.round((N / students.length) * 1000) / 10 : '',
    };
  });

  function download() {
    const data = rows.map((r) => ({
      'ક્રમ': r.no, 'માસ': r.month, 'રજીસ્ટર સંખ્યા': r.register,
      'ઉદયમાન': r.U, 'પ્રગતિશીલ': r.P, 'નિપુણ': r.N, 'FLN સિદ્ધિ %': r.pct,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Tracker');
    XLSX.writeFile(wb, `FLN_Maths_Tracker_${c.label}.xlsx`);
  }

  const monthLabel = MONTHS.find((m) => m.key === month)?.label;
  const monthEntries = Object.fromEntries(
    entries.filter((e) => e.month === month).map((e) => [e.studentId, e])
  );

  return (
    <div>
      <div className="row no-print">
        <button className="primary" onClick={() => window.print()}>PDF / પ્રિન્ટ</button>
        <button onClick={download}>Excel</button>
      </div>
      <p className="muted no-print">પ્રિન્ટ વિન્ડોમાં "Save as PDF" પસંદ કરો. શાળા વગેરે વિગત એક વાર ભરો, સેવ થઈ જશે.</p>

      <div className="sheet">
        <div className="sheet-head">
          <div className="t1">જીસીઈઆરટી, ગાંધીનગર</div>
          <div className="t2">NIPUN GUJARAT</div>
          <div className="t3">FLN ACTION PLAN</div>
          <div className="t4">વર્ષ : 2026/27</div>
          <div className="t5">ગણિત ટ્રેકર (લેડર)</div>
          <div className="t6">બાલવાટિકા થી ધોરણ 2 માટે</div>
        </div>

        <div className="fields">
          <div>શાળા: <b>{SCHOOL.name}</b> ({SCHOOL.id})</div>
          <div>તાલુકો: <b>{SCHOOL.block}</b></div>
          <div>જિલ્લો: <b>{SCHOOL.district}</b></div>
          <div>ક્લસ્ટર: <b>{SCHOOL.cluster}</b></div>
          <label>વર્ગ શિક્ષકનું નામ: <input value={info.teacher || ''} onChange={(e) => upd('teacher', e.target.value)} /></label>
          <div>ધોરણ: <b>{c.label}</b></div>
        </div>

        <table className="ledger">
          <thead>
            <tr>
              <th rowSpan="3">ક્રમ</th>
              <th rowSpan="3">માસનું નામ</th>
              <th rowSpan="3">ધોરણની રજિસ્ટર સંખ્યા</th>
              <th colSpan="3">FOUNDATIONAL LITERACY AND NUMERACY<br />FLN માં વિદ્યાર્થીઓની સંખ્યા</th>
              <th rowSpan="3">FLN માં સિદ્ધિ મેળવેલ વિદ્યાર્થીઓની ટકાવારી</th>
            </tr>
            <tr className="sub">
              <th>ઉદયમાન</th><th>પ્રગતિશીલ</th><th>નિપુણ</th>
            </tr>
            <tr className="sub">
              <th>0 થી 30 %</th><th>31 થી 79 %</th><th>80 % કે તેથી વધુ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.no}>
                <td>{r.no}</td><td className="left">{r.month}</td>
                <td>{r.done ? r.register : ''}</td>
                <td>{r.done ? r.U : ''}</td><td>{r.done ? r.P : ''}</td><td>{r.done ? r.N : ''}</td>
                <td>{r.pct !== '' ? `${r.pct}%` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="ledger thr">
          <thead>
            <tr><th colSpan="5">સિધ્ધ કરેલા વિધાનોની સંખ્યા</th></tr>
            <tr className="sub"><th>ધોરણ</th><th>કુલ વિધાન</th><th>ઉદયમાન (0 થી 30 %)</th><th>પ્રગતિશીલ (31 થી 79 %)</th><th>નિપુણ (80 % કે તેથી વધુ)</th></tr>
          </thead>
          <tbody>
            {Object.entries(CLASSES).map(([k, x]) => (
              <tr key={k} className={k === dhoran ? 'cur' : ''}>
                <td>{x.label}</td><td>{x.total}</td>
                <td className="cu">{x.udayMax} કે તેથી ઓછા</td>
                <td className="cp">{x.udayMax + 1} થી {x.nipunMin - 1}</td>
                <td className="cn">{x.nipunMin} કે તેથી વધુ</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="no-print">
        <h3>{c.label} – {monthLabel}: વિદ્યાર્થી-વાર પરિણામ</h3>
        <ul className="list">
          {students.map((s, i) => {
            const st = calc(dhoran, monthEntries[s.id]?.answers);
            return (
              <li key={s.id}>
                <span>{i + 1}. {s.name}</span>
                {st.cat ? (
                  <span className={`badge ${CAT[st.cat].cls}`}>{CAT[st.cat].label} ({st.yes}/{st.total})</span>
                ) : (
                  <span className="badge todo">{st.done ? `${st.done}/${st.total}` : 'બાકી'}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
