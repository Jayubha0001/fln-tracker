import { useEffect, useState } from 'react';
import { CLASSES, MONTHS, currentMonthKey } from '../lib/category';
import AdminReports from './AdminReports.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import Entry from './Entry.jsx';
import Students from './Students.jsx';
import Summary from './Summary.jsx';
import DashboardLayout from '../components/DashboardLayout.jsx';
import SchoolYearReportButton from '../components/SchoolYearReportButton.jsx';
import AdminScopedAccountManagement from './AdminScopedAccountManagement.jsx';
import { ScopedSchoolTools } from '../components/SchoolTools.jsx';
import DataCheck from '../components/DataCheck.jsx';

export default function ScopedDashboard({ supabase, profile, onSignOut }) {
  const [schools, setSchools] = useState([]);
  const [schoolCount, setSchoolCount] = useState(0);
  const [schoolPage, setSchoolPage] = useState(0);
  const [schoolsLoaded, setSchoolsLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [schoolId, setSchoolId] = useState('');
  const [dhoran, setDhoran] = useState('1');
  const [month, setMonth] = useState(currentMonthKey);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [entryDirty, setEntryDirty] = useState(false);
  const [credentialsVisible, setCredentialsVisible] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const pageSize = 100;
    setError('');
    supabase.from('schools')
      .select('id,code,name,district,block,cluster,active', { count: 'exact' })
      .eq('active', true)
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
  }, [supabase, schoolPage, reloadKey]);

  const school = schools.find((item) => item.id === schoolId) || null;

  function changeSection(nextSection) {
    if (entryDirty && !window.confirm('એન્ટ્રીમાં ન સાચવેલા ફેરફાર છે. ટેબ બદલશો?')) return false;
    if (credentialsVisible && !window.confirm('One-time credentials panel છોડશો? Copy/download કર્યા ન હોય તો password ફરી જોઈ શકાશે નહીં.')) return false;
    setEntryDirty(false);
    setCredentialsVisible(false);
    setActiveSection(nextSection);
    return true;
  }

  function changeSchoolPage(nextPage) {
    if (entryDirty && !window.confirm('ન સાચવેલા ફેરફાર છે. શાળાનું પાનું બદલશો?')) return;
    setEntryDirty(false);
    setSchoolPage(nextPage);
  }

  async function signOutSafely() {
    if (entryDirty && !window.confirm('એન્ટ્રીમાં ન સાચવેલા ફેરફાર છે. લૉગઆઉટ કરશો?')) return;
    if (credentialsVisible && !window.confirm('One-time credentials panel છોડશો? Copy/download કર્યા ન હોય તો password ફરી જોઈ શકાશે નહીં.')) return;
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
    <DashboardLayout
      role={profile.role}
      activeSection={activeSection}
      onNavigate={changeSection}
      onLogout={signOutSafely}
      context={`${scopeLabel} · ${schoolCount.toLocaleString()} શાળાઓ`}
    >
        {error && <p className="error" role="alert">{error}</p>}
        {activeSection === 'dashboard' && <AdminDashboard supabase={supabase} profile={profile} />}
        {activeSection === 'reports' && <AdminReports supabase={supabase} profile={profile} />}
        {activeSection === 'accounts' && (
          <AdminScopedAccountManagement
            supabase={supabase}
            profile={profile}
            initialAccountType={profile.role === 'district' ? 'block' : 'school'}
            onCredentialsVisibilityChange={setCredentialsVisible}
          />
        )}
        {['schools', 'students', 'entry'].includes(activeSection) && (
          <>
        <div className="card row manager-selectors">
          <label>શાળા
            <select value={schoolId} onChange={(event) => {
              if (entryDirty && !window.confirm('ન સાચવેલા ફેરફાર છે. બીજી શાળા પસંદ કરશો?')) return;
              setEntryDirty(false);
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
        </div>
        <div className="row between">
          <button disabled={schoolPage <= 0} onClick={() => changeSchoolPage(schoolPage - 1)}>પાછળનું પાનું</button>
          <span className="muted">શાળાઓ {schools.length ? schoolPage * 100 + 1 : 0}–{Math.min((schoolPage + 1) * 100, schoolCount)} / {schoolCount.toLocaleString()}</span>
          <button disabled={(schoolPage + 1) * 100 >= schoolCount} onClick={() => changeSchoolPage(schoolPage + 1)}>આગળનું પાનું</button>
        </div>
        {activeSection === 'schools' && school && (
          <section className="card">
            <h3>{school.name} · {school.code}</h3>
            <p className="muted">{school.district} › {school.block} · {school.cluster || ''}</p>
            <SchoolYearReportButton supabase={supabase} school={school} />
          </section>
        )}
        {activeSection === 'schools' && (
          <ScopedSchoolTools supabase={supabase} onChanged={() => setReloadKey((value) => value + 1)} />
        )}
        {activeSection === 'schools' && (
          <details className="tool">
            <summary>
              <span className="tool-ico" aria-hidden="true">🔎</span>
              <b>તપાસ: શાળા ↔ વિદ્યાર્થી</b>
              <small>વિદ્યાર્થી વગરની શાળા અને શાળા વગરના વિદ્યાર્થી</small>
              <i className="tool-chev" aria-hidden="true">⌄</i>
            </summary>
            <div className="tool-body"><DataCheck supabase={supabase} focus="school" /></div>
          </details>
        )}
          </>
        )}
        {activeSection === 'students' && (
          <details className="tool">
            <summary>
              <span className="tool-ico" aria-hidden="true">🔎</span>
              <b>તપાસ: વિદ્યાર્થી ↔ શાળા</b>
              <small>શાળા વગરના વિદ્યાર્થી અને વિદ્યાર્થી વગરની શાળા</small>
              <i className="tool-chev" aria-hidden="true">⌄</i>
            </summary>
            <div className="tool-body"><DataCheck supabase={supabase} focus="student" /></div>
          </details>
        )}
        {school && activeSection === 'students' && <Students key={school.id} supabase={supabase} school={school} dhoran={dhoran} />}
        {school && activeSection === 'entry' && (
          <Entry supabase={supabase} school={school} dhoran={dhoran} month={month} onDirtyChange={setEntryDirty} />
        )}
        {activeSection === 'summary' && (
          <Summary
            supabase={supabase}
            isAdmin
            schools={schools}
            dhoran={dhoran}
            month={month}
            scopeLabel={profile.role === 'district'
              ? `જિલ્લો ${schools[0]?.district || profile.district_code || ''}`
              : `બ્લોક ${schools[0]?.block || profile.block_code || ''}`}
          />
        )}
        {schoolsLoaded && !schools.length && !error && <p className="muted">આ વિસ્તાર માટે કોઈ સક્રિય શાળા મળી નથી.</p>}
    </DashboardLayout>
  );
}
