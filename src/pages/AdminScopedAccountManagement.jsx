import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildCredentialsCsv, confirmedCredential, mergeCredentials } from '../lib/accountCredentials.js';

const ACCOUNT_TYPES = [
  ['district', 'District Logins'],
  ['block', 'Block Logins'],
  ['school', 'School Logins'],
];
const PAGE_SIZE = 50;
const EMPTY_FILTERS = { district: '', block: '', school: '', status: '' };

async function functionError(error) {
  if (error?.context instanceof Response) {
    const text = await error.context.clone().text();
    let detail = text || error.message;
    try {
      const body = JSON.parse(text);
      const databaseDetail = [body.databaseCode, body.databaseMessage].filter(Boolean).join(': ');
      detail = [body.error || body.message || detail, databaseDetail].filter(Boolean).join(' Database: ');
    } catch {
      // Keep the response text when the function did not return JSON.
    }
    return `HTTP ${error.context.status}: ${detail}`;
  }
  if (error?.name === 'FunctionsFetchError') {
    return `${error.message} Edge Function સુધી network request પહોંચી નથી; function deployment અને network તપાસો. સ્થિતિ અસ્પષ્ટ હોઈ શકે છે.`;
  }
  return error?.message || 'Edge Function સુધી request પહોંચી નથી.';
}

function invalidListResponse(data) {
  if (data && typeof data === 'object' && !Array.isArray(data) && (data.error || data.message)) {
    const databaseDetail = [data.databaseCode, data.databaseMessage].filter(Boolean).join(': ');
    return `HTTP 200: ${[data.error || data.message, databaseDetail].filter(Boolean).join(' Database: ')}`;
  }
  const shape = data === null
    ? 'null'
    : Array.isArray(data)
      ? 'array'
      : typeof data === 'object'
        ? `object with keys ${Object.keys(data).join(', ') || '(none)'}`
        : `${typeof data}: ${String(data).slice(0, 300)}`;
  return `HTTP 200: Login list response shape mismatch (${shape}). Expected { accounts: [], total: non-negative integer, page, pageSize }. Check the deployed Edge Function response.`;
}

function statusLabel(status) {
  return {
    active: 'Active',
    missing: 'Missing',
    inactive: 'Inactive',
    password_change_required: 'Password Change Required',
    needs_attention: 'ધ્યાન જરૂરી · Auth/profile mismatch',
  }[status] || 'અજ્ઞાત';
}

function lastUpdated(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export default function AdminScopedAccountManagement({ supabase }) {
  const [accountType, setAccountType] = useState('district');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [accounts, setAccounts] = useState([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState({});
  const [credentials, setCredentials] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-scoped-account-management', {
        body: {
          action: 'list',
          accountType,
          filters: appliedFilters,
          page,
          pageSize: PAGE_SIZE,
        },
      });
      if (invokeError) throw new Error(await functionError(invokeError));
      if (!Array.isArray(data?.accounts) || !Number.isSafeInteger(data?.total) || data.total < 0) {
        throw new Error(invalidListResponse(data));
      }
      setAccounts(data.accounts);
      setTotal(data.total);
    } catch (cause) {
      setError(`Login યાદી લોડ ન થઈ: ${cause.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, accountType, appliedFilters, page]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    setSelected({});
  }, [accountType, page, appliedFilters]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedMissing = useMemo(() => accounts.filter((account) =>
    selected[`${account.accountType}:${account.loginId}`]
      && account.accountStatus === 'missing'
      && (account.accountType !== 'school' || account.active)), [accounts, selected]);
  const missingOnPage = accounts.filter((account) =>
    account.accountStatus === 'missing' && (account.accountType !== 'school' || account.active));

  function applyFilters(event) {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ ...filters });
  }

  function credentialFrom(account, data, action) {
    const result = confirmedCredential(account, data, action);
    if (!result) {
      throw new Error(data?.resetApplied
        ? 'Password બદલાયો હોઈ શકે છે, પરંતુ credential સાથેનો સફળ response મળ્યો નથી. ફરી reset ન કરો; Auth/profile/audit સ્થિતિ ચકાસો.'
        : 'Serverએ creation/reset અને ફરજિયાત password-changeની પુષ્ટિ આપી નથી. Credential જાહેર કરાયો નથી.');
    }
    return result;
  }

  async function createAccounts(targets) {
    if (!targets.length || busy) return;
    if (!window.confirm(`${targets.length} પસંદ કરેલા missing account માટે Login બનાવવા?`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    const generated = [];
    let uncertain = '';
    try {
      const schools = targets.filter((account) => account.accountType === 'school');
      if (schools.length) {
        const { data, error: invokeError } = await supabase.functions.invoke('create-school-account', {
          body: { schoolIds: schools.map((account) => account.schoolId) },
        });
        if (invokeError) throw new Error(await functionError(invokeError));
        if (!Array.isArray(data?.outcomes) || !Array.isArray(data?.created)) {
          throw new Error('School account outcome response અમાન્ય છે. Requestની સ્થિતિ અસ્પષ્ટ છે; ફરી પ્રયાસ ન કરો, પહેલા Auth અને profile તપાસો.');
        }
        for (const account of schools) {
          const outcome = data.outcomes.find((item) => item.schoolCode === account.loginId);
          const provisioned = data.created.find((item) => item.schoolCode === account.loginId);
          if (outcome?.status !== 'created' || !provisioned?.password) continue;
          generated.push(credentialFrom(account, {
            loginId: account.loginId,
            schoolCode: account.loginId,
            temporaryPassword: provisioned.password,
            mustChangePassword: true,
          }, 'create'));
        }
        if (data.outcomes.some((item) => item.status === 'unknown')) {
          uncertain = 'એક અથવા વધુ School Loginની સ્થિતિ અસ્પષ્ટ છે; ફરી પ્રયાસ કરતાં પહેલાં Auth અને profiles તપાસો.';
        } else if (data.outcomes.some((item) => item.status === 'already_exists')) {
          setMessage('પસંદ કરેલા એક અથવા વધુ Login પહેલેથી હાજર છે; ફરી create ન કરાયા. યાદી ફરી તપાસો.');
        }
        const failures = data.outcomes.filter((item) => item.status === 'failed');
        if (failures.length) setError(failures.map((item) => `${item.schoolCode}: ${item.reason}`).join('; '));
      }
      for (const account of targets.filter((item) => item.accountType !== 'school')) {
        try {
          const { data, error: invokeError } = await supabase.functions.invoke('create-scoped-account', {
            body: { role: account.accountType, code: account.loginId },
          });
          if (invokeError) throw new Error(await functionError(invokeError));
          generated.push(credentialFrom(account, data, 'create'));
        } catch (cause) {
          uncertain = `${account.accountType} ${account.loginId}: ${cause.message} સ્થિતિ verify કર્યા વગર ફરી પ્રયાસ ન કરો.`;
          break;
        }
      }
      if (generated.length) {
        setCredentials((current) => mergeCredentials(current, generated));
        setMessage(`${generated.length} નવા Login server દ્વારા confirm થયા. Credentials CSV તાત્કાલિક download કરો.`);
      }
      if (uncertain) setError((current) => [current, uncertain].filter(Boolean).join(' '));
      await loadAccounts();
    } catch (cause) {
      setError((current) => [current, cause.message].filter(Boolean).join(' '));
      setMessage(generated.length
        ? `${generated.length} સફળ credentials ઉપલબ્ધ છે; બાકીની requestની સ્થિતિ અસ્પષ્ટ છે.`
        : '');
      if (generated.length) setCredentials((current) => mergeCredentials(current, generated));
      await loadAccounts();
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(account) {
    if (!['active', 'password_change_required'].includes(account.accountStatus) || !account.identityConsistent) {
      setError('Account status અથવા Auth/profile consistency reset માટે યોગ્ય નથી. પહેલા Auth અને profiles તપાસો.');
      return;
    }
    if (!window.confirm(`${account.loginId}નું password reset કરવું? હાલનો password તરત અમાન્ય થશે.`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      let data;
      let invokeError;
      if (account.accountType === 'school') {
        ({ data, error: invokeError } = await supabase.functions.invoke('admin-school-password-reset', {
          body: { schoolId: account.schoolId },
        }));
      } else {
        ({ data, error: invokeError } = await supabase.functions.invoke('admin-scoped-account-management', {
          body: { action: 'reset-password', role: account.accountType, code: account.loginId },
        }));
      }
      if (invokeError) throw new Error(await functionError(invokeError));
      const credential = credentialFrom(account, data, 'reset');
      setCredentials((current) => mergeCredentials(current, [credential]));
      setMessage(`${account.loginId} reset સફળ થયો. નવી credential CSV તાત્કાલિક download કરો.`);
      await loadAccounts();
    } catch (cause) {
      setError(`${cause.message} Unknown outcome હોય તો reset ફરી ન કરો; પહેલા Auth, profile અને audit સ્થિતિ તપાસો.`);
      await loadAccounts();
    } finally {
      setBusy(false);
    }
  }

  async function copyLoginId(loginId) {
    try {
      await navigator.clipboard.writeText(loginId);
      setMessage(`Login ID ${loginId} copy થયો.`);
    } catch (cause) {
      setError(`Login ID copy ન થઈ શક્યો: ${cause.message}`);
    }
  }

  function downloadCredentials() {
    const blob = new Blob([`\uFEFF${buildCredentialsCsv(credentials)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'fln-new-login-credentials.csv';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="card scoped-account-management">
      <h2>Login &amp; Password Management</h2>
      <p className="muted">
        District, Block અને School loginsની server-filtered યાદી. Password માત્ર સફળ create/reset પછી આ સત્રમાં મળે છે; હાલના passwords વાંચી શકાતા નથી.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {credentials.length > 0 && (
        <div className="credential-result" role="status">
          <p className="error">આ CSVમાં ફક્ત આ સત્રમાં હમણાં સફળતાપૂર્વક બનાવેલા/reset કરેલા passwords છે. તેને સુરક્ષિત રાખો; આ browser storageમાં સાચવાયું નથી.</p>
          <button type="button" className="primary" onClick={downloadCredentials}>Download Credentials CSV ({credentials.length})</button>
        </div>
      )}
      <nav className="scoped-account-tabs" aria-label="Account type">
        {ACCOUNT_TYPES.map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={accountType === value ? 'on' : ''}
            onClick={() => { setPage(1); setAccountType(value); }}
          >{label}</button>
        ))}
      </nav>
      <form className="scoped-account-filters" onSubmit={applyFilters}>
        <label>District name / code
          <input value={filters.district} onChange={(event) => setFilters((current) => ({ ...current, district: event.target.value }))} />
        </label>
        {accountType !== 'district' && (
          <label>Block name / code
            <input value={filters.block} onChange={(event) => setFilters((current) => ({ ...current, block: event.target.value }))} />
          </label>
        )}
        {accountType === 'school' && (
          <label>School name / School ID
            <input value={filters.school} onChange={(event) => setFilters((current) => ({ ...current, school: event.target.value }))} />
          </label>
        )}
        <label>Account status
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">બધી સ્થિતિ</option>
            <option value="active">Active</option>
            <option value="missing">Missing</option>
            <option value="inactive">Inactive</option>
            <option value="password_change_required">Password Change Required</option>
            <option value="needs_attention">Auth/profile mismatch</option>
          </select>
        </label>
        <button className="primary" disabled={busy}>ફિલ્ટર લાગુ કરો</button>
      </form>
      {missingOnPage.length > 0 && (
        <div className="row">
          <button type="button" onClick={() => setSelected(Object.fromEntries(missingOnPage.map((account) => [
            `${account.accountType}:${account.loginId}`, true,
          ])))}>આ પાનાના બધા Missing પસંદ કરો</button>
          <button type="button" disabled={busy || !selectedMissing.length} onClick={() => createAccounts(selectedMissing)}>
            {busy ? 'કામ ચાલુ…' : `પસંદ કરેલા ${selectedMissing.length} Login બનાવો`}
          </button>
        </div>
      )}
      <div className="scroll scoped-account-table">
        <table className="report-table">
          <thead><tr>
            <th>પસંદ કરો</th><th>Account Type</th><th>District / Code</th><th>Block / Code</th>
            <th>School / ID</th><th>Login ID / Email</th><th>Status</th><th>Last Updated</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {accounts.map((account) => {
              const key = `${account.accountType}:${account.loginId}`;
              const createAllowed = account.accountStatus === 'missing'
                && (account.accountType !== 'school' || account.active);
              const resetAllowed = ['active', 'password_change_required'].includes(account.accountStatus)
                && account.identityConsistent;
              return (
                <tr key={key}>
                  <td><input
                    type="checkbox"
                    aria-label={`${account.loginId} પસંદ કરો`}
                    disabled={!createAllowed || busy}
                    checked={Boolean(selected[key])}
                    onChange={(event) => setSelected((current) => ({ ...current, [key]: event.target.checked }))}
                  /></td>
                  <td>{account.accountType}</td>
                  <td>{account.districtName || '—'} · {account.districtCode || '—'}</td>
                  <td>{account.blockName ? `${account.blockName} · ${account.blockCode}` : '—'}</td>
                  <td>{account.schoolName ? `${account.schoolName} · ${account.loginId}` : '—'}</td>
                  <td>{account.loginId}<br /><small>{account.email}</small></td>
                  <td>{statusLabel(account.accountStatus)}</td>
                  <td>{lastUpdated(account.lastUpdated)}</td>
                  <td className="scoped-account-actions">
                    {createAllowed
                      ? <button type="button" disabled={busy} onClick={() => createAccounts([account])}>Create Login</button>
                      : <button type="button" disabled={busy || !resetAllowed} onClick={() => resetPassword(account)}>Reset Password</button>}
                    <button type="button" disabled={busy} onClick={() => copyLoginId(account.loginId)}>Copy Login ID</button>
                  </td>
                </tr>
              );
            })}
            {!loading && accounts.length === 0 && <tr><td colSpan="9">આ filters માટે કોઈ account મળ્યો નથી.</td></tr>}
          </tbody>
        </table>
      </div>
      {loading && <p role="status">Account યાદી લોડ થઈ રહી છે…</p>}
      <div className="row between">
        <button type="button" disabled={loading || busy || page <= 1} onClick={() => setPage((current) => current - 1)}>પાછળનું પાનું</button>
        <span className="muted">કુલ {total.toLocaleString()} · પાનું {page}/{pageCount} (દરેક પાનામાં {PAGE_SIZE})</span>
        <button type="button" disabled={loading || busy || page >= pageCount} onClick={() => setPage((current) => current + 1)}>આગળનું પાનું</button>
      </div>
    </section>
  );
}
