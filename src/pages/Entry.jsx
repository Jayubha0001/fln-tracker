import { useEffect, useRef, useState } from 'react';
import { CAT, calc } from '../lib/category';
import { STATEMENTS, STEP, NO_STEP_AREA, LEVEL_LABEL } from '../data/statements';
import { loadAllRows } from '../lib/loadAllRows';

export default function Entry({ supabase, school, dhoran, month, onDirtyChange }) {
  const [students, setStudents] = useState(null);
  const [entries, setEntries] = useState(null);
  const [draft, setDraft] = useState({});
  const [view, setView] = useState('grid');
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [rowErrors, setRowErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [assessmentDate, setAssessmentDate] = useState(() => defaultAssessmentDate(month));
  const [assessmentDateDirty, setAssessmentDateDirty] = useState(false);

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

  async function saveChanges() {
    if (savingRef.current || !dirty) return;
    savingRef.current = true;
    setSaving(true);
    setSavedMessage('');
    setError('');
    setRowErrors([]);
    let successfulRows = 0;
    const failures = [];
    const savedRows = [];
    const pendingByStudent = new Map(Object.entries(draft).map(([studentId, answers]) => [studentId, answers]));
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
  const completed = students.filter((student) => calc(dhoran, byStudent[student.id]?.answers).cat).length;

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
            answers={draft[openId] || byStudent[openId]?.answers || {}}
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

  return (
    <div>
      <div className="row between">
        <span className="muted">પૂર્ણ એન્ટ્રી: {completed} / {students.length}{dirty ? ' · સાચવવાના ફેરફાર છે' : ''}</span>
        <div className="seg">
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>ગ્રીડ</button>
          <button className={view === 'card' ? 'on' : ''} onClick={() => setView('card')}>કાર્ડ</button>
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

      {view === 'grid' ? (
        <Grid
          students={students}
          byStudent={visibleByStudent}
          dhoran={dhoran}
          onChange={changeAnswers}
          saving={saving}
        />
      ) : (
        <ul className="list">
          {students.map((student, index) => {
            const status = calc(dhoran, byStudent[student.id]?.answers);
            return (
              <li key={student.id} onClick={() => setOpenId(student.id)} className="tap">
                <span>{index + 1}. {student.name}</span>
                {status.cat ? (
                  <span className={`badge ${CAT[status.cat].cls}`}>{CAT[status.cat].label} ({status.yes}/{status.total})</span>
                ) : (
                  <span className="badge todo">{status.done ? `${status.done}/${status.total}` : 'બાકી'}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <section className="entry-save no-print">
        <button className="primary" disabled={!dirty || saving} onClick={saveChanges}>
          {saving ? 'સાચવાઈ રહ્યું છે…' : 'એન્ટ્રી સાચવો'}
        </button>
        {savedMessage && <p className="success" role="status">{savedMessage}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <RowSaveErrors errors={rowErrors} />
      </section>
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
  const list = STATEMENTS[dhoran];
  const [selected, setSelected] = useState(null);
  const areaGroups = groupBy(list, (statement) => statement.area);
  const classGroups = groupBy(list, (statement) => `${statement.area}|${statement.level}`);

  const cycle = (student, number) => {
    const answers = { ...byStudent[student.id]?.answers };
    const value = answers[number];
    if (value === undefined) answers[number] = true;
    else if (value === true) answers[number] = false;
    else delete answers[number];
    onChange(student.id, answers);
  };
  const allYes = (student) => onChange(
    student.id,
    Object.fromEntries(list.map((statement) => [statement.n, true]))
  );

  return (
    <>
      <p className="muted">ખાનામાં ટેપ કરો: ખાલી → ✓ (હા) → ✗ (ના) → ખાલી. વિધાનના નામ પર ટેપ કરો તો પૂરું લખાણ દેખાશે. "બધા ✓" દબાવી પછી જે ના હોય તે ટેપ કરો.</p>
      {selected && (
        <div className={`qbox lv-${selected.level}`} onClick={() => setSelected(null)}>
          <b>{selected.index + 1}.</b> {selected.text} <small>({selected.area} · {LEVEL_LABEL[selected.level]})</small>
        </div>
      )}
      <div className="scroll gridwrap">
        <table className="grid">
          <thead>
            <tr className="r1">
              <th className="stick">ક્ષેત્ર</th>
              {areaGroups.map((group) => (
                <th key={group.key} colSpan={group.span} rowSpan={group.key === NO_STEP_AREA ? 2 : 1}>{group.key}</th>
              ))}
              <th rowSpan="5">બધા</th><th rowSpan="5">હા</th><th rowSpan="5">પરિણામ</th>
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
                <th key={group.key} colSpan={group.span}>{LEVEL_LABEL[group.first.level]}</th>
              ))}
            </tr>
            <tr className="vrow">
              <th className="stick">વિધાન</th>
              {list.map((statement, index) => (
                <th key={statement.n} className={`lv-${statement.level} qh`} onClick={() => setSelected({ ...statement, index })}>
                  <div className="vt">{statement.text}</div>
                </th>
              ))}
            </tr>
            <tr className="nrow">
              <th className="stick">વિદ્યાર્થીનું નામ / વિધાન નંબર →</th>
              {list.map((statement, index) => <th key={statement.n} className={`lv-${statement.level}`}>{index + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {students.map((student, index) => {
              const answers = byStudent[student.id]?.answers || {};
              const status = calc(dhoran, answers);
              return (
                <tr key={student.id}>
                  <td className="stick">{index + 1}. {student.name}</td>
                  {list.map((statement) => {
                    const value = answers[statement.n];
                    return (
                      <td
                        key={statement.n}
                        className={`cell lv-${statement.level} ${value === true ? 'ok' : value === false ? 'bad' : ''}`}
                        onClick={() => !saving && cycle(student, statement.n)}
                      >
                        {value === true ? '✓' : value === false ? '✗' : ''}
                      </td>
                    );
                  })}
                  <td><button className="mini" disabled={saving} onClick={() => allYes(student)}>બધા ✓</button></td>
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
          {list.map((statement, index) => (
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

  const set = (number, value) => onChange({ ...answers, [number]: value });
  const allYes = () => onChange(Object.fromEntries(list.map((statement) => [statement.n, true])));
  const clear = () => onChange({});

  return (
    <div>
      <div className="row between">
        <button className="link" onClick={onClose}>← યાદી</button>
        <span className="muted">{index + 1} / {count}</span>
      </div>
      <h2>{student.name}</h2>
      <div className="row">
        <button className="primary" disabled={saving} onClick={allYes}>બધા હા</button>
        <button disabled={saving} onClick={clear}>બધું સાફ</button>
      </div>
      <p>
        હા: <b>{status.yes}</b> / {status.total}{' '}
        {status.cat ? <span className={`badge ${CAT[status.cat].cls}`}>{CAT[status.cat].label}</span> : <span className="muted">(બધા વિધાન ભરો)</span>}
      </p>

      {list.map((statement, indexInClass) => {
        const value = answers[statement.n];
        return (
          <div className={`stmt lv-${statement.level}`} key={statement.n}>
            <small className="muted">{statement.area}</small>
            <div>{indexInClass + 1}. {statement.text}</div>
            <div className="yn">
              <button className={value === true ? 'yes on' : 'yes'} disabled={saving} onClick={() => set(statement.n, true)}>હા</button>
              <button className={value === false ? 'no on' : 'no'} disabled={saving} onClick={() => set(statement.n, false)}>ના</button>
            </div>
          </div>
        );
      })}

      <div className="row sticky">
        <button onClick={onPrev} disabled={index === 0}>← પાછળ</button>
        <button className="primary" onClick={onNext}>{index === count - 1 ? 'પૂર્ણ' : 'આગળ →'}</button>
        <button disabled={!Object.keys(answers).length || saving} onClick={onSave}>{saving ? 'સાચવાય છે…' : 'એન્ટ્રી સાચવો'}</button>
      </div>
    </div>
  );
}
