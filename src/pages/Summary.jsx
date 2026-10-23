import { SummaryGuide, GradeInsight } from '../components/SummaryHelp.jsx';
import { isAbsent } from '../lib/absent.js';
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from '@e965/xlsx';
import { CLASSES, CAT, MONTHS, calc } from '../lib/category';
import { STATEMENTS } from '../data/statements';
import { loadAllRows } from '../lib/loadAllRows';

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);
const DEFAULT_MONTH = MONTHS.find((item) => item.key === CURRENT_MONTH)?.key || MONTHS[0].key;

function loadTeacher(schoolId) {
  try {
    return JSON.parse(localStorage.getItem(`fln-school-${schoolId}`))?.teacher || '';
  } catch {
    return '';
  }
}

export default function Summary({
  supabase,
  school = null,
  schools = [],
  dhoran = '1',
  month = DEFAULT_MONTH,
  isAdmin = false,
  scopeLabel = 'તમારા વિસ્તાર',
}) {
  const [students, setStudents] = useState(null);
  const [entries, setEntries] = useState(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState(school?.id || (isAdmin ? 'all' : ''));
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [error, setError] = useState('');
  const [ownSchools, setOwnSchools] = useState([]);
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [districtSel, setDistrictSel] = useState('');
  const [blockSel, setBlockSel] = useState('');

  useEffect(() => {
    if (!isAdmin) return undefined;
    let mounted = true;
    loadAllRows(supabase.from('schools').select('id,code,name,district,block,active').eq('active', true).order('name').order('code'))
      .then((rows) => { if (mounted) setOwnSchools(rows); })
      .catch(() => { /* fall back to the schools prop */ });
    return () => { mounted = false; };
  }, [supabase, isAdmin]);
  const allSchools = isAdmin && ownSchools.length ? ownSchools : schools;
  const districtOptions = useMemo(() => [...new Set(allSchools.map((item) => item.district).filter(Boolean))].sort(), [allSchools]);
  const blockOptions = useMemo(() => [...new Set(allSchools
    .filter((item) => !districtSel || item.district === districtSel)
    .map((item) => item.block).filter(Boolean))].sort(), [allSchools, districtSel]);
  const scopedSchools = useMemo(() => allSchools
    .filter((item) => (!districtSel || item.district === districtSel) && (!blockSel || item.block === blockSel)), [allSchools, districtSel, blockSel]);

  useEffect(() => {
    setSelectedSchoolId(school?.id || (isAdmin ? 'all' : ''));
  }, [school?.id, isAdmin]);

  useEffect(() => setSelectedMonth(month), [month]);

  useEffect(() => {
    let mounted = true;
    setStudents(null);
    setEntries(null);
    setError('');
    const studentsQuery = supabase.from('students').select('*').order('name');
    const entriesQuery = supabase.from('entries').select('*');
    if (!isAdmin && school?.id) {
      studentsQuery.eq('school_id', school.id);
      entriesQuery.eq('school_id', school.id);
    }

    Promise.all([loadAllRows(studentsQuery), loadAllRows(entriesQuery)])
      .then(([studentRows, entryRows]) => {
        if (mounted) {
          setStudents(studentRows);
          setEntries(entryRows);
        }
      })
      .catch((cause) => {
        if (mounted) setError(`સારાંશ લોડ થઈ શક્યો નથી: ${cause.message}`);
      });
    return () => { mounted = false; };
  }, [supabase, school?.id, isAdmin]);

  const selectedSchool = allSchools.find((item) => item.id === selectedSchoolId)
    || (school?.id === selectedSchoolId ? school : null);
  const schoolOptions = isAdmin ? allSchools : school ? [school] : [];
  const schoolMap = useMemo(() => new Map(allSchools.map((item) => [item.id, item])), [allSchools]);

  if (!students || !entries) {
    return <p className={error ? 'error' : ''} role={error ? 'alert' : undefined}>{error || 'લોડ થાય છે…'}</p>;
  }

  const monthLabel = MONTHS.find((item) => item.key === selectedMonth)?.label || selectedMonth;
  const scopedIds = new Set(scopedSchools.map((item) => item.id));
  const inScope = (schoolId) => (selectedSchoolId !== 'all'
    ? schoolId === selectedSchoolId
    : (!districtSel && !blockSel) || scopedIds.has(schoolId));

  function download() {
    const reportGrades = Object.entries(CLASSES)
      .filter(([grade]) => selectedGrade === 'all' || grade === selectedGrade);
    const summaryRows = reportGrades.map(([grade, info]) => {
      const gradeStudents = (students || []).filter((student) =>
        (inScope(student.school_id))
        && student.dhoran === grade
      );
      const ids = new Set(gradeStudents.map((student) => student.id));
      const gradeEntries = (entries || []).filter((entry) =>
        ids.has(entry.student_id) && entry.dhoran === grade && entry.month === selectedMonth
      );
      const complete = gradeEntries.filter((entry) => calc(grade, entry.answers).cat).length;
      const incomplete = gradeEntries.length - complete;
      return {
        'ધોરણ': info.label,
        'માસ': monthLabel,
        'શાળા પસંદગી': selectedSchoolId === 'all' ? 'બધી શાળાઓ' : selectedSchool?.name || '',
        'નોંધાયેલા વિદ્યાર્થીઓ': gradeStudents.length,
        'સાચવેલી એન્ટ્રી': gradeEntries.length,
        'પૂર્ણ એન્ટ્રી': complete,
        'અપૂર્ણ એન્ટ્રી': incomplete,
        'બાકી': Math.max(0, gradeStudents.length - gradeEntries.length),
      };
    });
    const studentRows = reportGrades.flatMap(([grade, info]) => {
      const gradeStudents = (students || []).filter((student) =>
        (inScope(student.school_id))
        && student.dhoran === grade
      );
      const lookup = new Map((entries || [])
        .filter((entry) => entry.dhoran === grade && entry.month === selectedMonth)
        .map((entry) => [entry.student_id, entry]));
      return gradeStudents.map((student) => {
        const entry = lookup.get(student.id);
        const result = calc(grade, entry?.answers);
        return {
          'શાળા': schoolMap.get(student.school_id)?.name || school?.name || '',
          'શાળા કોડ': schoolMap.get(student.school_id)?.code || school?.code || '',
          'ધોરણ': info.label,
          'વિદ્યાર્થી': student.name,
          'માસ': monthLabel,
          'સાચવેલી એન્ટ્રી': entry ? 'હા' : 'ના',
          'પૂર્ણ': result.cat ? 'હા' : 'ના',
          'હા જવાબ': result.yes,
          'કુલ વિધાન': result.total,
          'પરિણામ': result.cat ? CAT[result.cat].label : 'બાકી / અપૂર્ણ',
        };
      });
    });
    const comparisonSchools = selectedSchoolId === 'all'
      ? scopedSchools
      : schoolOptions.filter((item) => item.id === selectedSchoolId);
    const schoolComparisonRows = reportGrades.flatMap(([grade, info]) => comparisonSchools.map((item) => {
      const gradeStudents = (students || []).filter((student) =>
        student.school_id === item.id && student.dhoran === grade
      );
      const ids = new Set(gradeStudents.map((student) => student.id));
      const gradeEntries = (entries || []).filter((entry) =>
        ids.has(entry.student_id) && entry.dhoran === grade && entry.month === selectedMonth
      );
      const complete = gradeEntries.filter((entry) => calc(grade, entry.answers).cat).length;
      const absentCount = gradeEntries.filter((entry) => isAbsent(entry.answers)).length;
      return {
        'શાળા': item.name,
        'શાળા કોડ': item.code,
        'ધોરણ': info.label,
        'નોંધાયેલા': gradeStudents.length,
        'સાચવેલી એન્ટ્રી': gradeEntries.length,
        'પૂર્ણ': complete,
        'અપૂર્ણ': gradeEntries.length - complete - absentCount,
        'ગેરહાજર': absentCount,
        'બાકી': Math.max(0, gradeStudents.length - gradeEntries.length),
      };
    }));
    const skillRows = reportGrades.flatMap(([grade, info]) => {
      const gradeStudents = (students || []).filter((student) =>
        (inScope(student.school_id))
        && student.dhoran === grade
      );
      const ids = new Set(gradeStudents.map((student) => student.id));
      const gradeEntries = new Map((entries || [])
        .filter((entry) => ids.has(entry.student_id) && entry.dhoran === grade && entry.month === selectedMonth)
        .map((entry) => [entry.student_id, entry]));
      return (STATEMENTS[grade] || []).map((statement, index) => {
        const values = gradeStudents
          .map((student) => gradeEntries.get(student.id)?.answers?.[statement.n])
          .filter((value) => value !== undefined);
        const yes = values.filter((value) => value === true).length;
        return {
          'ધોરણ': info.label,
          'વિધાન ક્રમ': index + 1,
          'ક્ષેત્ર': statement.area,
          'વિધાન': statement.text,
          'હા': yes,
          'જવાબ આપેલા': values.length,
          'હા %': values.length ? Math.round((yes / values.length) * 1000) / 10 : '',
        };
      });
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'ધોરણ સારાંશ');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(schoolComparisonRows), 'શાળા સરખામણી');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(studentRows), 'વિદ્યાર્થી પરિણામ');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(skillRows), 'વિધાન પ્રમાણે');
    XLSX.writeFile(workbook, `FLN_Summary_${selectedMonth}.xlsx`);
  }

  return (
    <div className="summary-page">
      <SummaryGuide scopeLabel={scopeLabel} />
      <div className="row summary-filters no-print">
        {isAdmin && (
          <>
            <label>
              જિલ્લો
              <select value={districtSel} onChange={(event) => { setDistrictSel(event.target.value); setBlockSel(''); setSelectedSchoolId('all'); }}>
                <option value="">બધા જિલ્લા</option>
                {districtOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              બ્લોક
              <select value={blockSel} onChange={(event) => { setBlockSel(event.target.value); setSelectedSchoolId('all'); }}>
                <option value="">બધા બ્લોક</option>
                {blockOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              શાળા
              <select value={selectedSchoolId} onChange={(event) => setSelectedSchoolId(event.target.value)}>
                <option value="all">બધી શાળાઓ ({scopedSchools.length})</option>
                {scopedSchools.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}
              </select>
            </label>
          </>
        )}
        <label>
          ધોરણ
          <select value={selectedGrade} onChange={(event) => setSelectedGrade(event.target.value)}>
            <option value="all">બધા ધોરણ</option>
            {Object.entries(CLASSES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select>
        </label>
        <label>
          માસ
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
            {MONTHS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <button className="primary" onClick={() => window.print()}>PDF / પ્રિન્ટ</button>
        <button onClick={download}>Excel નિકાસ</button>
      </div>

      {Object.entries(CLASSES).filter(([grade]) => selectedGrade === 'all' || grade === selectedGrade).map(([grade, info]) => {
        const gradeStudents = (students || []).filter((student) =>
          (inScope(student.school_id))
          && student.dhoran === grade
        );
        const gradeEntries = (entries || []).filter((entry) =>
          (inScope(entry.school_id))
          && entry.dhoran === grade
          && entry.month === selectedMonth
        );
        const entriesByStudent = new Map(gradeEntries.map((entry) => [entry.student_id, entry]));
        const results = gradeStudents.map((student) => {
          const entry = entriesByStudent.get(student.id);
          return { student, entry, result: calc(grade, entry?.answers) };
        });
        const done = results.filter((item) => item.entry && item.result.cat).length;
        const absent = results.filter((item) => item.entry && isAbsent(item.entry.answers)).length;
        const partial = results.filter((item) => item.entry && !item.result.cat && !isAbsent(item.entry.answers)).length;
        const pending = Math.max(0, gradeStudents.length - gradeEntries.length);
        const gradeSkills = (STATEMENTS[grade] || []).map((statement, index) => {
          const values = results.map((item) => item.entry?.answers?.[statement.n]).filter((value) => value !== undefined);
          const yes = values.filter((value) => value === true).length;
          return {
            number: index + 1,
            area: statement.area,
            text: statement.text,
            yes,
            answered: values.length,
            percent: values.length ? Math.round((yes / values.length) * 1000) / 10 : null,
          };
        });
        const gradeSchoolTotals = isAdmin && selectedSchoolId === 'all'
          ? scopedSchools.map((item) => {
            const itemStudents = gradeStudents.filter((student) => student.school_id === item.id);
            const itemStudentIds = new Set(itemStudents.map((student) => student.id));
            const itemEntries = gradeEntries.filter((entry) => itemStudentIds.has(entry.student_id));
            return {
              school: item,
              enrolled: itemStudents.length,
              saved: itemEntries.length,
              complete: itemEntries.filter((entry) => calc(grade, entry.answers).cat).length,
              absent: itemEntries.filter((entry) => isAbsent(entry.answers)).length,
              pending: Math.max(0, itemStudents.length - itemEntries.length),
            };
          }).map((row) => ({ ...row, incomplete: row.saved - row.complete - row.absent }))
          : [];
        const sortedSchoolTotals = [...gradeSchoolTotals].sort((a, b) => {
          const pick = (row) => (sort.key === 'name' ? row.school.name : sort.key === 'code' ? row.school.code : row[sort.key]);
          const left = pick(a);
          const right = pick(b);
          const order = typeof left === 'number' ? left - right : String(left).localeCompare(String(right));
          return sort.dir === 'asc' ? order : -order;
        });

        return (
          <section className="summary-grade card" key={grade}>
            <h2>{info.label} · {monthLabel}</h2>
            {selectedSchoolId !== 'all' && selectedSchool && (
              <p className="muted">{selectedSchool.name} · {selectedSchool.code} · {selectedSchool.block}, {selectedSchool.district}</p>
            )}
            {gradeStudents.length === 0 ? (
              <p className="muted">હજુ ડેટા ઉપલબ્ધ નથી</p>
            ) : (
              <>
                <GradeInsight
                  label={info.label}
                  total={gradeStudents.length}
                  saved={gradeEntries.length}
                  done={done}
                  partial={partial}
                  absent={absent}
                  pending={pending}
                  tri={{
                    U: results.filter((item) => item.entry && item.result.cat === 'U').length,
                    P: results.filter((item) => item.entry && item.result.cat === 'P').length,
                    N: results.filter((item) => item.entry && item.result.cat === 'N').length,
                  }}
                  skills={gradeSkills}
                />
                <div className="summary-counts">
                  <div><span>કુલ નોંધાયેલા</span><b>{gradeStudents.length}</b></div>
                  <div><span>સાચવેલી એન્ટ્રી</span><b>{gradeEntries.length}</b></div>
                  <div><span>પૂર્ણ એન્ટ્રી</span><b>{done}</b></div>
                  <div><span>અપૂર્ણ એન્ટ્રી</span><b>{partial}</b></div>
                  <div><span>બાકી</span><b>{pending}</b></div>
                  <div><span>ગેરહાજર</span><b>{absent}</b></div>
                </div>

                {isAdmin && selectedSchoolId === 'all' && (
                  <>
                    <h3>શાળા પ્રમાણે સરખામણી</h3>
                    <div className="scroll">
                      <table className="report-table">
                        <thead>
                          <tr>
                            {[['name', 'શાળા'], ['code', 'કોડ'], ['enrolled', 'નોંધાયેલા'], ['saved', 'એન્ટ્રી'], ['complete', 'પૂર્ણ'], ['incomplete', 'અપૂર્ણ'], ['absent', 'ગેરહાજર'], ['pending', 'બાકી']].map(([key, label]) => (
                              <th key={key} className="sortable" aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                <button
                                  type="button"
                                  className="sort-btn"
                                  onClick={() => setSort((current) => (current.key === key
                                    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
                                    : { key, dir: key === 'name' || key === 'code' ? 'asc' : 'desc' }))}
                                >
                                  {label} <span aria-hidden="true">{sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                                </button>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedSchoolTotals.map((item) => (
                            <tr key={item.school.id}>
                              <td className="left">{item.school.name}</td><td>{item.school.code}</td>
                              <td className={item.enrolled === 0 ? 'zero-cell' : ''}>{item.enrolled}</td><td>{item.saved}</td><td>{item.complete}</td><td>{item.incomplete}</td><td>{item.absent}</td><td>{item.pending}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {gradeEntries.length === 0 ? (
                  <p className="muted">હજુ ડેટા ઉપલબ્ધ નથી</p>
                ) : (
                  <>
                    <h3>વિધાન / કૌશલ્ય પ્રમાણે પરિણામ</h3>
                    <div className="scroll">
                      <table className="report-table">
                        <thead><tr><th>#</th><th>ક્ષેત્ર</th><th>વિધાન</th><th>હા</th><th>જવાબ આપેલા</th><th>હા %</th></tr></thead>
                        <tbody>
                          {gradeSkills.map((item) => (
                            <tr key={item.number}>
                              <td>{item.number}</td><td>{item.area}</td><td className="left">{item.text}</td>
                              <td>{item.yes}</td><td>{item.answered}</td><td>{item.percent === null ? '—' : `${item.percent}%`}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                <h3>વિદ્યાર્થી-વાર પરિણામ</h3>
                <div className="scroll">
                  <table className="report-table">
                    <thead><tr><th>#</th><th>શાળા</th><th>વિદ્યાર્થી</th><th>જવાબ</th><th>કુલ</th><th>પરિણામ</th><th>સ્થિતિ</th></tr></thead>
                    <tbody>
                      {results.map(({ student, entry, result }, index) => (
                        <tr key={student.id}>
                          <td>{index + 1}</td>
                          <td>{schoolMap.get(student.school_id)?.name || school?.name || ''}</td>
                          <td className="left">{student.name}</td><td>{result.yes}</td><td>{result.total}</td>
                          <td>{result.cat ? CAT[result.cat].label : '—'}</td>
                          <td>{!entry ? 'બાકી' : result.cat ? 'પૂર્ણ' : 'અપૂર્ણ'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        );
      })}
      {selectedSchool && (
        <SchoolLedger
          school={selectedSchool}
          dhoran={selectedGrade === 'all' ? dhoran : selectedGrade}
          students={students}
          entries={entries}
        />
      )}
    </div>
  );
}

function SchoolLedger({ school, dhoran, students, entries }) {
  const [teacher, setTeacher] = useState(() => loadTeacher(school.id));
  const [teacherError, setTeacherError] = useState('');
  const gradeStudents = students.filter((student) =>
    student.school_id === school.id && student.dhoran === dhoran
  );
  const studentIds = new Set(gradeStudents.map((student) => student.id));
  const gradeEntries = entries.filter((entry) =>
    studentIds.has(entry.student_id) && entry.dhoran === dhoran
  );
  const rows = MONTHS.map((item, index) => {
    const categories = { U: 0, P: 0, N: 0 };
    for (const entry of gradeEntries.filter((row) => row.month === item.key)) {
      const result = calc(dhoran, entry.answers);
      if (result.cat) categories[result.cat] += 1;
    }
    const done = categories.U + categories.P + categories.N;
    return {
      no: index + 1,
      month: item.label,
      register: gradeStudents.length,
      emerging: categories.U,
      progressing: categories.P,
      proficient: categories.N,
      done,
      percentage: done && gradeStudents.length
        ? Math.round((categories.N / gradeStudents.length) * 1000) / 10
        : '',
    };
  });
  const grade = CLASSES[dhoran];

  function updateTeacher(value) {
    setTeacher(value);
    try {
      const current = JSON.parse(localStorage.getItem(`fln-school-${school.id}`)) || {};
      localStorage.setItem(`fln-school-${school.id}`, JSON.stringify({ ...current, teacher: value }));
    } catch (cause) {
      setTeacherError(`શિક્ષકની વિગતો આ device પર સાચવી શકાઈ નથી: ${cause.message}`);
    }
  }

  return (
    <section className="sheet summary-ledger">
      <div className="row between no-print">
        <h3>શાળાનો માસિક લેજર · {grade.label}</h3>
        <button onClick={() => window.print()}>PDF / પ્રિન્ટ</button>
      </div>
      <div className="fields">
        <div>શાળા: <b>{school.name}</b> ({school.code})</div>
        <div>તાલુકો: <b>{school.block}</b></div>
        <div>જિલ્લો: <b>{school.district}</b></div>
        <label>વર્ગ શિક્ષકનું નામ: <input value={teacher} onChange={(event) => updateTeacher(event.target.value)} /></label>
        <div>ધોરણ: <b>{grade.label}</b></div>
      </div>
      {teacherError && <p className="error" role="alert">{teacherError}</p>}
      <div className="scroll">
        <table className="ledger">
          <thead>
            <tr><th>ક્રમ</th><th>માસનું નામ</th><th>રજીસ્ટર</th><th>ઉદયમાન</th><th>પ્રગતિશીલ</th><th>નિપુણ</th><th>FLN સિદ્ધિ %</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.no}>
                <td>{row.no}</td><td className="left">{row.month}</td><td>{row.done ? row.register : ''}</td>
                <td>{row.done ? row.emerging : ''}</td><td>{row.done ? row.progressing : ''}</td>
                <td>{row.done ? row.proficient : ''}</td><td>{row.percentage === '' ? '' : `${row.percentage}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
