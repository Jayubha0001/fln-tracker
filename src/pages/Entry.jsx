import { useEffect, useRef, useState } from 'react';
import { CAT, calc } from '../lib/category';
import { STATEMENTS, STEP, NO_STEP_AREA, LEVEL_LABEL } from '../data/statements';
import { loadAllRows } from '../lib/loadAllRows';

export default function Entry({ supabase, school, dhoran, month, onDirtyChange }) {
  const [students, setStudents] = useState(null);
  const [entries, setEntries] = useState(null);
  const [draft, setDraft] = useState({});
  const [view, setView] = useState('grid');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [rowErrors, setRowErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [assessmentDate, setAssessmentDate] = useState(() => defaultAssessmentDate(month));
  const [assessmentDateDirty, setAssessmentDateDirty] = useState(false);
  // Nava vidyarthi mate badha vidhan pahelethi ✓ (haa); khota hoy te j ✗ karo.
  const [defaultYes, setDefaultYes] = useState(() => {
    try { return localStorage.getItem('fln-entry-default-yes') !== '0'; } catch { return true; }
  });
  const toggleDefaultYes = (value) => {
    setDefaultYes(value);
    try { localStorage.setItem('fln-entry-default-yes', value ? '1' : '0'); } catch { /* storage unavailable */ }
  };

  const dirty = Object.keys(draft).length > 0 || (assessmentDateDirty && entries?.length > 0);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    const warnBeforeLeave = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [dirty]);

  useEffect(() => {
    let mounted = true;
    setStudents(null);
    setEntries(null);
    setDraft({});
    setError('');
    setSavedMessage('');
    setRowErrors([]);
    async function load() {
      const studentQuery = supabase.from('students').select('*')
        .eq('school_id', school.id).eq('dhoran', dhoran).order('name');
      const entryQuery = supabase.from('entries').select('*')
        .eq('school_id', school.id).eq('dhoran', dhoran).eq('month', month);
      const [studentRows, entryRows] = await Promise.all([
        loadAllRows(studentQuery),
        loadAllRows(entryQuery),
      ]);
      if (mounted) {
        setStudents(studentRows);
        setEntries(entryRows);
        const savedDates = [...new Set(entryRows.map((entry) => entry.assessment_date).filter(Boolean))];
        if (savedDates.length === 1) setAssessmentDate(savedDates[0]);
        else if (!savedDates.length) setAssessmentDate(defaultAssessmentDate(month));
        setAssessmentDateDirty(false);
      }
    }
    load().catch((cause) => {
      if (mounted) setError(`વિદ્યાર્થી/એન્ટ્રી લોડ થઈ નથી: ${cause.message}`);
    });
    return () => { mounted = false; };
  }, [supabase, school.id, dhoran, month]);

  useEffect(() => {
    setAssessmentDate(defaultAssessmentDate(month));
    setAssessmentDateDirty(false);
  }, [month]);

  function changeAnswers(studentId, answers) {
    setDraft((current) => ({ ...current, [studentId]: answers }));
    onDirtyChange?.(true);
    setSavedMessage('');
    setRowErrors((current) => current.filter((item) => item.studentId !== studentId));
  }

  const allYesAnswers = () => Object.fromEntries((STATEMENTS[dhoran] || []).map((statement) => [statement.n, true]));
  const unsavedDefaults = () => (defaultYes && students && entries
    ? students.filter((student) => !entries.some((entry) => entry.student_id === student.id) && !draft[student.id])
    : []);

  async function saveChanges() {
    if (savingRef.current) return;
    const seededRows = unsavedDefaults();
    if (!dirty && !seededRows.length) return;
    if (seededRows.length && !window.confirm(
      `${seededRows.length} વિદ્યાર્થીની બધી વિધાન ✓ (હા) તરીકે સાચવાશે.\n\nજે ખોટા હોય તે ✗ કર્યા હોય તો જ આગળ વધો. સાચવીએ?`
    )) return;
    savingRef.current = true;
    setSaving(true);
    setSavedMessage('');
    setError('');
    setRowErrors([]);
    let successfulRows = 0;
    const failures = [];
    const savedRows = [];
    const pendingByStudent = new Map(Object.entries(draft).map(([studentId, answers]) => [studentId, answers]));
    seededRows.forEach((student) => pendingByStudent.set(student.id, allYesAnswers()));
    if (assessmentDateDirty) {
      entries.forEach((entry) => {
        if (!pendingByStudent.has(entry.student_id)) pendingByStudent.set(entry.student_id, entry.answers || {});
      });
    }
    const pending = [...pendingByStudent.entries()];

    for (const [studentId, answers] of pending) {
      const student = students.find((item) => item.id === studentId);
      const row = {
        student_id: studentId,
        school_id: school.id,
        month,
        dhoran,
        assessment_date: assessmentDate || null,
        answers,
        updated_at: new Date().toISOString(),
      };
      let saveError;
      try {
        ({ error: saveError } = await supabase.from('entries').upsert(row, {
          onConflict: 'student_id,month,dhoran',
        }));
      } catch (cause) {
        saveError = { message: cause.message || 'Supabase request નિષ્ફળ.' };
      }
      if (saveError) {
        failures.push({
          studentId,
          label: student?.name || studentId,
          message: saveError.message,
        });
      } else {
        successfulRows += 1;
        savedRows.push(row);
      }
    }

    if (savedRows.length) {
      setEntries((current) => {
        const next = new Map((current || []).map((entry) => [entry.student_id, entry]));
        savedRows.forEach((row) => next.set(row.student_id, row));
        return [...next.values()];
      });
      setDraft((current) => {
        const next = { ...current };
        savedRows.forEach((row) => delete next[row.student_id]);
        return next;
      });
      setSavedMessage(`${successfulRows} વિદ્યાર્થીની એન્ટ્રી Supabaseમાં સાચવાઈ.`);
      if (!failures.length) setAssessmentDateDirty(false);
    }
    setRowErrors(failures);
    if (failures.length) {
      setError(`${failures.length} વિદ્યાર્થીની એન્ટ્રી સાચવાઈ નથી. નીચેની ભૂલો સુધારીને ફરી સાચવો.`);
    }
    savingRef.current = false;
    setSaving(false);
  }

  if (!students || !entries) {
    return <div>{error ? <p className="error" role="alert">{error}</p> : <p>લોડ થાય છે…</p>}</div>;
  }
  if (!students.length) return <p>પહેલા "વિદ્યાર્થી" ટેબમાં વિદ્યાર્થી ઉમેરો.</p>;

  const byStudent = Object.fromEntries(entries.map((entry) => [entry.student_id, entry]));
  const visibleByStudent = Object.fromEntries(entries.map((entry) => [entry.student_id, entry]));
  Object.entries(draft).forEach(([studentId, answers]) => {
    visibleByStudent[studentId] = { ...byStudent[studentId], student_id: studentId, answers };
  });
  const seeded = unsavedDefaults();
  seeded.forEach((student) => {
    visibleByStudent[student.id] = { student_id: student.id, answers: allYesAnswers(), seeded: true };
  });
  const wrongCount = students.reduce((sum, student) => sum
    + Object.values(visibleByStudent[student.id]?.answers || {}).filter((value) => value === false).length, 0);
  if (view === 'card' && openId !== null) {
    const index = students.findIndex((student) => student.id === openId);
    if (index >= 0) {
      return (
        <div>
          {error && <p className="error" role="alert">{error}</p>}
          <StudentForm
            key={openId}
            student={students[index]}
            index={index}
            count={students.length}
            dhoran={dhoran}
            answers={visibleByStudent[openId]?.answers || {}}
            onChange={(answers) => changeAnswers(openId, answers)}
            onPrev={() => index > 0 && setOpenId(students[index - 1].id)}
            onNext={() => (index < students.length - 1 ? setOpenId(students[index + 1].id) : setOpenId(null))}
            onClose={() => setOpenId(null)}
            saving={saving}
            onSave={saveChanges}
          />
          {savedMessage && <p className="success" role="status">{savedMessage}</p>}
          <RowSaveErrors errors={rowErrors} />
        </div>
      );
    }
  }

  const liveStatus = (student) => calc(dhoran, visibleByStudent[student.id]?.answers);
  const statuses = new Map(students.map((student) => [student.id, liveStatus(student)]));
  const doneCount = students.filter((student) => statuses.get(student.id).cat).length;
  const tri = { U: 0, P: 0, N: 0 };
  students.forEach((student) => { const c = statuses.get(student.id).cat; if (c) tri[c] += 1; });
  const shown = students.filter((student) => {
    const st = statuses.get(student.id);
    if (filter === 'todo' && st.cat) return false;
    if (filter === 'done' && !st.cat) return false;
    return !q || student.name.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div className="entry-wrap">
      <div className="entry-top">
        <div className="entry-progress">
          <div className="entry-progress-head">
            <span><b>{doneCount}</b> / {students.length} વિદ્યાર્થી પૂર્ણ</span>
            {(dirty || seeded.length > 0) && (
              <span className="entry-dirty">● {seeded.length > 0 ? `${seeded.length} વિદ્યાર્થી ડિફોલ્ટ ✓ સાથે સાચવવાના બાકી` : 'સાચવવાના ફેરફાર છે'}</span>
            )}
          </div>
          <div className="dash-bar big"><i className="n" style={{ width: `${students.length ? (doneCount / students.length) * 100 : 0}%` }} /></div>
          <div className="entry-tri">
            <span className="u">ઉદયમાન {tri.U}</span><span className="p">પ્રગતિશીલ {tri.P}</span><span className="n">નિપુણ {tri.N}</span>
          </div>
        </div>
        <label className="assessment-date">
          મૂલ્યાંકન તારીખ
          <input
            type="date"
            value={assessmentDate}
            min={`${month}-01`}
            max={monthEndDate(month)}
            onChange={(event) => {
              setAssessmentDate(event.target.value);
              setAssessmentDateDirty(true);
              setSavedMessage('');
            }}
          />
        </label>
      </div>

      <div className="entry-default">
        <label>
          <input type="checkbox" checked={defaultYes} onChange={(event) => toggleDefaultYes(event.target.checked)} />
          <span><b>બધા ✓ પહેલેથી પસંદ</b> (નવા વિદ્યાર્થી માટે) — ખોટા હોય તે જ ✗ કરો</span>
        </label>
        <span className="entry-wrong" title="આ વર્ગમાં ✗ (ના) તરીકે ચિહ્નિત વિધાન">✗ ખોટા: <b>{wrongCount}</b></span>
      </div>

      <div className="entry-modes" role="tablist">
        <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}><b>▦ ફોટો મુજબ ગ્રીડ</b><small>સૌથી ઝડપી · આખો વર્ગ</small></button>
        <button className={view === 'skill' ? 'on' : ''} onClick={() => setView('skill')}><b>🎯 વિધાન પ્રમાણે</b><small>એક વિધાન, આખો વર્ગ</small></button>
        <button className={view === 'card' ? 'on' : ''} onClick={() => setView('card')}><b>👤 વિદ્યાર્થી પ્રમાણે</b><small>એક વિદ્યાર્થી, બધા વિધાન</small></button>
      </div>

      {view === 'grid' && (
        <Grid students={students} byStudent={visibleByStudent} dhoran={dhoran} onChange={changeAnswers} saving={saving} />
      )}
      {view === 'skill' && (
        <SkillView students={students} byStudent={visibleByStudent} dhoran={dhoran} onChange={changeAnswers} saving={saving} />
      )}
      {view === 'card' && (
        <>
          <div className="entry-filter">
            <input placeholder="🔍 વિદ્યાર્થી શોધો…" value={q} onChange={(e) => setQ(e.target.value)} />
            {[['all', 'બધા'], ['todo', 'બાકી'], ['done', 'પૂર્ણ']].map(([key, label]) => (
              <button key={key} className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
          <ul className="stu-list">
            {shown.map((student) => {
              const index = students.indexOf(student);
              const status = statuses.get(student.id);
              return (
                <li key={student.id} onClick={() => setOpenId(student.id)} className={`stu ${status.cat ? `c-${status.cat.toLowerCase()}` : ''}`}>
                  <span className="stu-no">{index + 1}</span>
                  <span className="stu-name">{student.name}
                    <div className="dash-bar"><i className="n" style={{ width: `${(status.done / status.total) * 100}%` }} /></div>
                  </span>
                  {status.cat ? (
                    <span className={`badge ${CAT[status.cat].cls}`}>{CAT[status.cat].label} · {status.yes}/{status.total}</span>
                  ) : (
                    <span className="badge todo">{status.done ? `${status.done}/${status.total}` : 'બાકી'}</span>
                  )}
                </li>
              );
            })}
            {!shown.length && <li className="muted">કોઈ વિદ્યાર્થી મળ્યો નથી.</li>}
          </ul>
        </>
      )}
      <section className="entry-save no-print">
        <button className="primary" disabled={(!dirty && !seeded.length) || saving} onClick={saveChanges}>
          {saving ? 'સાચવાઈ રહ્યું છે…' : '💾 એન્ટ્રી સાચવો'}
        </button>
        {savedMessage && <p className="success" role="status">{savedMessage}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <RowSaveErrors errors={rowErrors} />
      </section>
    </div>
  );
}

function SkillView({ students, byStudent, dhoran, onChange, saving }) {
  const list = STATEMENTS[dhoran];
  const [idx, setIdx] = useState(0);
  const st = list[idx];
  const val = (student) => byStudent[student.id]?.answers?.[st.n];
  const set = (student, value) => {
    const answers = { ...byStudent[student.id]?.answers };
    if (answers[st.n] === value) delete answers[st.n]; else answers[st.n] = value;
    onChange(student.id, answers);
  };
  const setAll = (value) => students.forEach((student) => {
    onChange(student.id, { ...byStudent[student.id]?.answers, [st.n]: value });
  });
  const yes = students.filter((student) => val(student) === true).length;
  const no = students.filter((student) => val(student) === false).length;
  return (
    <div className="skill-view">
      <div className="skill-chips">
        {list.map((item, i) => {
          const n = students.filter((student) => byStudent[student.id]?.answers?.[item.n] !== undefined).length;
          const cls = n === students.length ? 'full' : n ? 'part' : '';
          return <button key={item.n} className={`${cls} ${i === idx ? 'on' : ''}`} onClick={() => setIdx(i)}>{i + 1}</button>;
        })}
      </div>
      <div className={`skill-card lv-${st.level}`}>
        <small>{st.area}{STEP[st.n] ? ` · પગલું ${STEP[st.n]}` : ''} · {LEVEL_LABEL[st.level]}</small>
        <p><b>{idx + 1}.</b> {st.text}</p>
        <div className="skill-count"><span className="y">હા {yes}</span><span className="n">ના {no}</span><span>બાકી {students.length - yes - no}</span></div>
        <div className="row">
          <button disabled={saving} onClick={() => setAll(true)}>બધા ✓</button>
        </div>
      </div>
      <ul className="skill-students">
        {students.map((student, i) => {
          const v = val(student);
          return (
            <li key={student.id}>
              <span>{i + 1}. {student.name}</span>
              <div className="yn">
                <button className={v === true ? 'yes on' : 'yes'} disabled={saving} onClick={() => set(student, true)}>હા</button>
                <button className={v === false ? 'no on' : 'no'} disabled={saving} onClick={() => set(student, false)}>ના</button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="row sticky">
        <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>← પાછળ</button>
        <button className="primary" onClick={() => setIdx(Math.min(list.length - 1, idx + 1))} disabled={idx === list.length - 1}>આગળનું વિધાન →</button>
      </div>
    </div>
  );
}

function defaultAssessmentDate(month) {
  const today = new Date().toISOString().slice(0, 10);
  return today.startsWith(`${month}-`) ? today : `${month}-01`;
}

function monthEndDate(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function RowSaveErrors({ errors }) {
  if (!errors.length) return null;
  return (
    <ul className="entry-errors" role="alert">
      {errors.map((item) => <li key={item.studentId}>{item.label}: {item.message}</li>)}
    </ul>
  );
}

function groupBy(list, keyFn) {
  const result = [];
  for (const item of list) {
    const key = keyFn(item);
    const last = result[result.length - 1];
    if (last && last.key === key) last.span += 1;
    else result.push({ key, span: 1, first: item });
  }
  return result;
}

function Grid({ students, byStudent, dhoran, onChange, saving }) {
  const full = STATEMENTS[dhoran];
  const splitAt = full.findIndex((statement) => statement.area === 'સરવાળા');
  const canSplit = full.length > 12 && splitAt > 0;
  const [part, setPart] = useState('all');
  const [selected, setSelected] = useState(null);
  const [active, setActive] = useState(null);
  const wrapRef = useRef(null);
  const list = !canSplit || part === 'all' ? full : part === '1' ? full.slice(0, splitAt) : full.slice(splitAt);
  const numOf = (statement) => full.findIndex((item) => item.n === statement.n) + 1;
  const areaGroups = groupBy(list, (statement) => statement.area);
  const classGroups = groupBy(list, (statement) => `${statement.area}|${statement.level}`);
  const levels = [...new Set(list.map((statement) => statement.level))];

  useEffect(() => { setPart('all'); setActive(null); }, [dhoran]);
  useEffect(() => {
    wrapRef.current?.querySelector('td.act')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  const setVal = (student, number, value) => {
    const answers = { ...byStudent[student.id]?.answers };
    if (value === undefined) delete answers[number]; else answers[number] = value;
    onChange(student.id, answers);
  };
  const cycle = (student, number) => {
    const value = byStudent[student.id]?.answers?.[number];
    setVal(student, number, value === undefined ? true : value === true ? false : undefined);
  };
  const allYes = (student) => onChange(
    student.id,
    Object.fromEntries(full.map((statement) => [statement.n, true]))
  );
  const fillColumn = (number, value) => students.forEach((student) => setVal(student, number, value));
  // 'all' = every student has ✓ in this column, 'some' = a few, 'none' = nobody.
  const columnState = (number) => {
    const count = students.filter((student) => byStudent[student.id]?.answers?.[number] === true).length;
    if (!students.length || !count) return 'none';
    return count === students.length ? 'all' : 'some';
  };
  const rowAllYes = (answers) => full.length > 0 && full.every((statement) => answers[statement.n] === true);

  function advance(r, c) {
    if (c < list.length - 1) return { r, c: c + 1 };
    return { r: Math.min(students.length - 1, r + 1), c: 0 };
  }
  function onKey(event) {
    if (!active || saving) return;
    const { r, c } = active;
    const student = students[r];
    const statement = list[c];
    let next = null;
    switch (event.key) {
      case 'ArrowRight': next = { r, c: Math.min(list.length - 1, c + 1) }; break;
      case 'ArrowLeft': next = { r, c: Math.max(0, c - 1) }; break;
      case 'ArrowDown': next = { r: Math.min(students.length - 1, r + 1), c }; break;
      case 'ArrowUp': next = { r: Math.max(0, r - 1), c }; break;
      case 'y': case 'Y': case '1': setVal(student, statement.n, true); next = advance(r, c); break;
      case 'n': case 'N': case '0': setVal(student, statement.n, false); next = advance(r, c); break;
      case 'Backspace': case 'Delete': setVal(student, statement.n, undefined); break;
      case ' ': case 'Enter': cycle(student, statement.n); break;
      default: return;
    }
    event.preventDefault();
    if (next) setActive(next);
  }

  return (
    <>
      <div className="grid-tools">
        <div className="grid-legend">
          {levels.map((level) => <span key={level} className={`lv-${level}`}>{LEVEL_LABEL[level]}</span>)}
        </div>
        {canSplit && (
          <div className="seg">
            <button className={part === 'all' ? 'on' : ''} onClick={() => setPart('all')}>બધા</button>
            <button className={part === '1' ? 'on' : ''} onClick={() => setPart('1')}>ભાગ 1 (1–{splitAt})</button>
            <button className={part === '2' ? 'on' : ''} onClick={() => setPart('2')}>ભાગ 2 ({splitAt + 1}–{full.length})</button>
          </div>
        )}
      </div>
      <p className="muted">ખાનામાં ટેપ: ખાલી → ✓ (હા) → ✗ (ના) → ખાલી. કીબોર્ડ: ← ↑ ↓ → ફરો · <b>Y / 1</b> = ✓ · <b>N / 0</b> = ✗ · Del = ખાલી (આપમેળે આગળના ખાનામાં જાય). આખી કૉલમ માટે ઉપરનું "✓", આખી લાઇન માટે "બધા ✓".</p>
      {selected && (
        <div className={`qbox lv-${selected.level}`} onClick={() => setSelected(null)}>
          <b>{numOf(selected)}.</b> {selected.text} <small>({selected.area} · {LEVEL_LABEL[selected.level]})</small>
        </div>
      )}
      <div className="scroll gridwrap" ref={wrapRef} tabIndex={0} onKeyDown={onKey}>
        <table className="grid">
          <thead>
            <tr className="r1">
              <th className="srno" rowSpan="6">ક્રમ</th>
              <th className="stick">ક્ષેત્ર</th>
              {areaGroups.map((group) => (
                <th key={group.key} colSpan={group.span} rowSpan={group.key === NO_STEP_AREA ? 2 : 1}>{group.key}</th>
              ))}
              <th rowSpan="6">બધા</th><th rowSpan="6">હા</th><th rowSpan="6">પરિણામ</th>
            </tr>
            <tr className="r2">
              <th className="stick">માર્ગદર્શિકામાં સંલગ્ન પગલાનો ક્રમ</th>
              {list.filter((statement) => statement.area !== NO_STEP_AREA).map((statement) => (
                <th key={statement.n}>પગલું {STEP[statement.n]}</th>
              ))}
            </tr>
            <tr className="r3">
              <th className="stick">ધોરણ</th>
              {classGroups.map((group) => (
                <th key={group.key} colSpan={group.span} className={`lv-${group.first.level}`}>{LEVEL_LABEL[group.first.level]}</th>
              ))}
            </tr>
            <tr className="vrow">
              <th className="stick">વિધાન</th>
              {list.map((statement) => (
                <th key={statement.n} className={`lv-${statement.level} qh`} onClick={() => setSelected(statement)}>
                  <div className="vt">{statement.text}</div>
                </th>
              ))}
            </tr>
            <tr className="nrow">
              <th className="stick">વિદ્યાર્થીનું નામ / વિધાન નંબર →</th>
              {list.map((statement) => <th key={statement.n} className={`lv-${statement.level}`}>{numOf(statement)}</th>)}
            </tr>
            <tr className="frow">
              <th className="stick">આખી કૉલમ ભરો ↓</th>
              {list.map((statement) => (
                <th key={statement.n}>
                  {(() => {
                    const state = columnState(statement.n);
                    return (
                      <button
                        className={`mini yes${state === 'all' ? ' on' : state === 'some' ? ' part' : ''}`}
                        aria-pressed={state === 'all'}
                        disabled={saving}
                        title={state === 'all' ? 'આખી કૉલમ ખાલી કરો' : 'આખા વર્ગ માટે ✓'}
                        onClick={() => fillColumn(statement.n, state === 'all' ? undefined : true)}
                      >✓</button>
                    );
                  })()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student, r) => {
              const answers = byStudent[student.id]?.answers || {};
              const status = calc(dhoran, answers);
              return (
                <tr key={student.id} className={active?.r === r ? 'rowact' : ''}>
                  <td className="srno">{r + 1}</td>
                  <td className="stick">{student.name}</td>
                  {list.map((statement, c) => {
                    const value = answers[statement.n];
                    const isActive = active?.r === r && active?.c === c;
                    return (
                      <td
                        key={statement.n}
                        className={`cell lv-${statement.level} ${value === true ? 'ok' : value === false ? 'bad' : ''} ${isActive ? 'act' : ''}`}
                        onClick={() => { if (saving) return; setActive({ r, c }); cycle(student, statement.n); }}
                      >
                        {value === true ? '✓' : value === false ? '✗' : ''}
                      </td>
                    );
                  })}
                  <td>
                    <button
                      className={`mini yes${rowAllYes(answers) ? ' on' : ''}`}
                      aria-pressed={rowAllYes(answers)}
                      disabled={saving}
                      onClick={() => (rowAllYes(answers) ? onChange(student.id, {}) : allYes(student))}
                    >બધા ✓</button>
                  </td>
                  <td className="num">{status.yes}/{status.total}</td>
                  <td>
                    {status.cat ? (
                      <span className={`badge ${CAT[status.cat].cls}`}>{CAT[status.cat].label}</span>
                    ) : (
                      <span className="muted">{status.done ? `${status.done}/${status.total}` : ''}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="card">
        <summary>વિધાન યાદી (નંબર મુજબ)</summary>
        <ol className="stlist">
          {full.map((statement, index) => (
            <li key={statement.n} value={index + 1} className={`lv-${statement.level}`}>
              <small>{statement.area}</small> {statement.text}
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}

function StudentForm({ student, index, count, dhoran, answers, onChange, onPrev, onNext, onClose, saving, onSave }) {
  const list = STATEMENTS[dhoran];
  const status = calc(dhoran, answers);

  const set = (number, value) => {
    const next = { ...answers };
    if (next[number] === value) delete next[number]; else next[number] = value;
    onChange(next);
  };
  const allYes = () => onChange(Object.fromEntries(list.map((statement) => [statement.n, true])));
  const clear = () => onChange({});
  const areas = groupBy(list, (statement) => statement.area);
  let cursor = 0;

  return (
    <div className="sform">
      <div className="sform-head">
        <div className="row between">
          <button className="link" onClick={onClose}>← યાદી</button>
          <span className="muted">{index + 1} / {count}</span>
        </div>
        <h2>{student.name}</h2>
        <div className="dash-bar big"><i className="n" style={{ width: `${(status.done / status.total) * 100}%` }} /></div>
        <div className="row between">
          <span>ભર્યા {status.done}/{status.total} · હા <b>{status.yes}</b></span>
          {status.cat ? <span className={`badge ${CAT[status.cat].cls}`}>{CAT[status.cat].label}</span> : <span className="muted">(બધા વિધાન ભરો)</span>}
        </div>
        <div className="row">
          <button className="primary" disabled={saving} onClick={allYes}>બધા હા</button>
          <button disabled={saving} onClick={clear}>બધું સાફ</button>
        </div>
      </div>

      {areas.map((group) => {
        const items = list.slice(cursor, cursor + group.span);
        const start = cursor;
        cursor += group.span;
        return (
          <div className="sform-area" key={`${group.key}-${start}`}>
            <h4>{group.key}</h4>
            {items.map((statement, i) => {
              const value = answers[statement.n];
              return (
                <div className={`stmt lv-${statement.level} ${value === true ? 'is-yes' : value === false ? 'is-no' : ''}`} key={statement.n}>
                  <div><b>{start + i + 1}.</b> {statement.text}</div>
                  <div className="yn">
                    <button className={value === true ? 'yes on' : 'yes'} disabled={saving} onClick={() => set(statement.n, true)}>✓ હા</button>
                    <button className={value === false ? 'no on' : 'no'} disabled={saving} onClick={() => set(statement.n, false)}>✗ ના</button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="row sticky">
        <button onClick={onPrev} disabled={index === 0}>← પાછળ</button>
        <button disabled={!Object.keys(answers).length || saving} onClick={onSave}>{saving ? 'સાચવાય છે…' : '💾 સાચવો'}</button>
        <button className="primary" onClick={onNext}>{index === count - 1 ? 'પૂર્ણ' : 'આગળ →'}</button>
      </div>
    </div>
  );
}
