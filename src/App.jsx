import { useEffect, useState } from 'react';
import { CLASSES, MONTHS } from './lib/category';
import { supabase, supabaseConfigError } from './lib/supabase';
import Login from './pages/Login.jsx';
import AdminPanel from './pages/AdminPanel.jsx';
import Students from './pages/Students.jsx';
import Entry from './pages/Entry.jsx';
import SchoolSummary from './pages/SchoolSummary.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import ScopedDashboard from './pages/ScopedDashboard.jsx';
import SchoolYearReportButton from './components/SchoolYearReportButton.jsx';
import DashboardLayout from './components/DashboardLayout.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminReports from './pages/AdminReports.jsx';

const nowKey = new Date().toISOString().slice(0, 7);

function profileLoadMessage(cause) {
  if (
    cause.code === 'PGRST205'
    || /could not find the table ['"]public\.profiles['"] in the schema cache/i.test(cause.message || '')
  ) {
    return 'Supabase APIમાં public.profiles table મળતી નથી. Dashboardમાં migration status તપાસો; table પહેલેથી હોય તો PostgREST schema cache reload કરો. Existing tables પર migration ફરીથી ચલાવશો નહીં.';
  }
  if (
    cause.code === '42703'
    && /profiles\.must_change_password/i.test(cause.message || '')
  ) {
    return 'public.profiles.must_change_password column Supabase databaseમાં મળ્યો નથી. Supabase Dashboard → SQL Editorમાં supabase/migrations/202610130003_school_first_login_password.sql review કરીને ચલાવો. Column પહેલેથી હાજર હોય તો PostgREST schema cache reload કરો.';
  }
  return `Account ચકાસી શકાયું નથી: ${cause.message}`;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [school, setSchool] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return undefined;
    let mounted = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) setError(`Session લોડ થઈ નથી: ${sessionError.message}`);
      setSession(data.session);
      setAuthLoading(false);
    }).catch((cause) => {
      if (!mounted) return;
      setError(`Session લોડ થઈ નથી: ${cause.message}`);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setError('');
      if (!nextSession) {
        setProfile(null);
        setSchool(null);
      }
      setAuthLoading(false);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setProfile(null);
      setSchool(null);
      setProfileLoading(false);
      return undefined;
    }
    let mounted = true;
    setProfileLoading(true);
    setProfile(null);
    setSchool(null);
    setError('');
    async function loadProfile() {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, role, school_id, active')
        .eq('id', session.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!data) {
        throw new Error(
          `Supabase Auth login સફળ છે, પરંતુ public.profilesમાં Auth user id ${session.user.id} માટે row નથી. Auth userની id સાથે profiles.id મેળવો અને role/active તપાસો.`
        );
      }
      if (!data.active) {
        throw new Error('આ Supabase Auth userની public.profiles rowમાં active=false છે. Admin અધિકૃત રીતે account સક્રિય કરે પછી ફરી login કરો.');
      }
      const authEmail = session.user.email?.trim().toLowerCase();
      const profileEmail = data.email?.trim().toLowerCase();
      if (authEmail && profileEmail !== authEmail) {
        throw new Error(
          `Auth user અને public.profiles email મેળ ખાતા નથી (Auth user id ${session.user.id}). Dashboard SQL Editorમાં auth.users.email અને profiles.email સરખાવો.`
        );
      }
      if (!['admin', 'school', 'district', 'block'].includes(data.role)) {
        throw new Error('public.profiles.role માં admin, school, district અથવા block હોવું જોઈએ. અધિકૃત Admin role ચકાસે પછી ફરી login કરો.');
      }
      let profileData = { ...data, must_change_password: false };
      let schoolData = null;
      if (data.role === 'school' || data.role === 'district' || data.role === 'block') {
        if (data.role === 'district' || data.role === 'block') {
          const { data: scope, error: scopeError } = await supabase
            .from('profiles')
            .select('district_code, block_code')
            .eq('id', session.user.id)
            .maybeSingle();
          if (scopeError) throw scopeError;
          if (!scope) throw new Error('District/Block accountનો scope મળ્યો નથી.');
          profileData = { ...profileData, ...scope };
        }
        const { data: passwordState, error: passwordStateError } = await supabase
          .from('profiles')
          .select('must_change_password')
          .eq('id', session.user.id)
          .maybeSingle();
        if (passwordStateError) throw passwordStateError;
        if (!passwordState) throw new Error('આ account માટે profile મળી નથી.');
        profileData = { ...profileData, ...passwordState };
      }

      if (data.role === 'school') {
        const { data: schoolRow, error: schoolError } = await supabase
          .from('schools')
          .select('id, district, block, cluster, code, name, active')
          .eq('id', data.school_id)
          .maybeSingle();
        if (schoolError) throw schoolError;
        if (!schoolRow?.active) throw new Error('આ શાળાનું account સક્રિય નથી.');
        schoolData = schoolRow;
      }
      if (mounted) {
        setProfile(profileData);
        setSchool(schoolData);
      }
    }
    loadProfile()
      .catch((cause) => {
        if (mounted) setError(profileLoadMessage(cause));
      })
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });
    return () => { mounted = false; };
  }, [session?.user?.id]);

  async function signOut() {
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) setError(`લૉગઆઉટ નિષ્ફળ: ${signOutError.message}`);
    } catch (cause) {
      setError(`લૉગઆઉટ નિષ્ફળ: ${cause.message}`);
    }
  }

  if (supabaseConfigError) return <main className="auth-page"><p className="error">{supabaseConfigError}</p></main>;
  if (authLoading || profileLoading) return <main className="auth-page"><p>લોડ થાય છે…</p></main>;
  if (error && !session) return <main className="auth-page"><p className="error" role="alert">{error}</p><Login supabase={supabase} supabaseUrl={import.meta.env.VITE_SUPABASE_URL} /></main>;
  if (!session) return <Login supabase={supabase} supabaseUrl={import.meta.env.VITE_SUPABASE_URL} />;
  if (error) {
    return (
      <main className="auth-page">
        <div className="card auth-card">
          <p className="error" role="alert">{error}</p>
          <button onClick={signOut}>લૉગઆઉટ</button>
        </div>
      </main>
    );
  }
  if (!profile) return <main className="auth-page"><p>Account ચકાસી શકાયું નથી…</p></main>;
  if (profile.role !== 'admin' && profile.must_change_password) {
    return (
      <ChangePassword
        supabase={supabase}
        school={school}
        profile={profile}
        onComplete={() => setProfile((current) => ({ ...current, must_change_password: false }))}
        onSignOut={signOut}
      />
    );
  }
  if (profile.role === 'admin') return <AdminPanel supabase={supabase} profile={profile} onSignOut={signOut} />;
  if (profile.role === 'district' || profile.role === 'block') {
    return <ScopedDashboard supabase={supabase} profile={profile} onSignOut={signOut} />;
  }
  if (profile.role !== 'school' || !school) {
    return <main className="auth-page"><p className="error">આ account માટે યોગ્ય role સેટ નથી.</p><button onClick={signOut}>લૉગઆઉટ</button></main>;
  }
  return <SchoolTracker supabase={supabase} school={school} onSignOut={signOut} />;
}

function SchoolTracker({ supabase, school, onSignOut }) {
  const [tab, setTab] = useState('dashboard');
  const [dhoran, setDhoran] = useState('1');
  const [entryDirty, setEntryDirty] = useState(false);
  const [month, setMonth] = useState(
    MONTHS.find((m) => m.key === nowKey)?.key || MONTHS[0].key
  );

  function leaveEntry(next) {
    if (tab === 'entry' && entryDirty && !window.confirm('એન્ટ્રીમાં ન સાચવેલા ફેરફાર છે. સાચવ્યા વગર આગળ વધશો?')) {
      return false;
    }
    setEntryDirty(false);
    next();
    return true;
  }

  return (
    <DashboardLayout
      role="school"
      activeSection={tab}
      onNavigate={(nextTab) => leaveEntry(() => setTab(nextTab))}
      onLogout={() => leaveEntry(onSignOut)}
      context={`${school.district} › ${school.block} › ${school.name} · ${school.code}`}
    >
        <div className="card row manager-selectors">
          <div className="chips">
            {Object.entries(CLASSES).map(([key, item]) => (
              <button key={key} className={dhoran === key ? 'on' : ''} onClick={() => leaveEntry(() => setDhoran(key))}>{item.label}</button>
            ))}
          </div>
          <label>માસ
            <select aria-label="માસ" value={month} onChange={(e) => leaveEntry(() => setMonth(e.target.value))}>
              {MONTHS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
        </div>
        {tab === 'dashboard' && <AdminDashboard supabase={supabase} profile={{
          role: 'school',
          school_id: school.id,
          district: school.district,
          block: school.block,
          school_code: school.code,
          school_name: school.name,
        }} />}
        {tab === 'students' && <Students supabase={supabase} school={school} dhoran={dhoran} />}
        {tab === 'entry' && <Entry supabase={supabase} school={school} dhoran={dhoran} month={month} onDirtyChange={setEntryDirty} />}
        {tab === 'summary' && <SchoolSummary supabase={supabase} school={school} dhoran={dhoran} month={month} />}
        {tab === 'reports' && <AdminReports supabase={supabase} profile={{ role: 'school' }} />}
        {tab === 'annual-report' && (
          <section className="card">
            <h2>વાર્ષિક શાળા FLN Report</h2>
            <p className="muted">{school.name} · {school.code}</p>
            <SchoolYearReportButton supabase={supabase} school={school} />
          </section>
        )}
    </DashboardLayout>
  );
}
