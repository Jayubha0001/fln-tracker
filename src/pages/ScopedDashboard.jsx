import { useEffect, useState } from 'react';
import { CLASSES, MONTHS } from '../lib/category';
import AdminReports from './AdminReports.jsx';
import Entry from './Entry.jsx';
import Students from './Students.jsx';
import Summary from './Summary.jsx';
import SchoolYearReportButton from '../components/SchoolYearReportButton.jsx';

export default function ScopedDashboard({ supabase, profile, onSignOut }) {
  const [schools, setSchools] = useState([]);
  const [schoolCount, setSchoolCount] = useState(0);
  const [schoolPage, setSchoolPage] = useState(0);
  const [schoolsLoaded, setSchoolsLoaded] = useState(false);
  const [schoolId, setSchoolId] = useState('');
  const [dhoran, setDhoran] = useState('1');
  const [month, setMonth] = useState(MONTHS[0].key);
  const [tab, setTab] = useState('report');
  const [entryDirty, setEntryDirty] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const pageSize = 100;
    setError('');
    supabase.from('schools')
      .select('id,code,name,district,block,cluster,active', { count: 'exact' })
      .order('name').order('code')
      .range(schoolPage * pageSize, (schoolPage + 1) * pageSize - 1)
      .then(({ data, error: schoolError, count }) => {
        if (!active) return;
        if (schoolError) throw schoolError;
        const pageSchools = data || [];
        setSchools(pageSchools);
        setSchoolCount(count || 0);
        setSchoolId(pageSchools[0]?.id || '');
        setSchoolsLoaded(true);
      })
      .catch((cause) => {
        if (active) {
          setError(`તમારા વિસ્તારની શાળાઓ લોડ થઈ નથી: ${cause.message}`);
          setSchoolsLoaded(true);
        }
      });
    return () => { active = false; };
  }, [supabase, schoolPage]);

  const school = schools.find((item) => item.id === schoolId) || null;

  function changeTab(nextTab) {
    if (entryDirty && !window.confirm('એન્ટ્રીમાં ન સાચવેલા ફેરફાર છે. ટેબ બદલશો?')) return;
    setTab(nextTab);
  }

  function changeSchoolPage(nextPage) {
    if (entryDirty && !window.confirm('ન સાચવેલા ફેરફાર છે. શાળાનું પાનું બદલશો?')) return;
    setEntryDirty(false);
    setSchoolPage(nextPage);
  }

  async function signOutSafely() {
    if (entryDirty && !window.confirm('એન્ટ્રીમાં ન સાચવેલા ફેરફાર છે. લૉગઆઉટ કરશો?')) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(`લૉગઆઉટ નિષ્ફળ: ${signOutError.message}`);
    else onSignOut();
  }

  const isDistrict = profile.role === 'district';
  const scopedSchool = schools[0];
  const scopeLabel = isDistrict
    ? `જિલ્લો ${scopedSchool?.district || profile.district_code} (${profile.district_code})`
    : `જિલ્લો ${scopedSchool?.district || profile.district_code} (${profile.district_code}) · બ્લોક ${scopedSchool?.block || profile.block_code} (${profile.block_code})`;

  return (
    <div className="app">
      <header className="no-print">
        <div className="row between">
          <div>
            <h1>FLN Tracker – {isDistrict ? 'District' : 'Block'} Dashboard</h1>
            <span className="muted">{scopeLabel} · {schoolCount.toLocaleString()} શાળાઓ</span>
          </div>
          <button onClick={signOutSafely}>લૉગઆઉટ</button>
        </div>
      </header>
      <main>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="card row manager-selectors">
          <label>શાળા
            <select value={schoolId} onChange={(event) => {
              if (entryDirty && !window.confirm('ન સાચવેલા ફેરફાર છે. બીજી શાળા પસંદ કરશો?')) return;
              setSchoolId(event.target.value);
            }}>
              {schools.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
            </select>
          </label>
          <label>ધોરણ
            <select value={dhoran} onChange={(event) => setDhoran(event.target.value)}>
              {Object.entries(CLASSES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
            </select>
          </label>
          <label>Assessment month
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              {MONTHS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          {school && <SchoolYearReportButton supabase={supabase} school={school} />}
        </div>
        <div className="row between">
          <button disabled={schoolPage <= 0} onClick={() => changeSchoolPage(schoolPage - 1)}>પાછળનું પાનું</button>
          <span className="muted">શાળાઓ {schools.length ? schoolPage * 100 + 1 : 0}–{Math.min((schoolPage + 1) * 100, schoolCount)} / {schoolCount.toLocaleString()}</span>
          <button disabled={(schoolPage + 1) * 100 >= schoolCount} onClick={() => changeSchoolPage(schoolPage + 1)}>આગળનું પાનું</button>
        </div>
        <nav>
          {[
            ['report', 'દિવસવાર / તમામ શાળા Report'],
            ['students', 'વિદ્યાર્થી'],
            ['entry', 'એન્ટ્રી'],
            ['summary', 'સારાંશ'],
          ].map(([key, label]) => (
            <button key={key} className={tab === key ? 'on' : ''} onClick={() => changeTab(key)}>{label}</button>
          ))}
        </nav>
        {tab === 'report' && <AdminReports supabase={supabase} />}
        {school && tab === 'students' && <Students supabase={supabase} school={school} />}
        {school && tab === 'entry' && (
          <Entry supabase={supabase} school={school} dhoran={dhoran} month={month} onDirtyChange={setEntryDirty} />
        )}
        {school && tab === 'summary' && (
          <Summary supabase={supabase} school={school} dhoran={dhoran} month={month} />
        )}
        {schoolsLoaded && !schools.length && !error && <p className="muted">આ વિસ્તાર માટે કોઈ સક્રિય શાળા મળી નથી.</p>}
      </main>
    </div>
  );
}
