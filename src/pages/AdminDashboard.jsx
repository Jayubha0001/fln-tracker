import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from '@e965/xlsx';
import { calc, CLASSES, MONTHS, currentMonthKey } from '../lib/category';
import { loadAllRows } from '../lib/loadAllRows';
import DashboardOverview from '../components/DashboardOverview.jsx';
import { isAbsent } from '../lib/absent.js';

const GRADE_TABS = [{ key: '', label: 'બધા ધોરણ' }, ...Object.entries(CLASSES).map(([key, v]) => ({ key, label: v.label }))];
const LEVEL_TITLE = { district: 'જિલ્લો', block: 'તાલુકો', school: 'શાળા' };
const GRADE_KEYS = Object.keys(CLASSES);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const monthLabel = (key) => MONTHS.find((m) => m.key === key)?.label || key;
const defaultMonth = currentMonthKey();

function TriBar({ u, p, n }) {
  const total = u + p + n;
  if (!total) return <div className="dash-bar empty" title="હજી એન્ટ્રી નથી" />;
  return (
    <div className="dash-bar" title={`ઉદયમાન ${u} · પ્રગતિશીલ ${p} · નિપુણ ${n}`}>
      <i className="u" style={{ width: `${pct(u, total)}%` }} />
      <i className="p" style={{ width: `${pct(p, total)}%` }} />
      <i className="n" style={{ width: `${pct(n, total)}%` }} />
    </div>
  );
}

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={`dash-kpi ${tone || ''}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export default function AdminDashboard({ supabase, profile }) {
  const [grade, setGrade] = useState('');
  const [month, setMonth] = useState(defaultMonth);
  const [scope, setScope] = useState(() => profile?.role === 'school' && profile.school_id
    ? {
      district: profile.district || null,
      block: profile.block || null,
      school: {
        id: profile.school_id,
        code: profile.school_code || '',
        name: profile.school_name || 'શાળા',
      },
    }
    : { district: null, block: null, school: null });
  const [groups, setGroups] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [groupsLevel, setGroupsLevel] = useState('district');
  const [schoolRows, setSchoolRows] = useState([]);
  const [absentInfo, setAbsentInfo] = useState({ bySchool: new Map(), byGrade: new Map(), byMonth: new Map() });
  const [gradeReport, setGradeReport] = useState({});
  const [studentProgress, setStudentProgress] = useState(null);
  const [studentProgressError, setStudentProgressError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [live, setLive] = useState(true);
  const [q, setQ] = useState('');
  const reqId = useRef(0);

  const minDepth = profile?.role === 'district' ? 1 : profile?.role === 'block' ? 2 : profile?.role === 'school' ? 3 : 0;
  const level = !scope.district ? 'district' : !scope.block ? 'block' : 'school';
  const dhoran = grade || null;

  const load = useCallback(async (silent = false) => {
    const id = ++reqId.current;
    if (!silent) setBusy(true);
    setError('');
    try {
      const [g, l, ...perGrade] = await Promise.all([
        scope.school
          ? Promise.resolve({ data: [] })
          : supabase.rpc('fln_group_stats', {
            p_group: level, p_district: scope.district, p_block: scope.block, p_dhoran: dhoran, p_month: month,
          }),
        supabase.rpc('fln_ledger', {
          p_district: scope.district, p_block: scope.block, p_school_id: scope.school?.id || null, p_dhoran: dhoran,
        }),
        ...GRADE_KEYS.map((k) => supabase.rpc('fln_ledger', {
          p_district: scope.district, p_block: scope.block, p_school_id: scope.school?.id || null, p_dhoran: k,
        })),
      ]);
      // School-level rows (for 'કેટલી શાળા / કેટલી બાકી'): one row per active school in the current scope.
      let schools = [];
      if (!scope.school) {
        try {
          schools = level === 'school'
            ? (g.data || [])
            : await loadAllRows(supabase.rpc('fln_group_stats', {
              p_group: 'school', p_district: scope.district, p_block: scope.block, p_dhoran: dhoran, p_month: month,
            }).order('school_code'));
        } catch (schoolCause) {
          console.warn('School status could not be loaded:', schoolCause.message);
        }
      }
      // Gerhajar (absent): vidyarthi shala ma chhe pan exam ma nathi; entries ma answers.absent = 'yes'.
      const bySchool = new Map();
      const byGrade = new Map();
      const byMonth = new Map();
      try {
        let absentQuery = supabase.from('entries').select('school_id,dhoran,month').eq('answers->>absent', 'yes');
        if (dhoran) absentQuery = absentQuery.eq('dhoran', dhoran);
        if (scope.school) absentQuery = absentQuery.eq('school_id', scope.school.id);
        const absentRows = await loadAllRows(absentQuery.order('school_id').order('student_id'));
        const inScopeIds = scope.school ? null : new Set(schools.map((item) => item.school_id));
        absentRows.forEach((row) => {
          if (inScopeIds && !inScopeIds.has(row.school_id)) return;
          byMonth.set(row.month, (byMonth.get(row.month) || 0) + 1);
          if (row.month !== month) return;
          bySchool.set(row.school_id, (bySchool.get(row.school_id) || 0) + 1);
          byGrade.set(row.dhoran, (byGrade.get(row.dhoran) || 0) + 1);
        });
      } catch (absentCause) {
        console.warn('Absent counts could not be loaded:', absentCause.message);
      }
      const gradeError = perGrade.find((x) => x.error)?.error;
      if (gradeError) throw gradeError;
      if (g.error) throw g.error;
      if (l.error) throw l.error;
      if (id !== reqId.current) return;
      setGroups(g.data || []);
      setSchoolRows(schools);
      setAbsentInfo({ bySchool, byGrade, byMonth });
      setGroupsLevel(level);
      setLedger(l.data || []);
      setGradeReport(Object.fromEntries(GRADE_KEYS.map((k, i) => {
        const rows = perGrade[i].data || [];
        const cur = rows.find((r) => r.month === month);
        return [k, { registered: Number(rows[0]?.registered || 0), entered: Number(cur?.entered || 0), u: Number(cur?.uday || 0), p: Number(cur?.pragati || 0), n: Number(cur?.nipun || 0) }];
      })));
      setUpdatedAt(new Date());
    } catch (cause) {
      if (id === reqId.current) {
        setError(`Dashboard લોડ ન થયું: ${cause.message}. Supabase SQL Editor માં 202610150002_fln_dashboard_stats.sql migration ચલાવ્યું છે કે નહીં તે તપાસો.`);
      }
    } finally {
      if (id === reqId.current) setBusy(false);
    }
  }, [supabase, level, scope, dhoran, month]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const schoolId = scope.school?.id;
    if (!schoolId) {
      setStudentProgress(null);
      setStudentProgressError('');
      return undefined;
    }
    let active = true;
    setStudentProgress(null);
    setStudentProgressError('');
    const studentQuery = supabase.from('students')
      .select('id,name,dhoran')
      .eq('school_id', schoolId)
      .order('dhoran').order('name');
    const entryQuery = supabase.from('entries')
      .select('student_id,dhoran,month,answers,updated_at')
      .eq('school_id', schoolId)
      .eq('month', month);
    if (grade) {
      studentQuery.eq('dhoran', grade);
      entryQuery.eq('dhoran', grade);
    }
    Promise.all([loadAllRows(studentQuery), loadAllRows(entryQuery)])
      .then(([students, entries]) => {
        if (!active) return;
        const entryByStudent = new Map(entries.map((entry) => [`${entry.student_id}:${entry.dhoran}`, entry]));
        setStudentProgress(students.map((student) => {
          const entry = entryByStudent.get(`${student.id}:${student.dhoran}`) || null;
          const result = calc(student.dhoran, entry?.answers);
          return {
            ...student,
            entry,
            result,
            status: !entry ? 'pending' : isAbsent(entry.answers) ? 'absent' : result.done === result.total ? 'complete' : 'incomplete',
          };
        }));
      })
      .catch((cause) => {
        if (active) setStudentProgressError(`વિદ્યાર્થી પ્રગતિ લોડ થઈ નથી: ${cause.message}`);
      });
    return () => { active = false; };
  }, [supabase, scope.school?.id, month, grade]);

  // Live: koi entry save kare to dashboard automatic update (realtime + 30s fallback)
  useEffect(() => {
    if (!live) return undefined;
    let timer;
    const debounced = () => { clearTimeout(timer); timer = setTimeout(() => load(true), 1500); };
    const channel = supabase.channel('fln-dashboard-entries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, debounced)
      .subscribe();
    const poll = setInterval(() => load(true), 30000);
    return () => { clearTimeout(timer); clearInterval(poll); supabase.removeChannel(channel); };
  }, [supabase, live, load]);

  useEffect(() => {
    if (busy || groupsLevel !== level || groups.length !== 1) return;
    if (level === 'district' && minDepth >= 1) setScope({ district: groups[0].district, block: null, school: null });
    else if (level === 'block' && minDepth >= 2) setScope((c) => ({ ...c, block: groups[0].block }));
  }, [busy, groups, groupsLevel, level, minDepth]);

  const rows = useMemo(() => groups.filter((r) => !q || `${r.group_label} ${r.school_code || ''}`.toLowerCase().includes(q.toLowerCase())), [groups, q]);
  const totals = useMemo(() => groups.reduce((t, r) => ({
    registered: t.registered + Number(r.registered), entered: t.entered + Number(r.entered),
    u: t.u + Number(r.uday), p: t.p + Number(r.pragati), n: t.n + Number(r.nipun),
  }), { registered: 0, entered: 0, u: 0, p: 0, n: 0 }), [groups]);

  const absentByGroup = useMemo(() => {
    const map = new Map();
    schoolRows.forEach((r) => {
      const count = absentInfo.bySchool.get(r.school_id) || 0;
      if (!count) return;
      const key = level === 'district' ? r.district : level === 'block' ? r.block : (r.school_code || r.group_key);
      map.set(key, (map.get(key) || 0) + count);
    });
    return map;
  }, [schoolRows, absentInfo, level]);
  const overviewRows = useMemo(() => {
    if (scope.school) {
      return GRADE_KEYS.filter((k) => !grade || k === grade).map((k) => {
        const r = gradeReport[k] || { registered: 0, entered: 0, u: 0, p: 0, n: 0 };
        return { key: k, label: CLASSES[k].label, ...r, absent: absentInfo.byGrade.get(k) || 0 };
      });
    }
    return groups.map((r) => ({
      key: r.group_key + (r.school_id || ''), label: r.group_label, raw: r,
      registered: Number(r.registered), entered: Number(r.entered),
      u: Number(r.uday), p: Number(r.pragati), n: Number(r.nipun),
      absent: absentByGroup.get(r.group_key) || 0,
    }));
  }, [scope.school, grade, gradeReport, groups, absentInfo, absentByGroup]);
  const schoolStats = useMemo(() => {
    if (scope.school || !schoolRows.length) return null;
    const list = schoolRows.map((r) => ({
      id: r.school_id, code: r.school_code || r.group_key, name: r.group_label, district: r.district, block: r.block,
      registered: Number(r.registered), entered: Number(r.entered),
    }));
    const eligible = list.filter((s) => s.registered > 0);
    const complete = eligible.filter((s) => s.entered >= s.registered).length;
    const pendingList = eligible.filter((s) => s.entered === 0).sort((a, b) => a.name.localeCompare(b.name));
    const partial = eligible.length - complete - pendingList.length;
    return {
      total: list.length, eligible: eligible.length, noStudents: list.length - eligible.length,
      complete, partial, pending: pendingList.length, started: complete + partial, pendingList,
    };
  }, [scope.school, schoolRows]);
  const schoolsByGroup = useMemo(() => {
    const map = new Map();
    schoolRows.forEach((r) => {
      const key = level === 'district' ? r.district : r.block;
      const cur = map.get(key) || { total: 0, pending: 0 };
      cur.total += 1;
      if (Number(r.registered) > 0 && Number(r.entered) === 0) cur.pending += 1;
      map.set(key, cur);
    });
    return map;
  }, [schoolRows, level]);
  const overviewTotals = useMemo(() => overviewRows.reduce((t, r) => ({
    registered: t.registered + r.registered, entered: t.entered + r.entered,
    u: t.u + r.u, p: t.p + r.p, n: t.n + r.n, absent: t.absent + (r.absent || 0),
  }), { registered: 0, entered: 0, u: 0, p: 0, n: 0, absent: 0 }), [overviewRows]);

  const ledgerByMonth = useMemo(() => new Map(ledger.map((r) => [r.month, r])), [ledger]);
  const trend = useMemo(() => MONTHS.map((m) => {
    const r = ledgerByMonth.get(m.key);
    const reg = Number(ledger[0]?.registered || 0);
    return { key: m.key, label: m.label, has: Boolean(r), entryPct: r ? pct(Number(r.entered), reg) : 0, nipunPct: r ? pct(Number(r.nipun), reg) : 0 };
  }), [ledger, ledgerByMonth]);
  const studentProgressCounts = useMemo(() => (studentProgress || []).reduce((counts, student) => {
    counts[student.status] += 1;
    return counts;
  }, { complete: 0, incomplete: 0, pending: 0, absent: 0 }), [studentProgress]);
  const registered = ledger[0] ? Number(ledger[0].registered) : totals.registered;

  function drill(row) {
    setQ('');
    if (level === 'district') setScope({ district: row.district, block: null, school: null });
    else if (level === 'block') setScope({ district: scope.district, block: row.block, school: null });
    else setScope({ ...scope, school: { id: row.school_id, code: row.school_code, name: row.group_label } });
  }
  function goto(depth) {
    setQ('');
    if (depth < minDepth) return;
    setScope((s) => ({
      district: depth >= 1 ? s.district : null,
      block: depth >= 2 ? s.block : null,
      school: depth >= 3 ? s.school : null,
    }));
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    if (!scope.school) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map((r) => ({
        [LEVEL_TITLE[level]]: r.group_label, ...(level === 'school' ? { 'શાળા કોડ': r.school_code } : {}),
        'રજિસ્ટર સંખ્યા': Number(r.registered), 'એન્ટ્રી થયેલ': Number(r.entered),
        'ઉદયમાન': Number(r.uday), 'પ્રગતિશીલ': Number(r.pragati), 'નિપુણ': Number(r.nipun),
        'નિપુણ %': pct(Number(r.nipun), Number(r.registered)),
      }))), 'Group');
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(MONTHS.map((m, i) => {
      const r = ledgerByMonth.get(m.key);
      return {
        'ક્રમ': i + 1, 'માસ': m.label, 'રજિસ્ટર સંખ્યા': registered, 'એન્ટ્રી થયેલ': Number(r?.entered || 0),
        'ઉદયમાન': Number(r?.uday || 0), 'પ્રગતિશીલ': Number(r?.pragati || 0), 'નિપુણ': Number(r?.nipun || 0),
        'FLN સિદ્ધિ %': pct(Number(r?.nipun || 0), registered),
      };
    })), 'Ledger');
    XLSX.writeFile(wb, `fln-dashboard-${scope.school?.code || scope.block || scope.district || 'gujarat'}.xlsx`);
  }

  const crumbs = [
    minDepth === 0 && { label: 'ગુજરાત', depth: 0 },
    scope.district && { label: scope.district, depth: 1 },
    scope.block && { label: scope.block, depth: 2 },
    scope.school && { label: scope.school.name, depth: 3 },
  ].filter(Boolean);
  const gradeInfo = grade ? CLASSES[grade] : null;
  const backCrumb = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  const canGoBack = Boolean(backCrumb && backCrumb.depth >= minDepth);
  const backButton = canGoBack && (
    <button type="button" className="dash-back" onClick={() => { goto(backCrumb.depth); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
      ← પાછા · {backCrumb.label}
    </button>
  );

  return (
    <section className="dash">
      <div className="dash-hero">
        <div>
          <small>NIPUN GUJARAT · FLN ACTION PLAN 2026/27</small>
          <h2>ગણિત ટ્રેકર – Live Dashboard</h2>
          <nav className="dash-crumbs" aria-label="breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.depth}>
                {i > 0 && <em>›</em>}
                <button type="button" disabled={i === crumbs.length - 1} onClick={() => goto(c.depth)}>{c.label}</button>
              </span>
            ))}
          </nav>
        </div>
        <div className="dash-gauge" role="img" aria-label={`FLN સિદ્ધિ ${pct(overviewTotals.n, overviewTotals.registered)}%`}>
          <svg viewBox="0 0 120 78">
            <path d="M10 70 A50 50 0 0 1 110 70" pathLength="100" className="dash-gauge-track" />
            <path d="M10 70 A50 50 0 0 1 110 70" pathLength="100" className="dash-gauge-fill"
              strokeDasharray={`${Math.min(100, pct(overviewTotals.n, overviewTotals.registered))} 100`} />
            <text x="60" y="58" textAnchor="middle" className="dash-gauge-num">{pct(overviewTotals.n, overviewTotals.registered)}%</text>
            <text x="60" y="73" textAnchor="middle" className="dash-gauge-cap">FLN સિદ્ધિ</text>
          </svg>
          <span>એન્ટ્રી {pct(overviewTotals.entered, overviewTotals.registered)}% · નિપુણ {overviewTotals.n.toLocaleString()}</span>
        </div>
        <div className="dash-hero-actions">
          <label className="dash-live"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live</label>
          <button type="button" onClick={() => load()} disabled={busy}>↻ Refresh</button>
          <button type="button" onClick={exportExcel} disabled={busy}>⬇ Excel</button>
          <small>{updatedAt ? `અપડેટ: ${updatedAt.toLocaleTimeString()}` : ''}</small>
        </div>
      </div>

      <div className="dash-controls">
        <div className="dash-chips">
          {GRADE_TABS.map((g) => (
            <button key={g.key || 'all'} type="button" className={grade === g.key ? 'on' : ''} onClick={() => setGrade(g.key)}>{g.label}</button>
          ))}
        </div>
        <label>માસ
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <DashboardOverview
        unitTitle={scope.school ? 'ધોરણ' : LEVEL_TITLE[level]}
        monthLabel={monthLabel(month)}
        rows={overviewRows}
        totals={overviewTotals}
        trend={trend}
        schoolStats={schoolStats}
        gradeCards={scope.school ? [] : GRADE_KEYS.filter((k) => !grade || k === grade).map((k) => ({ key: k, label: CLASSES[k].label, ...(gradeReport[k] || { registered: 0, entered: 0, u: 0, p: 0, n: 0 }), absent: absentInfo.byGrade.get(k) || 0 }))}
        onSelect={scope.school ? undefined : (row) => drill(row.raw)}
      />

      {scope.school && (
        <>
          <div className="dash-kpis">
            <Kpi label="રજિસ્ટર વિદ્યાર્થી" value={studentProgress?.length?.toLocaleString() || '—'} sub={gradeInfo?.label || 'બધાં ધોરણ'} />
            <Kpi label={`${monthLabel(month)} assessed`} value={studentProgress ? (studentProgress.length - studentProgressCounts.pending).toLocaleString() : '—'} />
            <Kpi tone="n" label="પૂર્ણ" value={studentProgress ? studentProgressCounts.complete.toLocaleString() : '—'} />
            <Kpi tone="p" label="અપૂર્ણ" value={studentProgress ? studentProgressCounts.incomplete.toLocaleString() : '—'} />
            <Kpi tone="u" label="બાકી" value={studentProgress ? studentProgressCounts.pending.toLocaleString() : '—'} />
            <Kpi label="ગેરહાજર" value={studentProgress ? studentProgressCounts.absent.toLocaleString() : '—'} />
          </div>
          <div className="card dash-card">
            <div className="row between">
              <h3>વિદ્યાર્થી પ્રમાણે {monthLabel(month)} assessment · {scope.school.name}</h3>
              {backButton}
            </div>
            {studentProgressError && <p className="error" role="alert">{studentProgressError}</p>}
            {!studentProgress && !studentProgressError && <p className="muted" role="status">વિદ્યાર્થી પ્રગતિ લોડ થાય છે…</p>}
            {studentProgress && (
              <div className="scroll dash-scroll">
                <table className="dash-table">
                  <thead><tr><th className="left">વિદ્યાર્થી</th><th>ધોરણ</th><th>સ્થિતિ</th><th>જવાબ / જરૂરી</th><th>છેલ્લે સાચવેલ</th></tr></thead>
                  <tbody>
                    {studentProgress.map((student) => (
                      <tr key={student.id}>
                        <td className="left">{student.name}</td>
                        <td>{CLASSES[student.dhoran]?.label || student.dhoran}</td>
                        <td className={student.status === 'complete' ? 'cn' : student.status === 'incomplete' ? 'cp' : 'cu'}>
                          {student.status === 'complete' ? 'પૂર્ણ' : student.status === 'incomplete' ? 'અપૂર્ણ' : student.status === 'absent' ? 'ગેરહાજર' : 'બાકી'}
                        </td>
                        <td>{student.entry && student.status !== 'absent' ? `${student.result.done}/${student.result.total} · ${student.result.yes} હા` : '—'}</td>
                        <td>{student.entry?.updated_at ? new Date(student.entry.updated_at).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                    {!studentProgress.length && <tr><td colSpan="5" className="muted">આ filter માટે વિદ્યાર્થી મળ્યા નથી.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!scope.school && (
        <div className="card dash-card">
          <div className="row between">
            <h3>{LEVEL_TITLE[level]} પ્રમાણે – {monthLabel(month)} {gradeInfo ? `· ${gradeInfo.label}` : ''}</h3>
            {backButton}
            <div className="dash-table-tools">
              <input className="dash-search" placeholder={`${LEVEL_TITLE[level]} શોધો…`} value={q} onChange={(e) => setQ(e.target.value)} />
              <label>માસ
                <select aria-label="માસ" value={month} onChange={(e) => setMonth(e.target.value)}>
                  {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="scroll dash-scroll">
            <table className="dash-table">
              <thead>
                <tr>
                  <th className="left">{LEVEL_TITLE[level]}</th>
                  {level !== 'school' && <><th>શાળા</th><th>બાકી શાળા</th></>}
                  <th>રજિસ્ટર</th><th>એન્ટ્રી</th>
                  <th className="hu">ઉદયમાન</th><th className="hp">પ્રગતિશીલ</th><th className="hn">નિપુણ</th><th>ગેરહાજર</th>
                  <th className="wide">વિતરણ</th><th>નિપુણ %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.group_key + (r.school_id || '')} onClick={() => drill(r)} className="tap">
                    <td className="left">{r.group_label}{r.school_code && <small> · {r.school_code}</small>}</td>
                    {level !== 'school' && (() => {
                      const info = schoolsByGroup.get(r.group_key) || { total: 0, pending: 0 };
                      return <><td>{info.total}</td><td className={info.pending ? 'cu' : ''}>{info.pending}</td></>;
                    })()}
                    <td>{Number(r.registered).toLocaleString()}</td>
                    <td>{Number(r.entered).toLocaleString()} <small>({pct(Number(r.entered), Number(r.registered))}%)</small></td>
                    <td className="cu">{r.uday}</td><td className="cp">{r.pragati}</td><td className="cn">{r.nipun}</td>
                    <td className="ca">{absentByGroup.get(r.group_key) || 0}</td>
                    <td><TriBar u={Number(r.uday)} p={Number(r.pragati)} n={Number(r.nipun)} /></td>
                    <td><b>{pct(Number(r.nipun), Number(r.registered))}%</b></td>
                  </tr>
                ))}
                {!rows.length && !busy && <tr><td colSpan={level === 'school' ? 9 : 11} className="muted">કોઈ ડેટા મળ્યો નથી.</td></tr>}
              </tbody>
              {rows.length > 0 && (
                <tfoot><tr>
                  <td className="left">કુલ</td>
                  {level !== 'school' && <><td>{schoolStats?.total ?? '—'}</td><td className="cu">{schoolStats?.pending ?? '—'}</td></>}
                  <td>{totals.registered.toLocaleString()}</td><td>{totals.entered.toLocaleString()}</td>
                  <td className="cu">{totals.u}</td><td className="cp">{totals.p}</td><td className="cn">{totals.n}</td><td className="ca">{overviewTotals.absent}</td>
                  <td><TriBar u={totals.u} p={totals.p} n={totals.n} /></td><td><b>{pct(totals.n, totals.registered)}%</b></td>
                </tr></tfoot>
              )}
            </table>
          </div>
          {canGoBack && <div className="dash-back-foot">{backButton}</div>}
        </div>
      )}

      {/* PDF jevu Leader / Ledger */}
      <div className="card dash-ledger">
        <div className="dash-ledger-head">
          <b>ગણિત ટ્રેકર (લેજર)</b>
          <span>{gradeInfo ? `${gradeInfo.label} માટે` : 'બાલવાટિકા થી ધોરણ 2 માટે'}</span>
          <small>{scope.school ? `${scope.school.name} · ${scope.school.code}` : crumbs.map((c) => c.label).join(' › ')}</small>
        </div>
        <div className="scroll">
          <table className="dash-ledger-table">
            <thead>
              <tr>
                <th rowSpan="2">ક્રમ</th><th rowSpan="2">માસનું નામ</th><th rowSpan="2">ધોરણની રજિસ્ટર સંખ્યા</th><th rowSpan="2">ગેરહાજર</th>
                <th colSpan="3" className="span">FOUNDATIONAL LITERACY AND NUMERACY – FLN ના વિદ્યાર્થીઓની સંખ્યા</th>
                <th rowSpan="2">FLN માં સિદ્ધિ મેળવેલ વિદ્યાર્થીઓની ટકાવારી</th>
              </tr>
              <tr>
                <th className="hu">ઉદયમાન<br /><small>0 થી 30 %</small></th>
                <th className="hp">પ્રગતિશીલ<br /><small>31 થી 79 %</small></th>
                <th className="hn">નિપુણ<br /><small>80 % કે તેથી વધુ</small></th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((m, i) => {
                const r = ledgerByMonth.get(m.key);
                const has = Boolean(r);
                return (
                  <tr key={m.key} className={m.key === month ? 'cur' : ''}>
                    <td>{i + 1}</td><td className="left">{m.label}</td>
                    <td>{registered || '—'}</td>
                    <td className="ca">{absentInfo.byMonth.get(m.key) ?? (has ? 0 : '—')}</td>
                    <td className="cu">{has ? r.uday : '—'}</td><td className="cp">{has ? r.pragati : '—'}</td><td className="cn">{has ? r.nipun : '—'}</td>
                    <td>{has ? <b>{pct(Number(r.nipun), registered)}%</b> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h4>સિદ્ધ કરેલ વિધાનોની સંખ્યા પ્રમાણે રિપોર્ટ – {monthLabel(month)}</h4>
        <div className="scroll">
          <table className="dash-rules">
            <thead>
              <tr>
                <th rowSpan="2">ધોરણ</th><th rowSpan="2">કુલ વિધાન</th><th rowSpan="2">રજિસ્ટર</th><th rowSpan="2">ગેરહાજર</th><th rowSpan="2">એન્ટ્રી</th>
                <th colSpan="3" className="span">સિદ્ધ કરેલ વિધાનોની સંખ્યા → વિદ્યાર્થીઓ</th>
              </tr>
              <tr><th className="hu">ઉદયમાન</th><th className="hp">પ્રગતિશીલ</th><th className="hn">નિપુણ</th></tr>
            </thead>
            <tbody>
              {GRADE_KEYS.filter((k) => !grade || k === grade).map((k) => {
                const c = CLASSES[k];
                const r = gradeReport[k] || { registered: 0, entered: 0, u: 0, p: 0, n: 0 };
                return (
                  <tr key={k}>
                    <td className="left"><b>{c.label}</b></td><td>{c.total}</td><td>{r.registered}</td><td className="ca">{absentInfo.byGrade.get(k) || 0}</td>
                    <td>{r.entered} <small>({pct(r.entered, r.registered)}%)</small></td>
                    <td className="rb u"><small>{c.udayMax} કે તેથી ઓછા</small><b>{r.u}</b></td>
                    <td className="rb p"><small>{c.udayMax + 1} થી {c.nipunMin - 1}</small><b>{r.p}</b></td>
                    <td className="rb n"><small>{c.nipunMin} કે તેથી વધુ</small><b>{r.n}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted">નિપુણ % = નિપુણ વિદ્યાર્થી ÷ રજિસ્ટર સંખ્યા. બધાં વિધાનોમાં હા/ના ભરેલી એન્ટ્રી જ ઉદયમાન/પ્રગતિશીલ/નિપુણમાં ગણાય છે.</p>
      </div>
    </section>
  );
}
