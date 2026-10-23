import { useState } from 'react';
import * as XLSX from '@e965/xlsx';
import { loadAllRows } from '../lib/loadAllRows';

const LIMIT = 100;

// Schools without students, and students whose school is missing / inactive.
// Admin, District, Block: the database (RLS) already limits rows to the caller's own area.
export default function DataCheck({ supabase, focus = 'school' }) {
  const [state, setState] = useState({ status: 'idle', result: null, error: '' });
  const [search, setSearch] = useState('');
  const [countFilter, setCountFilter] = useState('all');

  async function run() {
    setState({ status: 'loading', result: null, error: '' });
    try {
      const [schools, students] = await Promise.all([
        loadAllRows(supabase.from('schools').select('id,code,name,district,block,active').order('code')),
        loadAllRows(supabase.from('students').select('id,school_id').order('id')),
      ]);
      const activeIds = new Set(schools.filter((item) => item.active).map((item) => item.id));
      const schoolById = new Map(schools.map((item) => [item.id, item]));
      const countBySchool = new Map();
      students.forEach((student) => countBySchool.set(student.school_id, (countBySchool.get(student.school_id) || 0) + 1));
      const noStudents = schools.filter((item) => item.active && !countBySchool.get(item.id));
      const orphanMap = new Map();
      students.forEach((student) => {
        if (activeIds.has(student.school_id)) return;
        const known = schoolById.get(student.school_id);
        const entry = orphanMap.get(student.school_id) || {
          id: student.school_id,
          name: known?.name || 'શાળા મળતી નથી',
          code: known?.code || '',
          reason: known ? 'શાળા નિષ્ક્રિય છે' : 'શાળા યાદીમાં નથી',
          count: 0,
        };
        entry.count += 1;
        orphanMap.set(student.school_id, entry);
      });
      setState({
        status: 'done',
        error: '',
        result: {
          schoolCount: schools.filter((item) => item.active).length,
          studentCount: students.length,
          noStudents,
          perSchool: schools.filter((item) => item.active)
            .map((item) => ({ ...item, count: countBySchool.get(item.id) || 0 }))
            .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name)),
          orphans: [...orphanMap.values()].sort((a, b) => b.count - a.count),
        },
      });
    } catch (cause) {
      setState({ status: 'error', result: null, error: `તપાસ થઈ શકી નથી: ${cause.message}` });
    }
  }

  const { status, result, error } = state;
  const needle = search.trim().toLowerCase();
  const orphans = (result?.orphans || []).filter((item) => !needle
    || `${item.name} ${item.code}`.toLowerCase().includes(needle));
  const orphanTotal = (result?.orphans || []).reduce((sum, item) => sum + item.count, 0);

  const perSchool = result?.perSchool || [];
  const zeroCount = perSchool.filter((item) => item.count === 0).length;
  const shownSchools = perSchool
    .filter((item) => countFilter === 'all' || (countFilter === 'zero' ? item.count === 0 : item.count > 0))
    .filter((item) => !needle || `${item.name} ${item.code} ${item.block} ${item.district}`.toLowerCase().includes(needle));

  function exportExcel() {
    const rows = perSchool.map((item) => ({
      'જિલ્લો': item.district, 'બ્લોક': item.block, 'શાળા': item.name, 'શાળા કોડ': item.code,
      'વિદ્યાર્થી સંખ્યા': item.count, 'સ્થિતિ': item.count ? 'વિદ્યાર્થી છે' : '0 વિદ્યાર્થી',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'School-wise students');
    XLSX.writeFile(wb, 'school_wise_student_count.xlsx');
  }

  const schoolBlock = (
    <section className="check-block" key="schools">
      <h4>🏫 શાળા પ્રમાણે વિદ્યાર્થી સંખ્યા <span className={`check-pill ${zeroCount ? 'warn' : 'ok'}`}>0 વિદ્યાર્થી: {zeroCount}</span></h4>
      <div className="row check-filters">
        {[['all', `બધી (${perSchool.length})`], ['zero', `0 વિદ્યાર્થી (${zeroCount})`], ['has', `વિદ્યાર્થી છે (${perSchool.length - zeroCount})`]].map(([key, label]) => (
          <button type="button" key={key} className={countFilter === key ? 'on' : ''} onClick={() => setCountFilter(key)}>{label}</button>
        ))}
        <button type="button" onClick={exportExcel}>⬇ Excel</button>
      </div>
      <div className="scroll check-table">
        <table className="report-table">
          <thead><tr><th>શાળા</th><th>કોડ</th><th>બ્લોક</th><th>વિદ્યાર્થી</th></tr></thead>
          <tbody>
            {shownSchools.slice(0, 200).map((item) => (
              <tr key={item.id} className={item.count === 0 ? 'zero-row' : ''}>
                <td className="left">{item.name}</td>
                <td>{item.code}</td>
                <td>{item.block}</td>
                <td>{item.count === 0 ? <span className="check-pill warn">0 · વિદ્યાર્થી નથી</span> : <b>{item.count}</b>}</td>
              </tr>
            ))}
            {!shownSchools.length && <tr><td colSpan="4" className="muted">કોઈ શાળા મળી નથી.</td></tr>}
          </tbody>
        </table>
      </div>
      {shownSchools.length > 200 && <small className="muted">પહેલી 200 બતાવી છે ({shownSchools.length} માંથી); શોધ કે ફિલ્ટર વાપરો.</small>}
    </section>
  );
  const studentBlock = (
    <section className="check-block" key="students">
      <h4>👤 શાળા વગરના વિદ્યાર્થી <span className={`check-pill ${orphanTotal ? 'warn' : 'ok'}`}>{orphanTotal}</span></h4>
      {!orphanTotal
        ? <p className="muted">✔ બધા વિદ્યાર્થીની શાળા સક્રિય છે.</p>
        : (
          <ul className="list check-list">
            {orphans.slice(0, LIMIT).map((item) => (
              <li key={item.id}>
                <span><b>{item.name}</b> {item.code && <small>({item.code})</small>}<br /><small className="muted">{item.reason}</small></span>
                <b>{item.count} વિદ્યાર્થી</b>
              </li>
            ))}
          </ul>
        )}
    </section>
  );

  return (
    <div className="card data-check">
      <div className="row between">
        <p className="muted">શાળા અને વિદ્યાર્થી વચ્ચેનો મેળ તપાસે છે: કઈ શાળામાં વિદ્યાર્થી નથી, અને કયા વિદ્યાર્થીની શાળા નથી/નિષ્ક્રિય છે.</p>
        <button type="button" className="primary" disabled={status === 'loading'} onClick={run}>
          {status === 'loading' ? 'તપાસ ચાલુ…' : '🔎 તપાસ કરો'}
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {result && (
        <>
          <div className="check-summary">
            <span>કુલ શાળા <b>{result.schoolCount}</b></span>
            <span>કુલ વિદ્યાર્થી <b>{result.studentCount.toLocaleString()}</b></span>
            <span>વિદ્યાર્થી વગરની શાળા <b>{result.noStudents.length}</b></span>
            <span>શાળા વગરના વિદ્યાર્થી <b>{orphanTotal}</b></span>
          </div>
          <input type="search" placeholder="શાળા / કોડ શોધો…" value={search} onChange={(event) => setSearch(event.target.value)} />
          {focus === 'student' ? [studentBlock, schoolBlock] : [schoolBlock, studentBlock]}
        </>
      )}
    </div>
  );
}
