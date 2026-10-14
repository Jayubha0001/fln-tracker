import { useEffect, useMemo, useState } from 'react';

const FUNCTION_NAME = 'admin-scoped-account-management';

async function functionError(error) {
  if (error?.context instanceof Response) {
    const text = await error.context.clone().text();
    try {
      const body = JSON.parse(text);
      return `HTTP ${error.context.status}: ${body.error || body.message || text}`;
    } catch {
      return `HTTP ${error.context.status}: ${text || error.message}`;
    }
  }
  return error?.message || 'Edge Function સુધી request પહોંચી નથી.';
}

function statusLabel(account) {
  if (account.identityConsistent === false) return 'ધ્યાન જરૂરી · Auth/profile mismatch';
  if (account.accountStatus === 'missing') return 'Login નથી';
  if (account.accountStatus === 'needs_attention') return 'ધ્યાન જરૂરી · Auth/profile તપાસો';
  if (account.accountStatus === 'inactive') return 'નિષ્ક્રિય';
  if (account.accountStatus === 'password_change_required') return 'Password બદલવો બાકી';
  return 'સક્રિય';
}

function lastUpdated(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export default function AdminScopedAccountManagement({ supabase }) {
  const [tab, setTab] = useState('district');
  const [districts, setDistricts] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [credential, setCredential] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busyCode, setBusyCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadAccounts(preserveError = false) {
    setLoading(true);
    if (!preserveError) setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: { action: 'list' },
      });
      if (invokeError) throw new Error(await functionError(invokeError));
      if (!Array.isArray(data?.districts) || !Array.isArray(data?.blocks)) {
        throw new Error('Functionનું account-list response માન્ય નથી.');
      }
      setDistricts(data.districts);
      setBlocks(data.blocks);
    } catch (cause) {
      const loadError = `District/Block accounts લોડ ન થઈ શક્યા: ${cause.message}`;
      setError((current) => preserveError && current ? `${current} ${loadError}` : loadError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, [supabase]);

  const visibleDistricts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return districts.filter((account) => !term
      || [account.districtName, account.districtCode, account.loginId]
        .some((value) => String(value || '').toLocaleLowerCase().includes(term)));
  }, [districts, search]);

  const visibleBlocks = useMemo(() => blocks.filter((account) => (
    (!districtFilter || account.districtCode === districtFilter)
    && (!blockFilter || account.blockCode === blockFilter)
    && (!statusFilter || account.accountStatus === statusFilter)
  )), [blocks, districtFilter, blockFilter, statusFilter]);

  const blockOptions = useMemo(() => blocks.filter((account) => (
    !districtFilter || account.districtCode === districtFilter
  )), [blocks, districtFilter]);

  async function createAccount(account, role) {
    const code = role === 'district' ? account.districtCode : account.blockCode;
    const scopeName = role === 'district'
      ? `${account.districtName} · ${code}`
      : `${account.districtName} › ${account.blockName} · ${code}`;
    if (!window.confirm(`${scopeName} માટે નવું ${role === 'district' ? 'District' : 'Block'} login બનાવવું?`)) return;
    setBusyCode(`${role}:${code}`);
    setError('');
    setMessage('');
    setCredential(null);
    setCopied(false);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-scoped-account', {
        body: { role, code },
      });
      if (invokeError) throw new Error(await functionError(invokeError));
      if (!data?.temporaryPassword || data.role !== role || data.loginId !== code || data.mustChangePassword !== true) {
        if (data?.exists || data?.code === 'AUTH_USER_EXISTS_OR_CONFLICT') {
          throw new Error('Auth user અથવા profile પહેલેથી હોઈ શકે છે. આ status અસ્પષ્ટ છે; Auth Users અને profiles ચકાસી reconcile કર્યા વગર ફરી પ્રયાસ ન કરો.');
        }
        throw new Error(data?.error || 'સફળ account creation અને first-login password changeની પુષ્ટિ મળી નથી.');
      }
      setCredential({ role, code, password: data.temporaryPassword, scopeName });
      setMessage(`${scopeName} માટે login બન્યું. Temporary password ફક્ત આ વખતના સત્રમાં દેખાશે.`);
      await loadAccounts();
    } catch (cause) {
      setError(`${scopeName} login બનાવવામાં નિષ્ફળ/અસ્પષ્ટ: ${cause.message}`);
      await loadAccounts(true);
    } finally {
      setBusyCode('');
    }
  }

  async function resetPassword(account, role) {
    const code = role === 'district' ? account.districtCode : account.blockCode;
    const scopeName = role === 'district'
      ? `${account.districtName} · ${code}`
      : `${account.districtName} › ${account.blockName} · ${code}`;
    if (account.accountStatus === 'missing') {
      setError(`${scopeName}: account profile મળ્યું નથી. Resetથી નવું account બનતું નથી; Create Login પસંદ કરો.`);
      return;
    }
    if (account.accountStatus === 'needs_attention' || account.identityConsistent === false) {
      setError(`${scopeName}: Auth user/profile consistencyમાં સમસ્યા છે. Password reset પહેલાં Supabase Auth અને profiles તપાસો.`);
      return;
    }
    if (!window.confirm(`${scopeName}નું temporary password reset કરવું? હાલનો password તરત અમાન્ય થશે.`)) return;
    setBusyCode(`${role}:${code}`);
    setError('');
    setMessage('');
    setCredential(null);
    setCopied(false);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: { action: 'reset-password', role, code },
      });
      if (invokeError) throw new Error(await functionError(invokeError));
      if (!data?.temporaryPassword || data.role !== role || data.loginId !== code || data.mustChangePassword !== true) {
        throw new Error(data?.resetApplied
          ? 'Password reset લાગુ થયું હોઈ શકે, પરંતુ one-time credentialની પુષ્ટિ નથી. ફરી reset ન કરો; Auth/profile/audit સ્થિતિ તપાસો.'
          : data?.error || 'Password resetની પુષ્ટિ મળતી નથી.');
      }
      setCredential({ role, code, password: data.temporaryPassword, scopeName });
      setMessage(`${scopeName}નું password reset સફળ. નવું password એક જ વખત દેખાડવામાં આવે છે.`);
      await loadAccounts();
    } catch (cause) {
      setError(`${scopeName} password reset નિષ્ફળ/અસ્પષ્ટ: ${cause.message} ફરી પ્રયાસ કરતાં પહેલાં Auth અને profiles તપાસો.`);
      await loadAccounts(true);
    } finally {
      setBusyCode('');
    }
  }

  async function copyCredential() {
    try {
      await navigator.clipboard.writeText(credential.password);
      setCopied(true);
      setMessage('Temporary password clipboardમાં copy થયું. તેને સુરક્ષિત રીતે આપો.');
    } catch (cause) {
      setError(`Copy થઈ શક્યું નથી: ${cause.message}. Password પસંદ કરીને manually copy કરો.`);
    }
  }

  return (
    <section className="card scoped-account-management">
      <h3>District અને Block Login Management</h3>
      <p className="muted">
        Account status Auth user અને profile સરખાવીને બતાવાય છે. Temporary password database કે browser storageમાં સાચવાતો નથી.
        Reset થયેલો password આગળના login પર બદલવો ફરજિયાત છે.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {credential && (
        <div className="card credential-result" aria-live="polite">
          <b>{credential.scopeName} · Login ID: {credential.code}</b>
          <p className="error">આ temporary password માત્ર આ વખતના સત્રમાં દેખાશે. સુરક્ષિત રીતે સંબંધિત વિસ્તારના અધિકારીને આપો.</p>
          <code>{credential.password}</code>
          <button type="button" onClick={copyCredential}>{copied ? 'Copied' : 'Copy'}</button>
          <button type="button" onClick={() => { setCredential(null); setCopied(false); }}>Password છુપાવો</button>
        </div>
      )}
      <nav className="scoped-account-tabs" aria-label="District અને Block accounts">
        <button className={tab === 'district' ? 'on' : ''} onClick={() => setTab('district')}>District Logins ({districts.length})</button>
        <button className={tab === 'block' ? 'on' : ''} onClick={() => setTab('block')}>Block Logins ({blocks.length})</button>
      </nav>
      {tab === 'district' && (
        <>
          <label className="scoped-search">District Name / Code / Login ID શોધો
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <div className="scroll scoped-account-table">
            <table className="report-table">
              <thead><tr><th>District Name</th><th>District Code</th><th>Login ID</th><th>Account Status</th><th>Last Updated</th><th>Actions</th></tr></thead>
              <tbody>
                {visibleDistricts.map((account) => (
                  <tr key={account.districtCode}>
                    <td>{account.districtName || '—'}</td><td>{account.districtCode}</td><td>{account.loginId}</td>
                    <td>{statusLabel(account)}{account.mustChangePassword ? ' · ફરજિયાત password change' : ''}</td>
                    <td>{lastUpdated(account.lastUpdated)}</td>
                    <td className="scoped-account-actions">
                      {account.accountStatus === 'missing'
                        ? <button disabled={Boolean(busyCode)} onClick={() => createAccount(account, 'district')}>Create Login</button>
                        : <button disabled={Boolean(busyCode) || account.identityConsistent === false || !['active', 'password_change_required'].includes(account.accountStatus)} onClick={() => resetPassword(account, 'district')}>Reset Password</button>}
                      {busyCode === `district:${account.districtCode}` && <span role="status">કામ ચાલુ…</span>}
                    </td>
                  </tr>
                ))}
                {!loading && visibleDistricts.length === 0 && <tr><td colSpan="6">શોધ માટે કોઈ District મળ્યો નથી.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'block' && (
        <>
          <div className="scoped-account-filters">
            <label>District
              <select value={districtFilter} onChange={(event) => { setDistrictFilter(event.target.value); setBlockFilter(''); }}>
                <option value="">બધા District</option>
                {districts.map((account) => <option key={account.districtCode} value={account.districtCode}>{account.districtName || account.districtCode} · {account.districtCode}</option>)}
              </select>
            </label>
            <label>Block
              <select value={blockFilter} onChange={(event) => setBlockFilter(event.target.value)}>
                <option value="">બધા Block</option>
                {blockOptions.map((account) => <option key={account.blockCode} value={account.blockCode}>{account.blockName || account.blockCode} · {account.blockCode}</option>)}
              </select>
            </label>
            <label>Account Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">બધી સ્થિતિ</option>
                <option value="active">સક્રિય</option>
                <option value="password_change_required">Password બદલવો બાકી</option>
                <option value="inactive">નિષ્ક્રિય</option>
                <option value="needs_attention">ધ્યાન જરૂરી</option>
                <option value="missing">Login નથી</option>
              </select>
            </label>
          </div>
          <div className="scroll scoped-account-table">
            <table className="report-table">
              <thead><tr><th>District Name</th><th>Block Name</th><th>District Code</th><th>Block Code</th><th>Login ID</th><th>Account Status</th><th>Last Updated</th><th>Actions</th></tr></thead>
              <tbody>
                {visibleBlocks.map((account) => (
                  <tr key={account.blockCode}>
                    <td>{account.districtName || '—'}</td><td>{account.blockName || '—'}</td>
                    <td>{account.districtCode}</td><td>{account.blockCode}</td><td>{account.loginId}</td>
                    <td>{statusLabel(account)}{account.mustChangePassword ? ' · ફરજિયાત password change' : ''}</td>
                    <td>{lastUpdated(account.lastUpdated)}</td>
                    <td className="scoped-account-actions">
                      {account.accountStatus === 'missing'
                        ? <button disabled={Boolean(busyCode)} onClick={() => createAccount(account, 'block')}>Create Login</button>
                        : <button disabled={Boolean(busyCode) || account.identityConsistent === false || !['active', 'password_change_required'].includes(account.accountStatus)} onClick={() => resetPassword(account, 'block')}>Reset Password</button>}
                      {busyCode === `block:${account.blockCode}` && <span role="status">કામ ચાલુ…</span>}
                    </td>
                  </tr>
                ))}
                {!loading && visibleBlocks.length === 0 && <tr><td colSpan="8">ફિલ્ટર માટે કોઈ Block મળ્યો નથી.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {loading && <p role="status">District/Block accounts લોડ થઈ રહ્યા છે…</p>}
      {!loading && <button type="button" onClick={loadAccounts}>યાદી ફરી લોડ કરો</button>}
    </section>
  );
}
