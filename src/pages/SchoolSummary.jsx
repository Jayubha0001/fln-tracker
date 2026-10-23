import { useEffect, useMemo, useState } from 'react';
import * as XLSX from '@e965/xlsx';
import { CAT, CLASSES, MONTHS, calc } from '../lib/category';
import { STATEMENTS } from '../data/statements';
import { loadAllRows } from '../lib/loadAllRows';
import { SummaryGuide } from '../components/SummaryHelp.jsx';
import { isAbsent } from '../lib/absent.js';

const GRADES = Object.keys(CLASSES);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const monthLabel = (key) => MONTHS.find((m) => m.key === key)?.label || key;

function TriBar({ u, p, n }) {
  const t = u + p + n;
  if (!t) return <div className="dash-bar empty" />;
  return (
    <div className="dash-bar big" title={`ઉદયમાન ${u} · પ્રગતિશીલ ${p} · નિપુણ ${n}`}>
      <i className="u" style={{ width: `${pct(u, t)}%` }} /><i className="p" style={{ width: `${pct(p, t)}%` }} /><i className="n" style={{ width: `${pct(n, t)}%` }} />
    </div>
  );
}

export default function SchoolSummary({ supabase, school, dhoran, month }) {
  const [students, setStudents] = useState(null);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('U');
  const [teacher, setTeacher] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`fln-school-${school.id}`))?.teacher || ''; } catch { return ''; }
  });

  useEffect(() => {
    let on = true;
    setStudents(null); setEntries(null); setError('');
    Promise.all([
      loadAllRows(supabase.from('students').select('*').eq('school_id', school.id).order('name')),
      loadAllRows(supabase.from('entries').select('*').eq('school_id', school.id)),
    ]).then(([s, e]) => { if (on) { setStudents(s); setEntries(e); } })
      .catch((c) => { if (on) setError(`સારાંશ લોડ થઈ શક્યો નથી: ${c.message}`); });
    return () => { on = false; };
  }, [supabase, school.id]);

  function saveTeacher(value) {
    setTeacher(value);
    try {
      const cur = JSON.parse(localStorage.getItem(`fln-school-${school.id}`)) || {};
      localStorage.setItem(`fln-school-${school.id}`, JSON.stringify({ ...cur, teacher: value }));
    } catch { /* teacher name only stored on this device */ }
  }

  const data = useMemo(() => {
    if (!students || !entries) return null;
    const byGrade = {};
    for (const g of GRADES) {
      const sts = students.filter((s) => s.dhoran === g);
      const ids = new Set(sts.map((s) => s.id));
      const gEntries = entries.filter((e) => e.dhoran === g && ids.has(e.student_id));
      const monthEntries = new Map(gEntries.filter((e) => e.month === month).map((e) => [e.student_id, e]));
      const entriesByStudentMonth = new Map(gEntries.map((entry) => [`${entry.student_id}:${entry.month}`, entry]));
      const rows = sts.map((student) => {
        const entry = monthEntries.get(student.id);
        const history = MONTHS.map((item) => {
          const monthEntry = entriesByStudentMonth.get(`${student.id}:${item.key}`) || null;
          return { ...item, entry: monthEntry, result: calc(g, monthEntry?.answers) };
        });
        return { student, entry, r: calc(g, entry?.answers), history };
      });
      const cnt = { U: 0, P: 0, N: 0 };
      rows.forEach((x) => { if (x.r.cat) cnt[x.r.cat] += 1; });
      const ledger = MONTHS.map((m, i) => {
        const c = { U: 0, P: 0, N: 0 };
        gEntries.filter((e) => e.month === m.key).forEach((e) => { const r = calc(g, e.answers); if (r.cat) c[r.cat] += 1; });
        return { no: i + 1, label: m.label, key: m.key, ...c, done: c.U + c.P + c.N };
      });
      const skills = (STATEMENTS[g] || []).map((st, i) => {
        const vals = rows.map((x) => x.entry?.answers?.[st.n]).filter((v) => v !== undefined);
        const yes = vals.filter((v) => v === true).length;
        return { no: i + 1, area: st.area, text: st.text, yes, answered: vals.length, p: vals.length ? pct(yes, vals.length) : null };
      });
      byGrade[g] = {
        total: sts.length,
        saved: monthEntries.size,
        incomplete: rows.filter((row) => row.entry && !row.r.cat && !isAbsent(row.entry.answers)).length,
        absent: rows.filter((row) => row.entry && isAbsent(row.entry.answers)).length,
        rows,
        cnt,
        ledger,
        skills,
        register: sts.length,
      };
    }
    return byGrade;
  }, [students, entries, month]);

  if (!data) return <p className={error ? 'error' : ''} role={error ? 'alert' : undefined}>{error || 'લોડ થાય છે…'}</p>;

  const g = data[dhoran];
  const info = CLASSES[dhoran];
  const allTotal = GRADES.reduce((t, k) => t + data[k].total, 0);
  const allSaved = GRADES.reduce((t, k) => t + data[k].saved, 0);
  const allIncomplete = GRADES.reduce((t, k) => t + data[k].incomplete, 0);
  const allAbsent = GRADES.reduce((t, k) => t + data[k].absent, 0);
  const allN = GRADES.reduce((t, k) => t + data[k].cnt.N, 0);
  const weakest = g.skills.filter((s) => s.p !== null).sort((a, b) => a.p - b.p).slice(0, 3);
  const list = tab === 'T'
    ? g.rows.filter((x) => !x.entry || !x.r.cat)
    : g.rows.filter((x) => x.r.cat === tab);

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(GRADES.map((k) => ({
      'ધોરણ': CLASSES[k].label, 'રજિસ્ટર': data[k].total, 'એન્ટ્રી': data[k].saved,
      'ઉદયમાન': data[k].cnt.U, 'પ્રગતિશીલ': data[k].cnt.P, 'નિપુણ': data[k].cnt.N, 'નિપુણ %': pct(data[k].cnt.N, data[k].total),
    }))), 'ધોરણ સારાંશ');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(g.rows.map((x, i) => ({
      'ક્રમ': i + 1, 'વિદ્યાર્થી': x.student.name, 'હા': x.r.yes, 'કુલ': x.r.total,
      'પરિણામ': x.r.cat ? CAT[x.r.cat].label : x.entry ? 'અપૂર્ણ' : 'બાકી',
    }))), 'વિદ્યાર્થી');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(g.ledger.map((r) => ({
      'ક્રમ': r.no, 'માસ': r.label, 'રજિસ્ટર': g.register, 'ઉદયમાન': r.U, 'પ્રગતિશીલ': r.P, 'નિપુણ': r.N, 'FLN %': pct(r.N, g.register),
    }))), 'લેજર');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(g.skills.map((s) => ({
      'વિધાન': s.no, 'ક્ષેત્ર': s.area, 'લખાણ': s.text, 'હા': s.yes, 'જવાબ': s.answered, 'હા %': s.p ?? '',
    }))), 'વિધાન');
    XLSX.writeFile(wb, `FLN_${school.code}_${info.label}_${month}.xlsx`);
  }

  return (
    <div className="ss">
      <SummaryGuide scopeLabel="તમારી શાળા" />
      <div className="ss-actions no-print">
        <button onClick={() => window.print()}>🖨 PDF / પ્રિન્ટ</button>
        <button onClick={exportExcel}>⬇ Excel</button>
      </div>

      <div className="dash-kpis">
        <div className="dash-kpi"><span>કુલ વિદ્યાર્થી</span><b>{allTotal}</b><small>3 ધોરણ</small></div>
        <div className="dash-kpi"><span>{monthLabel(month)} એન્ટ્રી</span><b>{allSaved}</b><small>{pct(allSaved, allTotal)}% · ગેરહાજર સહિત</small></div>
        <div className="dash-kpi p"><span>અપૂર્ણ મૂલ્યાંકન</span><b>{allIncomplete}</b><small>બધા જવાબ હજી નોંધાયા નથી</small></div>
        <div className="dash-kpi n"><span>નિપુણ</span><b>{allN}</b><small>{pct(allN, allTotal)}% વિદ્યાર્થી</small></div>
        <div className="dash-kpi"><span>ગેરહાજર</span><b>{allAbsent}</b><small>શાળામાં છે, પરીક્ષામાં નથી</small></div>
        <div className="dash-kpi u"><span>બાકી assessment</span><b>{allTotal - allSaved}</b><small>હાલના મહિને entry નથી</small></div>
      </div>

      <div className="ss-grades">
        {GRADES.map((k) => {
          const x = data[k];
          return (
            <div key={k} className={`ss-grade ${k === dhoran ? 'cur' : ''}`}>
              <div className="row between"><b>{CLASSES[k].label}</b><small>{x.saved}/{x.total} એન્ટ્રી</small></div>
              <TriBar u={x.cnt.U} p={x.cnt.P} n={x.cnt.N} />
              <div className="entry-tri"><span className="u">{x.cnt.U}</span><span className="p">{x.cnt.P}</span><span className="n">{x.cnt.N}</span><small>નિપુણ {pct(x.cnt.N, x.total)}%</small></div>
            </div>
          );
        })}
      </div>

      <div className="card dash-ledger">
        <div className="dash-ledger-head">
          <b>ગણિત ટ્રેકર (લેજર)</b>
          <span>{info.label} · {school.name} ({school.code})</span>
          <small>{school.district} › {school.block} › {school.cluster}</small>
        </div>
        <label className="ss-teacher">વર્ગ શિક્ષકનું નામ <input value={teacher} onChange={(e) => saveTeacher(e.target.value)} /></label>
        <div className="scroll">
          <table className="dash-ledger-table">
            <thead>
              <tr><th rowSpan="2">ક્રમ</th><th rowSpan="2">માસ</th><th rowSpan="2">રજિસ્ટર</th><th colSpan="3" className="span">FLN ના વિદ્યાર્થીઓની સંખ્યા</th><th rowSpan="2">FLN સિદ્ધિ %</th></tr>
              <tr><th className="hu">ઉદયમાન<br /><small>0–30%</small></th><th className="hp">પ્રગતિશીલ<br /><small>31–79%</small></th><th className="hn">નિપુણ<br /><small>80%+</small></th></tr>
            </thead>
            <tbody>
              {g.ledger.map((r) => (
                <tr key={r.key} className={r.key === month ? 'cur' : ''}>
                  <td>{r.no}</td><td className="left">{r.label}</td><td>{r.done ? g.register : '—'}</td>
                  <td className="cu">{r.done ? r.U : '—'}</td><td className="cp">{r.done ? r.P : '—'}</td><td className="cn">{r.done ? r.N : '—'}</td>
                  <td>{r.done ? <b>{pct(r.N, g.register)}%</b> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">ઉદયમાન ≤ {info.udayMax} · પ્રગતિશીલ {info.udayMax + 1}–{info.nipunMin - 1} · નિપુણ ≥ {info.nipunMin} વિધાન (કુલ {info.total}).</p>
      </div>

      <div className="card">
        <h3>🎯 વિધાન પ્રમાણે પરિણામ – {info.label} · {monthLabel(month)}</h3>
        {weakest.length > 0 && (
          <div className="ss-weak"><b>સુધારાની જરૂર:</b> {weakest.map((s) => <span key={s.no}>#{s.no} ({s.p}%)</span>)}</div>
        )}
        {g.skills.map((s) => (
          <div className="ss-skill" key={s.no}>
            <span className="ss-no">{s.no}</span>
            <div className="ss-skill-body"><small>{s.area}</small><div>{s.text}</div>
              <div className="dash-bar"><i className={s.p !== null && s.p < 50 ? 'u' : 'n'} style={{ width: `${s.p || 0}%` }} /></div>
            </div>
            <b>{s.p === null ? '—' : `${s.p}%`}</b>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>👥 વિદ્યાર્થી યાદી – {info.label}</h3>
        <div className="entry-filter">
          {[['U', `ઉદયમાન (${g.cnt.U})`], ['P', `પ્રગતિશીલ (${g.cnt.P})`], ['N', `નિપુણ (${g.cnt.N})`], ['T', `બાકી / અપૂર્ણ (${g.total - g.cnt.U - g.cnt.P - g.cnt.N})`]].map(([k, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <ul className="stu-list">
          {list.map((x) => (
            <li key={x.student.id} className="student-progress-row">
              <div className={`stu ${x.r.cat ? `c-${x.r.cat.toLowerCase()}` : ''}`}>
                <span className="stu-no">{g.rows.indexOf(x) + 1}</span><span className="stu-name">{x.student.name}</span>
                <span className="badge todo">{x.entry ? `${x.r.done}/${x.r.total}` : 'બાકી'}</span>
              </div>
              <details className="student-progress-details">
                <summary>માસિક પ્રગતિ અને કૌશલ્ય</summary>
                <div className="scroll">
                  <table className="student-month-history">
                    <thead><tr><th>માસ</th><th>સ્થિતિ</th><th>હા / પૂર્ણ</th></tr></thead>
                    <tbody>{x.history.map((item) => (
                      <tr key={item.key}>
                        <td>{item.label}</td>
                        <td>{!item.entry ? 'બાકી' : item.result.cat ? CAT[item.result.cat].label : 'અપૂર્ણ'}</td>
                        <td>{item.entry ? `${item.result.yes}/${item.result.total}` : '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <h4>{monthLabel(month)}ના કૌશલ્ય પરિણામ</h4>
                {!x.entry && <p className="muted">આ મહિના માટે assessment entry નથી.</p>}
                {x.entry && x.r.cat === 'U' && <p className="muted">વર્તમાન પરિણામ ઉદયમાન છે; અનુસરણ માટે કૌશલ્ય પરિણામો જુઓ.</p>}
                {x.entry && <ul className="student-skill-progress">
                  {(STATEMENTS[dhoran] || []).map((statement) => {
                    const answer = x.entry.answers?.[statement.n];
                    return (
                      <li key={statement.n} className={answer === false ? 'needs-follow-up' : ''}>
                        <b>#{statement.n} · {answer === true ? 'હા' : answer === false ? 'ના' : 'જવાબ બાકી'}</b>
                        <span>{statement.area} · {statement.text}</span>
                      </li>
                    );
                  })}
                </ul>}
              </details>
            </li>
          ))}
          {!list.length && <li className="muted">આ filter માટે કોઈ વિદ્યાર્થી નથી.</li>}
        </ul>
      </div>
    </div>
  );
}
