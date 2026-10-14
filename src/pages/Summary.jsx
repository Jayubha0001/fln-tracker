import { useEffect, useState } from 'react';
import * as XLSX from '@e965/xlsx';
import { CLASSES, CAT, MONTHS, calc } from '../lib/category';

function loadInfo(schoolId) {
  try {
    return JSON.parse(localStorage.getItem(`fln-school-${schoolId}`)) || {};
  } catch {
    return {};
  }
}

export default function Summary({ supabase, school, dhoran, month }) {
  const [students, setStudents] = useState(null);
  const [entries, setEntries] = useState(null);
  const [info, setInfo] = useState(() => loadInfo(school.id));
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
            .eq('school_id', school.id).eq('dhoran', dhoran),
        ]);
      if (studentError) throw studentError;
      if (entryError) throw entryError;
      if (mounted) {
        setStudents(studentRows || []);
        setEntries(entryRows || []);
      }
    }
    load().catch((cause) => {
      if (mounted) setError(`સારાંશ લોડ થઈ શક્યો નથી: ${cause.message}`);
    });
    return () => { mounted = false; };
  }, [supabase, school.id, dhoran]);

  useEffect(() => {
    setInfo(loadInfo(school.id));
  }, [school.id]);

  if (!students || !entries) {
    return <p className={error ? 'error' : ''} role={error ? 'alert' : undefined}>{error || 'લોડ થાય છે…'}</p>;
  }

  const updateInfo = (key, value) => {
    const next = { ...info, [key]: value };
    setInfo(next);
    try {
      localStorage.setItem(`fln-school-${school.id}`, JSON.stringify(next));
    } catch (cause) {
      setError(`શિક્ષકની વિગતો આ device પર સાચવી શકાઈ નથી: ${cause.message}`);
    }
  };

  const currentClass = CLASSES[dhoran];
  const rows = MONTHS.map((item, index) => {
    let emerging = 0;
    let progressing = 0;
    let proficient = 0;
    for (const entry of entries.filter((row) => row.month === item.key)) {
      const result = calc(dhoran, entry.answers);
      if (!result.cat) continue;
      if (result.cat === 'U') emerging += 1;
      else if (result.cat === 'P') progressing += 1;
      else proficient += 1;
    }
    const done = emerging + progressing + proficient;
    return {
      no: index + 1,
      month: item.label,
      register: students.length,
      emerging,
      progressing,
      proficient,
      done,
      percentage: done && students.length
        ? Math.round((proficient / students.length) * 1000) / 10
        : '',
    };
  });

  function download() {
    const data = rows.map((row) => ({
      'ક્રમ': row.no,
      'માસ': row.month,
      'રજીસ્ટર સંખ્યા': row.register,
      'ઉદયમાન': row.emerging,
      'પ્રગતિશીલ': row.progressing,
      'નિપુણ': row.proficient,
      'FLN સિદ્ધિ %': row.percentage,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), 'Tracker');
    XLSX.writeFile(workbook, `FLN_Maths_Tracker_${currentClass.label}.xlsx`);
  }

  const monthLabel = MONTHS.find((item) => item.key === month)?.label;
  const monthEntries = Object.fromEntries(
    entries.filter((entry) => entry.month === month).map((entry) => [entry.student_id, entry])
  );

  return (
    <div>
      {error && <p className="error" role="alert">{error}</p>}
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
          <div>શાળા: <b>{school.name}</b> ({school.code})</div>
          <div>તાલુકો: <b>{school.block}</b></div>
          <div>જિલ્લો: <b>{school.district}</b></div>
          <div>ક્લસ્ટર: <b>{school.cluster}</b></div>
          <label>વર્ગ શિક્ષકનું નામ: <input value={info.teacher || ''} onChange={(event) => updateInfo('teacher', event.target.value)} /></label>
          <div>ધોરણ: <b>{currentClass.label}</b></div>
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
            <tr className="sub"><th>ઉદયમાન</th><th>પ્રગતિશીલ</th><th>નિપુણ</th></tr>
            <tr className="sub"><th>0 થી 30 %</th><th>31 થી 79 %</th><th>80 % કે તેથી વધુ</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.no}>
                <td>{row.no}</td><td className="left">{row.month}</td>
                <td>{row.done ? row.register : ''}</td>
                <td>{row.done ? row.emerging : ''}</td>
                <td>{row.done ? row.progressing : ''}</td>
                <td>{row.done ? row.proficient : ''}</td>
                <td>{row.percentage !== '' ? `${row.percentage}%` : ''}</td>
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
            {Object.entries(CLASSES).map(([key, item]) => (
              <tr key={key} className={key === dhoran ? 'cur' : ''}>
                <td>{item.label}</td><td>{item.total}</td>
                <td className="cu">{item.udayMax} કે તેથી ઓછા</td>
                <td className="cp">{item.udayMax + 1} થી {item.nipunMin - 1}</td>
                <td className="cn">{item.nipunMin} કે તેથી વધુ</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="no-print">
        <h3>{currentClass.label} – {monthLabel}: વિદ્યાર્થી-વાર પરિણામ</h3>
        <ul className="list">
          {students.map((student, index) => {
            const result = calc(dhoran, monthEntries[student.id]?.answers);
            return (
              <li key={student.id}>
                <span>{index + 1}. {student.name}</span>
                {result.cat ? (
                  <span className={`badge ${CAT[result.cat].cls}`}>{CAT[result.cat].label} ({result.yes}/{result.total})</span>
                ) : (
                  <span className="badge todo">{result.done ? `${result.done}/${result.total}` : 'બાકી'}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
