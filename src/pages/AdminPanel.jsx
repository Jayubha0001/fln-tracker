import { useEffect, useState } from 'react';
import { CLASSES, MONTHS } from '../lib/category';
import Students from './Students.jsx';
import Entry from './Entry.jsx';
import Summary from './Summary.jsx';
import AdminStudentImport from './AdminStudentImport.jsx';
import AdminReports from './AdminReports.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import AdminSchoolImport from './AdminSchoolImport.jsx';
import AdminScopedAccountManagement from './AdminScopedAccountManagement.jsx';

const emptySchool = {
  district: '',
  block: '',
  cluster: '',
  code: '',
  name: '',
  active: true,
};

export default function AdminPanel({ supabase, profile, onSignOut }) {
  const [schools, setSchools] = useState([]);
  const [schoolsLoaded, setSchoolsLoaded] = useState(false);
  const [schoolPage, setSchoolPage] = useState(0);
  const [schoolPageCount, setSchoolPageCount] = useState(0);
  const schoolPageSize = 100;
  const [form, setForm] = useState(emptySchool);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [workspaceEntryDirty, setWorkspaceEntryDirty] = useState(false);

  function signOutSafely() {
    if (workspaceEntryDirty && !window.confirm('એન્ટ્રીમાં ન સાચવેલા ફેરફાર છે. સાચવ્યા વગર લૉગઆઉટ કરશો?')) return;
    setWorkspaceEntryDirty(false);
    onSignOut();
  }

  async function loadSchools() {
    const from = schoolPage * schoolPageSize;
    const { data: schoolRows, error: schoolError, count } = await supabase.from('schools')
      .select('*', { count: 'exact' })
      .order('district').order('block').order('name')
      .range(from, from + schoolPageSize - 1);
    if (schoolError) throw schoolError;
    setSchools(schoolRows || []);
    setSchoolPageCount(Math.ceil((count || 0) / schoolPageSize));
    setSchoolsLoaded(true);
  }

  useEffect(() => {
    loadSchools().catch((cause) => setError(`શાળાઓ લોડ થઈ શકી નથી: ${cause.message}`));
  }, [supabase, schoolPage]);

  function clearForm() {
    setForm(emptySchool);
  }

  async function saveSchool(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const payload = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
    );
    if (!/^\d{11}$/.test(payload.code)) {
      setError('School Code / Login ID 11 અંકનો હોવો જોઈએ.');
      setBusy(false);
      return;
    }
    try {
      const result = await supabase.from('schools').insert(payload);
      if (result.error) throw result.error;
      setMessage('શાળા ઉમેરાઈ.');
      clearForm();
      await loadSchools();
    } catch (cause) {
      setError(`શાળા સાચવી/લોડ કરી શકાઈ નથી: ${cause.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="no-print">
        <div className="row between">
          <div>
            <h1>Admin Panel – FLN Tracker</h1>
            <span className="muted">{profile.email}</span>
          </div>
          <button onClick={signOutSafely}>લૉગઆઉટ</button>
        </div>
      </header>
      <main>
        <AdminDashboard supabase={supabase} profile={profile} />

        <div className="admin-tools">
          <div className="dash-hero slim">
            <div><small>ADMIN</small><h2>Admin Tools</h2></div>
            {error && <p className="error" role="alert">{error}</p>}
            {message && <p className="success" role="status">{message}</p>}
          </div>
          <ToolPanel icon="🔐" title="Login & Password Management" hint="District · Block · School accounts" defaultOpen>
            <AdminScopedAccountManagement supabase={supabase} />
          </ToolPanel>
          <ToolPanel icon="🧒" title="વિદ્યાર્થી Import" hint="Excel / CSV">
            <AdminStudentImport supabase={supabase} schoolsLoaded={schoolsLoaded} />
          </ToolPanel>
          <ToolPanel icon="🏫" title="શાળા Import / Add" hint="Excel / CSV">
            <AdminSchoolImport supabase={supabase} onImportComplete={loadSchools} />
          </ToolPanel>
          <ToolPanel icon="📝" title="શાળા અને વિદ્યાર્થી Workspace" hint="Admin તરીકે entry / report">
        <section className="card">
          <h3>શાળા અને વિદ્યાર્થી workspace</h3>
          <p className="muted">Workspace dropdown માટે શાળાઓ પાનાં પ્રમાણે લોડ થાય છે. Login, edit અને report actions ઉપરના Central Login &amp; Password Managementમાં છે.</p>
          <div className="row between">
            <button type="button" disabled={schoolPage <= 0 || busy} onClick={() => setSchoolPage((value) => value - 1)}>પાછળનું school page</button>
            <span className="muted">પાનું {schoolPageCount ? schoolPage + 1 : 0}/{schoolPageCount}</span>
            <button type="button" disabled={!schoolPageCount || schoolPage + 1 >= schoolPageCount || busy} onClick={() => setSchoolPage((value) => value + 1)}>આગળનું school page</button>
          </div>
        </section>
        <AdminSchoolWorkspace supabase={supabase} schools={schools} onEntryDirtyChange={setWorkspaceEntryDirty} />
          </ToolPanel>
          <ToolPanel icon="➕" title="નવી શાળા ઉમેરો" hint="એક શાળા manual">
        <form className="card" onSubmit={saveSchool}>
          <h3>નવી શાળા ઉમેરો</h3>
          <label>જિલ્લો<input required value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></label>
          <label>
            તાલુકો પસંદ કરો અથવા નવો દાખલ કરો
            <input
              required
              list="fln-taluka-options"
              value={form.block}
              onChange={(e) => setForm({ ...form, block: e.target.value })}
            />
            <datalist id="fln-taluka-options">
              {[...new Set(schools.map((school) => school.block.trim()).filter(Boolean))].map((block) => (
                <option key={block} value={block} />
              ))}
            </datalist>
          </label>
          <label>ક્લસ્ટર<input value={form.cluster} onChange={(e) => setForm({ ...form, cluster: e.target.value })} /></label>
          <label>
            શાળા કોડ / School ID
            <input
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </label>
          <label>શાળાનું નામ<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <div className="row">
            <button className="primary" disabled={busy}>{busy ? 'સાચવાય છે…' : 'શાળા ઉમેરો'}</button>
            <button type="button" onClick={clearForm}>ફોર્મ સાફ કરો</button>
          </div>
        </form>
          </ToolPanel>
        </div>

        <AdminReports supabase={supabase} profile={{ role: 'admin' }} />
      </main>
    </div>
  );
}

function AdminSchoolWorkspace({ supabase, schools, onEntryDirtyChange }) {
  const [schoolId, setSchoolId] = useState('');
  const [tab, setTab] = useState('students');
  const [dhoran, setDhoran] = useState('1');
  const [month, setMonth] = useState(MONTHS[0].key);
  const [entryDirty, setEntryDirty] = useState(false);
  const school = schools.find((item) => item.id === schoolId);

  function leaveEntry(next) {
    if (tab === 'entry' && entryDirty && !window.confirm('એન્ટ્રીમાં ન સાચવેલા ફેરફાર છે. સાચવ્યા વગર આગળ વધશો?')) {
      return;
    }
    setEntryDirty(false);
    onEntryDirtyChange(false);
    next();
  }

  return (
    <section className="card">
      <h3>Student અને Assessment Workspace</h3>
      <label>
        શાળા પસંદ કરો
        <select value={schoolId} onChange={(event) => leaveEntry(() => setSchoolId(event.target.value))}>
          <option value="">— શાળા પસંદ કરો —</option>
          {schools.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.code}{item.active ? '' : ' (નિષ્ક્રિય)'}
            </option>
          ))}
        </select>
      </label>
      {school && (
        <>
          <div className="row">
            <select aria-label="ધોરણ" value={dhoran} onChange={(event) => leaveEntry(() => setDhoran(event.target.value))}>
              {Object.entries(CLASSES).map(([key, item]) => (
                <option key={key} value={key}>{item.label}</option>
              ))}
            </select>
            <select aria-label="માસ" value={month} onChange={(event) => leaveEntry(() => setMonth(event.target.value))}>
              {MONTHS.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </div>
          <nav>
            <button className={tab === 'students' ? 'on' : ''} onClick={() => leaveEntry(() => setTab('students'))}>વિદ્યાર્થી</button>
            <button className={tab === 'entry' ? 'on' : ''} onClick={() => setTab('entry')}>એન્ટ્રી</button>
            <button className={tab === 'summary' ? 'on' : ''} onClick={() => leaveEntry(() => setTab('summary'))}>રિપોર્ટ</button>
          </nav>
          {tab === 'students' && <Students supabase={supabase} school={school} dhoran={dhoran} />}
          {tab === 'entry' && <Entry
            supabase={supabase}
            school={school}
            dhoran={dhoran}
            month={month}
            onDirtyChange={(dirty) => {
              setEntryDirty(dirty);
              onEntryDirtyChange(dirty);
            }}
          />}
          {tab === 'summary' && <Summary supabase={supabase} school={school} dhoran={dhoran} month={month} />}
        </>
      )}
    </section>
  );
}

function ToolPanel({ icon, title, hint, defaultOpen = false, children }) {
  return (
    <details className="tool" open={defaultOpen}>
      <summary><span className="tool-ico">{icon}</span><b>{title}</b><small>{hint}</small><i className="tool-chev">▾</i></summary>
      <div className="tool-body">{children}</div>
    </details>
  );
}
