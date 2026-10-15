import { useEffect, useState } from 'react';
import { CLASSES, MONTHS } from '../lib/category';
import Students from './Students.jsx';
import Entry from './Entry.jsx';
import Summary from './Summary.jsx';
import AdminStudentImport from './AdminStudentImport.jsx';
import AdminReports from './AdminReports.jsx';
import SchoolYearReportButton from '../components/SchoolYearReportButton.jsx';
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
  const [accounts, setAccounts] = useState({});
  const [form, setForm] = useState(emptySchool);
  const [editingId, setEditingId] = useState(null);
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
    const schoolIds = (schoolRows || []).map((school) => school.id);
    const { data: profileRows, error: profileError } = schoolIds.length
      ? await supabase.from('profiles').select('school_id').eq('role', 'school').in('school_id', schoolIds)
      : { data: [], error: null };
    if (profileError) throw profileError;
    setSchools(schoolRows || []);
    setAccounts(Object.fromEntries((profileRows || []).map((row) => [row.school_id, true])));
    setSchoolPageCount(Math.ceil((count || 0) / schoolPageSize));
    setSchoolsLoaded(true);
  }

  useEffect(() => {
    loadSchools().catch((cause) => setError(`શાળાઓ લોડ થઈ શકી નથી: ${cause.message}`));
  }, [supabase, schoolPage]);

  function startEdit(school) {
    setEditingId(school.id);
    setForm({
      district: school.district,
      block: school.block,
      cluster: school.cluster,
      code: school.code,
      name: school.name,
      active: school.active,
    });
    setError('');
    setMessage('');
  }

  function clearForm() {
    setEditingId(null);
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
    if ((!editingId || !accounts[editingId]) && !/^\d{11}$/.test(payload.code)) {
      setError('School Code / Login ID 11 અંકનો હોવો જોઈએ.');
      setBusy(false);
      return;
    }
    try {
      const result = editingId
        ? await supabase.from('schools').update(payload).eq('id', editingId)
        : await supabase.from('schools').insert(payload);
      if (result.error) throw result.error;
      setMessage(editingId ? 'શાળાની વિગતો અપડેટ થઈ.' : 'શાળા ઉમેરાઈ.');
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
        <h2>તાલુકાવાર શાળાઓ (પાનું {Math.min(schoolPage + 1, schoolPageCount)}/{schoolPageCount})</h2>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        <AdminScopedAccountManagement supabase={supabase} />

        <AdminStudentImport supabase={supabase} schoolsLoaded={schoolsLoaded} />
        <AdminSchoolImport supabase={supabase} onImportComplete={loadSchools} />

        <AdminReports supabase={supabase} />

        <AdminSchoolWorkspace supabase={supabase} schools={schools} onEntryDirtyChange={setWorkspaceEntryDirty} />

        <form className="card" onSubmit={saveSchool}>
          <h3>{editingId ? 'શાળાની વિગતો બદલો' : 'નવી શાળા ઉમેરો'}</h3>
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
              disabled={Boolean(editingId && accounts[editingId])}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </label>
          <label>શાળાનું નામ<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          {editingId && (
            <label className="check-label">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              સક્રિય
            </label>
          )}
          <div className="row">
            <button className="primary" disabled={busy}>{busy ? 'સાચવાય છે…' : editingId ? 'અપડેટ કરો' : 'શાળા ઉમેરો'}</button>
            {editingId && <button type="button" onClick={clearForm}>રદ કરો</button>}
          </div>
        </form>

        {!schools.length ? (
          <p className="muted">હજુ કોઈ શાળા ઉમેરાઈ નથી.</p>
        ) : (
          <ul className="list school-list">
            {schools.map((school) => (
              <li key={school.id} className="school-card">
                <div>
                  <b>{school.name}</b> · {school.code}
                  <div className="muted">{school.district} › {school.block} › {school.cluster || '—'}</div>
                  <div className={school.active ? 'success' : 'muted'}>
                    {school.active ? 'સક્રિય' : 'નિષ્ક્રિય'}
                    {accounts[school.id] ? ` · Login ID: ${school.code}` : ' · Login account નથી'}
                  </div>
                </div>
                <div className="row school-actions">
                  <button onClick={() => startEdit(school)}>સંપાદિત કરો</button>
                  {school.active && <SchoolYearReportButton supabase={supabase} school={school} />}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="row between">
          <button disabled={schoolPage <= 0 || busy} onClick={() => setSchoolPage((value) => value - 1)}>પાછળનું પાનું</button>
          <span className="muted">શાળાઓ એક સમયે {schoolPageSize} જ લોડ થાય છે.</span>
          <button disabled={!schoolPageCount || schoolPage + 1 >= schoolPageCount || busy} onClick={() => setSchoolPage((value) => value + 1)}>આગળનું પાનું</button>
        </div>
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
      <h3>શાળા અને વિદ્યાર્થી Management</h3>
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
