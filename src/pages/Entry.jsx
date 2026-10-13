import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { CAT, calc } from '../lib/category';
import { STATEMENTS, STEP, NO_STEP_AREA, LEVEL_LABEL } from '../data/statements';

const saveAnswers = (student, dhoran, month, answers) =>
  db.entries.put({
    id: `${student.id}_${month}`,
    studentId: student.id,
    month,
    dhoran,
    answers,
    updatedAt: Date.now(),
  });

export default function Entry({ dhoran, month }) {
  const students = useLiveQuery(
    () => db.students.where('dhoran').equals(dhoran).sortBy('name'),
    [dhoran]
  );
  const entries = useLiveQuery(
    () => db.entries.where('month').equals(month).filter((e) => e.dhoran === dhoran).toArray(),
    [dhoran, month]
  );
  const [view, setView] = useState('grid');
  const [openId, setOpenId] = useState(null);

  if (!students || !entries) return <p>લોડ થાય છે…</p>;
  if (!students.length) return <p>પહેલા "વિદ્યાર્થી" ટેબમાં વિદ્યાર્થી ઉમેરો.</p>;

  const byStudent = Object.fromEntries(entries.map((e) => [e.studentId, e]));
  const completed = students.filter((s) => calc(dhoran, byStudent[s.id]?.answers).cat).length;

  // Kard view: ek vidyarthi ek screen
  if (view === 'card' && openId !== null) {
    const idx = students.findIndex((s) => s.id === openId);
    if (idx >= 0) {
      return (
        <StudentForm
          key={openId}
          student={students[idx]}
          idx={idx}
          count={students.length}
          dhoran={dhoran}
          month={month}
          entry={byStudent[openId]}
          onPrev={() => idx > 0 && setOpenId(students[idx - 1].id)}
          onNext={() => (idx < students.length - 1 ? setOpenId(students[idx + 1].id) : setOpenId(null))}
          onClose={() => setOpenId(null)}
        />
      );
    }
  }

  return (
    <div>
      <div className="row between">
        <span className="muted">પૂર્ણ એન્ટ્રી: {completed} / {students.length}</span>
        <div className="seg">
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>ગ્રીડ</button>
          <button className={view === 'card' ? 'on' : ''} onClick={() => setView('card')}>કાર્ડ</button>
        </div>
      </div>

      {view === 'grid' ? (
        <Grid students={students} byStudent={byStudent} dhoran={dhoran} month={month} />
      ) : (
        <ul className="list">
          {students.map((s, i) => {
            const st = calc(dhoran, byStudent[s.id]?.answers);
            return (
              <li key={s.id} onClick={() => setOpenId(s.id)} className="tap">
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
      )}
    </div>
  );
}

// consecutive same key vala vidhan ne group karo (colSpan mate)
function groupBy(list, keyFn) {
  const out = [];
  for (const q of list) {
    const k = keyFn(q);
    const last = out[out.length - 1];
    if (last && last.k === k) { last.span += 1; } else out.push({ k, span: 1, first: q });
  }
  return out;
}

// PDF na pehla page jevi grid: aadi line = vidyarthi, ubhi line = vidhan
function Grid({ students, byStudent, dhoran, month }) {
  const list = STATEMENTS[dhoran];
  const [sel, setSel] = useState(null);
  const areaGroups = groupBy(list, (q) => q.area);
  const classGroups = groupBy(list, (q) => `${q.area}|${q.level}`);

  const cycle = (s, n) => {
    const a = { ...(byStudent[s.id]?.answers || {}) };
    const v = a[n];
    if (v === undefined) a[n] = true;       // khali -> હા
    else if (v === true) a[n] = false;      // હા -> ના
    else delete a[n];                       // ના -> khali
    saveAnswers(s, dhoran, month, a);
  };
  const allYes = (s) =>
    saveAnswers(s, dhoran, month, Object.fromEntries(list.map((q) => [q.n, true])));

  return (
    <>
      <p className="muted">ખાનામાં ટેપ કરો: ખાલી → ✓ (હા) → ✗ (ના) → ખાલી. વિધાનના નામ પર ટેપ કરો તો પૂરું લખાણ દેખાશે. "બધા ✓" દબાવી પછી જે ના હોય તે ટેપ કરો.</p>
      {sel && (
        <div className={`qbox lv-${sel.level}`} onClick={() => setSel(null)}>
          <b>{sel.i + 1}.</b> {sel.text} <small>({sel.area} · {LEVEL_LABEL[sel.level]})</small>
        </div>
      )}
      <div className="scroll gridwrap">
        <table className="grid">
          <thead>
            <tr className="r1">
              <th className="stick">ક્ષેત્ર</th>
              {areaGroups.map((g) => (
                <th key={g.k} colSpan={g.span} rowSpan={g.k === NO_STEP_AREA ? 2 : 1}>{g.k}</th>
              ))}
              <th rowSpan="5">બધા</th>
              <th rowSpan="5">હા</th>
              <th rowSpan="5">પરિણામ</th>
            </tr>
            <tr className="r2">
              <th className="stick">માર્ગદર્શિકામાં સંલગ્ન પગલાનો ક્રમ</th>
              {list.filter((q) => q.area !== NO_STEP_AREA).map((q) => (
                <th key={q.n}>પગલું {STEP[q.n]}</th>
              ))}
            </tr>
            <tr className="r3">
              <th className="stick">ધોરણ</th>
              {classGroups.map((g) => (
                <th key={g.k} colSpan={g.span}>{LEVEL_LABEL[g.first.level]}</th>
              ))}
            </tr>
            <tr className="vrow">
              <th className="stick">વિધાન</th>
              {list.map((q, i) => (
                <th key={q.n} className={`lv-${q.level} qh`} onClick={() => setSel({ ...q, i })}>
                  <div className="vt">{q.text}</div>
                </th>
              ))}
            </tr>
            <tr className="nrow">
              <th className="stick">વિદ્યાર્થીનું નામ / વિધાન નંબર →</th>
              {list.map((q, i) => <th key={q.n} className={`lv-${q.level}`}>{i + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const a = byStudent[s.id]?.answers || {};
              const st = calc(dhoran, a);
              return (
                <tr key={s.id}>
                  <td className="stick">{i + 1}. {s.name}</td>
                  {list.map((q) => {
                    const v = a[q.n];
                    return (
                      <td
                        key={q.n}
                        className={`cell lv-${q.level} ${v === true ? 'ok' : v === false ? 'bad' : ''}`}
                        onClick={() => cycle(s, q.n)}
                      >
                        {v === true ? '✓' : v === false ? '✗' : ''}
                      </td>
                    );
                  })}
                  <td><button className="mini" onClick={() => allYes(s)}>બધા ✓</button></td>
                  <td className="num">{st.yes}/{st.total}</td>
                  <td>
                    {st.cat ? (
                      <span className={`badge ${CAT[st.cat].cls}`}>{CAT[st.cat].label}</span>
                    ) : (
                      <span className="muted">{st.done ? `${st.done}/${st.total}` : ''}</span>
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
          {list.map((q, i) => (
            <li key={q.n} value={i + 1} className={`lv-${q.level}`}>
              <small>{q.area}</small> {q.text}
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}

function StudentForm({ student, idx, count, dhoran, month, entry, onPrev, onNext, onClose }) {
  const list = STATEMENTS[dhoran];
  const answers = entry?.answers || {};
  const st = calc(dhoran, answers);

  const save = (next) => saveAnswers(student, dhoran, month, next);
  const set = (n, v) => save({ ...answers, [n]: v });
  const allYes = () => save(Object.fromEntries(list.map((q) => [q.n, true])));
  const clear = () => save({});

  return (
    <div>
      <div className="row between">
        <button className="link" onClick={onClose}>← યાદી</button>
        <span className="muted">{idx + 1} / {count}</span>
      </div>
      <h2>{student.name}</h2>
      <div className="row">
        <button className="primary" onClick={allYes}>બધા હા</button>
        <button onClick={clear}>બધું સાફ</button>
      </div>
      <p>
        હા: <b>{st.yes}</b> / {st.total}{' '}
        {st.cat ? <span className={`badge ${CAT[st.cat].cls}`}>{CAT[st.cat].label}</span> : <span className="muted">(બધા વિધાન ભરો)</span>}
      </p>

      {list.map((q, i) => {
        const v = answers[q.n];
        return (
          <div className={`stmt lv-${q.level}`} key={q.n}>
            <small className="muted">{q.area}</small>
            <div>{i + 1}. {q.text}</div>
            <div className="yn">
              <button className={v === true ? 'yes on' : 'yes'} onClick={() => set(q.n, true)}>હા</button>
              <button className={v === false ? 'no on' : 'no'} onClick={() => set(q.n, false)}>ના</button>
            </div>
          </div>
        );
      })}

      <div className="row sticky">
        <button onClick={onPrev} disabled={idx === 0}>← પાછળ</button>
        <button className="primary" onClick={onNext}>{idx === count - 1 ? 'પૂર્ણ' : 'આગળ →'}</button>
      </div>
    </div>
  );
}
