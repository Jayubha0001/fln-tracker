import { useEffect, useState } from 'react';
import { CLASSES, MONTHS } from '../lib/category';
import Students from './Students.jsx';
import Entry from './Entry.jsx';
import Summary from './Summary.jsx';
import AdminStudentImport from './AdminStudentImport.jsx';
import AdminReports from './AdminReports.jsx';
import { loadAllRows } from '../lib/loadAllRows';

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
  const [accounts, setAccounts] = useState({});
  const [createdCredentials, setCreatedCredentials] = useState([]);
  const [accountResults, setAccountResults] = useState([]);
  const [resetCredential, setResetCredential] = useState(null);
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
    const [schoolRows, profileRows] = await Promise.all([
      loadAllRows(supabase.from('schools').select('*').order('district').order('block').order('name')),
      loadAllRows(supabase.from('profiles').select('school_id').eq('role', 'school')),
    ]);
    setSchools(schoolRows);
    setAccounts(Object.fromEntries(profileRows.map((row) => [row.school_id, true])));
    setSchoolsLoaded(true);
  }

  useEffect(() => {
    loadSchools().catch((cause) => setError(`શાળાઓ લોડ થઈ શકી નથી: ${cause.message}`));
  }, [supabase]);

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

  async function createAccounts(schoolId = null) {
    const targets = schoolId
      ? schools.filter((school) => school.id === schoolId && school.active && !accounts[school.id])
      : schools.filter((school) => school.active && !accounts[school.id]);
    if (!targets.length) {
      setError('બધી સક્રિય શાળાઓના Login accounts પહેલેથી છે.');
      return;
    }
    const approved = confirm(
      schoolId
        ? 'આ શાળા માટે અલગ one-time password સાથે Login બનાવવું?'
        : `${targets.length} બાકી સક્રિય શાળાઓ માટે અલગ one-time password સાથે Login બનાવવા?`
    );
    if (!approved) return;

    setBusy(true);
    setError('');
    setMessage('');
    setCreatedCredentials([]);
    setAccountResults([]);
    const createdCredentialsResult = [];
    const accountResultsResult = [];
    let requestFailure = '';
    try {
      for (let offset = 0; offset < targets.length; offset += 100) {
        const batch = targets.slice(offset, offset + 100);
        const { data, error: invokeError } = await supabase.functions.invoke('create-school-account', {
          body: { schoolIds: batch.map((school) => school.id) },
        });
        if (invokeError) {
          let detail = invokeError.message;
          let statusText = '';
          if (invokeError.context instanceof Response) {
            statusText = `HTTP ${invokeError.context.status}`;
            try {
              const bodyText = await invokeError.context.clone().text();
              try {
                const body = JSON.parse(bodyText);
                if (typeof body.error === 'string') {
                  detail = body.error;
                } else if (typeof body.message === 'string') {
                  detail = body.message;
                } else if (bodyText) {
                  detail = bodyText.slice(0, 500);
                }
              } catch {
                if (bodyText) detail = bodyText.slice(0, 500);
              }
            } catch {
              detail = invokeError.message;
            }
          } else if (invokeError.name === 'FunctionsFetchError') {
            detail = `${invokeError.message} HTTP response મળ્યો નથી; Vercel Supabase URL, Edge Function deployment, browser Network/CORS તપાસો.`;
          }
          requestFailure = `create-school-account request નિષ્ફળ (${statusText || invokeError.name}): ${detail}`;
          accountResultsResult.push(...batch.map((school) => ({
            schoolCode: school.code,
            schoolName: school.name,
            status: 'unknown',
            reason: `${statusText ? `${statusText}: ` : 'HTTP response મળ્યો નથી. '}${detail} Retry પહેલાં Supabase Auth અને profilesમાં આ SchoolIdની સ્થિતિ verify કરો.`,
          })));
          break;
        }
        if (!Array.isArray(data?.outcomes)) {
          requestFailure = 'Edge Functionનું response account outcomes વગર આવ્યું. Supabase Functions logs તપાસો; retry કરતાં પહેલાં account સ્થિતિ verify કરો.';
          accountResultsResult.push(...batch.map((school) => ({
            schoolCode: school.code,
            schoolName: school.name,
            status: 'unknown',
            reason: 'Response ચકાસી શકાયો નથી.',
          })));
          break;
        }
        accountResultsResult.push(...data.outcomes);
        if (Array.isArray(data.created)) createdCredentialsResult.push(...data.created);
      }
    } catch (cause) {
      requestFailure = `Login account request નિષ્ફળ: ${cause.message}`;
    } finally {
      setCreatedCredentials(createdCredentialsResult);
      setAccountResults(accountResultsResult);
      const createdCount = accountResultsResult.filter((item) => item.status === 'created').length;
      const existingCount = accountResultsResult.filter((item) => item.status === 'already_exists').length;
      const failedCount = accountResultsResult.filter((item) => item.status === 'failed').length;
      const unknownCount = accountResultsResult.filter((item) => item.status === 'unknown').length;
      setMessage(
        `${createdCount} Login બન્યા; ${existingCount} પહેલેથી હતા; ${failedCount} નિષ્ફળ; ${unknownCount} સ્થિતિ અસ્પષ્ટ.`
      );
      if (requestFailure) setError(requestFailure);
      else if (failedCount) {
        setError(accountResultsResult
          .filter((item) => item.status === 'failed')
          .map((item) => `${item.schoolCode}: ${item.reason}`)
          .join('; '));
      }
      try {
        await loadSchools();
      } catch (cause) {
        setError((current) => [
          current,
          `નવી account સ્થિતિ ફરી લોડ થઈ શકી નથી: ${cause.message}`,
        ].filter(Boolean).join(' '));
      }
      setBusy(false);
    }
  }

  async function resetSchoolPassword(school) {
    if (!accounts[school.id]) {
      setError(`${school.code}: school profile મળતું નથી. Password resetથી નવું account બનાવાતું નથી.`);
      return;
    }
    if (!confirm(`${school.name} · ${school.code}નું school password reset કરવું? Reset થયા પછી હાલનો password તરત અમાન્ય થશે.`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    setResetCredential(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-school-password-reset', {
        body: { schoolId: school.id },
      });
      if (invokeError) {
        let detail = invokeError.message;
        if (invokeError.context instanceof Response) {
          const text = await invokeError.context.clone().text();
          try {
            detail = JSON.parse(text).error || text || detail;
          } catch {
            if (text) detail = text;
          }
        }
        throw new Error(detail);
      }
      if (!data?.temporaryPassword || data.schoolCode !== school.code || data.mustChangePassword !== true) {
        throw new Error(data?.resetApplied
          ? 'Password reset લાગુ થયું હોઈ શકે છે પરંતુ one-time credential response નથી. ફરી reset ન કરો; પહેલા account verify કરો.'
          : 'સફળ reset અને mandatory password-changeની પુષ્ટિ મળતી નથી; credential દર્શાવ્યો નથી.');
      }
      setResetCredential({
        schoolId: school.id,
        schoolCode: school.code,
        schoolName: school.name,
        password: data.temporaryPassword,
      });
      setMessage(`${school.code} માટે password reset સફળ. Password ફક્ત આ સત્રમાં એક વાર દેખાશે.`);
    } catch (cause) {
      setError(`${school.code} reset નિષ્ફળ/અસ્પષ્ટ: ${cause.message} ફરી પ્રયાસ કરતાં પહેલાં Auth user, profile અને audit log તપાસો.`);
    } finally {
      setBusy(false);
    }
  }

  function downloadCredentials() {
    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['School ID / Login ID', 'School Name', 'One-time Password'].map(escapeCsv).join(','),
      ...createdCredentials.map((item) => [
        item.schoolCode,
        item.schoolName,
        item.password,
      ].map(escapeCsv).join(',')),
    ];
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'school-login-credentials-once.csv';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        <h2>તાલુકાવાર શાળાઓ ({schools.length})</h2>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        {resetCredential && (
          <section className="card credential-result" aria-live="polite">
            <h3>One-time reset credential · {resetCredential.schoolName} ({resetCredential.schoolCode})</h3>
            <p className="error">આ password ફક્ત આ વખતના સત્રમાં દેખાડાય છે. સુરક્ષિત રીતે શાળાને આપો; browser/local storageમાં સાચવાતો નથી.</p>
            <p>Login ID: <b>{resetCredential.schoolCode}</b></p>
            <code>{resetCredential.password}</code>
            <button type="button" onClick={() => setResetCredential(null)}>Password છુપાવો</button>
          </section>
        )}
        <section className="card">
          <h3>શાળા Login Accounts</h3>
          <p className="muted">
            School ID જ Login ID રહેશે. દરેક account માટે અલગ one-time password બનશે અને પ્રથમ Login પછી બદલવો ફરજિયાત છે.
            Passwords emailથી મોકલાતા નથી; સુરક્ષિત રીતે સંબંધિત શાળા સુધી પહોંચાડો.
          </p>
          <button
            className="primary"
            disabled={busy || !schoolsLoaded || !schools.some((school) => school.active && !accounts[school.id])}
            onClick={() => createAccounts()}
          >
            {busy ? 'Accounts બની રહ્યા છે…' : 'બધી બાકી સક્રિય શાળાઓના Login બનાવો'}
          </button>
        </section>
        {createdCredentials.length > 0 && (
          <section className="card credential-result">
            <h3>એક વખત દર્શાવેલા Login Credentials</h3>
            <p className="error">
              Passwords ફક્ત આ વખતે દેખાડવામાં આવે છે. CSV સુરક્ષિત જગ્યાએ સાચવો અને દરેક શાળાને ફક્ત તેનું પોતાનું credential આપો.
            </p>
            <button onClick={downloadCredentials}>Credentials CSV Download</button>
            <ul className="list">
              {createdCredentials.map((item) => (
                <li key={item.schoolCode}>
                  <b>{item.schoolName} · {item.schoolCode}</b>
                  <div>Login ID: {item.schoolCode}</div>
                  <code>{item.password}</code>
                </li>
              ))}
            </ul>
          </section>
        )}
        {accountResults.length > 0 && (
          <section className="card">
            <h3>દરેક School Loginનું પરિણામ</h3>
            <ul className="list">
              {accountResults.map((item) => (
                <li key={`${item.schoolCode}-${item.status}`}>
                  <b>{item.schoolName} · {item.schoolCode}</b>
                  <div>{item.status === 'created' ? 'બન્યું' : item.status === 'already_exists' ? 'પહેલેથી છે' : item.status === 'unknown' ? 'સ્થિતિ અસ્પષ્ટ' : 'નિષ્ફળ'}</div>
                  {item.reason && <div className="error">{item.reason}</div>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <AdminStudentImport supabase={supabase} schools={schools} schoolsLoaded={schoolsLoaded} />

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
                  {!accounts[school.id] && school.active && (
                    <button disabled={busy} onClick={() => createAccounts(school.id)}>Login બનાવો</button>
                  )}
                  {accounts[school.id] && school.active && (
                    <button disabled={busy} onClick={() => resetSchoolPassword(school)}>Reset Password</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
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
