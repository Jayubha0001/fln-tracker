import { useEffect, useState } from 'react';
import { CAT, calc } from '../lib/category';
import { STATEMENTS, STEP, NO_STEP_AREA, LEVEL_LABEL } from '../data/statements';

export default function Entry({ supabase, school, dhoran, month }) {
  const [students, setStudents] = useState(null);
  const [entries, setEntries] = useState(null);
  const [view, setView] = useState('grid');
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setStudents(null);
    setEntries(null);
    setError('');
    async function load() {
      const [{ data: studentRows, error: studentError }, { data: entryRows, error: entryError }] =
        await Promise.all([
          supabase.from('students').select('*')
            .eq('school_id', school.id).eq('dhoran', dhoran).order('name'),
          supabase.from('entries').select('*')
            .eq('school_id', school.id).eq('dhoran', dhoran).eq('month', month),
        ]);
      if (studentError) throw studentError;
      if (entryError) throw entryError;
      if (mounted) {
        setStudents(studentRows || []);
        setEntries(entryRows || []);
      }
    }
    load().catch((cause) => {
      if (mounted) setError(`વિદ્યાર્થી/એન્ટ્રી લોડ થઈ નથી: ${cause.message}`);
    });
    return () => { mounted = false; };
  }, [supabase, school.id, dhoran, month]);

  async function save(student, answers) {
    const row = {
      student_id: student.id,
      school_id: school.id,
      month,
      dhoran,
      answers,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await supabase.from('entries').upsert(row, {
      onConflict: 'student_id,month',
    });
    if (saveError) throw saveError;
    setEntries((current) => [
      ...(current || []).filter((entry) => entry.student_id !== student.id),
      row,
    ]);
  }

  if (!students || !entries) {
    return <div>{error ? <p className="error" role="alert">{error}</p> : <p>લોડ થાય છે…</p>}</div>;
  }
  if (!students.length) return <p>પહેલા "વિદ્યાર્થી" ટેબમાં વિદ્યાર્થી ઉમેરો.</p>;

  const byStudent = Object.fromEntries(entries.map((entry) => [entry.student_id, entry]));
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
            entry={byStudent[openId]}
            onSave={(answers) => save(students[index], answers).catch((cause) => setError(`એન્ટ્રી સાચવી શકાઈ નથી: ${cause.message}`))}
            onPrev={() => index > 0 && setOpenId(students[index - 1].id)}
            onNext={() => (index < students.length - 1 ? setOpenId(students[index + 1].id) : setOpenId(null))}
            onClose={() => setOpenId(null)}
          />
        </div>
      );
    }
  }

  return (
    <div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row between">
        <span className="muted">પૂર્ણ એન્ટ્રી: {completed} / {students.length}</span>
        <div className="seg">
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>ગ્રીડ</button>
          <button className={view === 'card' ? 'on' : ''} onClick={() => setView('card')}>કાર્ડ</button>
        </div>
      </div>

      {view === 'grid' ? (
        <Grid
          students={students}
          byStudent={byStudent}
          dhoran={dhoran}
          onSave={(student, answers) => save(student, answers).catch((cause) => setError(`એન્ટ્રી સાચવી શકાઈ નથી: ${cause.message}`))}
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
    </div>
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

function Grid({ students, byStudent, dhoran, onSave }) {
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
    onSave(student, answers);
  };
  const allYes = (student) => onSave(
    student,
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
                        onClick={() => cycle(student, statement.n)}
                      >
                        {value === true ? '✓' : value === false ? '✗' : ''}
                      </td>
                    );
                  })}
                  <td><button className="mini" onClick={() => allYes(student)}>બધા ✓</button></td>
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

function StudentForm({ student, index, count, dhoran, entry, onSave, onPrev, onNext, onClose }) {
  const list = STATEMENTS[dhoran];
  const answers = entry?.answers || {};
  const status = calc(dhoran, answers);

  const set = (number, value) => onSave({ ...answers, [number]: value });
  const allYes = () => onSave(Object.fromEntries(list.map((statement) => [statement.n, true])));
  const clear = () => onSave({});

  return (
    <div>
      <div className="row between">
        <button className="link" onClick={onClose}>← યાદી</button>
        <span className="muted">{index + 1} / {count}</span>
      </div>
      <h2>{student.name}</h2>
      <div className="row">
        <button className="primary" onClick={allYes}>બધા હા</button>
        <button onClick={clear}>બધું સાફ</button>
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
              <button className={value === true ? 'yes on' : 'yes'} onClick={() => set(statement.n, true)}>હા</button>
              <button className={value === false ? 'no on' : 'no'} onClick={() => set(statement.n, false)}>ના</button>
            </div>
          </div>
        );
      })}

      <div className="row sticky">
        <button onClick={onPrev} disabled={index === 0}>← પાછળ</button>
        <button className="primary" onClick={onNext}>{index === count - 1 ? 'પૂર્ણ' : 'આગળ →'}</button>
      </div>
    </div>
  );
}
