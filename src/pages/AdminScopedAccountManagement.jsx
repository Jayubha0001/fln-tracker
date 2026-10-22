import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from '@e965/xlsx';
import { buildCredentialsWorkbook, accountOperationResult, confirmedCredential } from '../lib/accountCredentials.js';
import { accountTypesForRole } from '../lib/accountManagement.js';
import { invokeAuthenticatedFunction } from '../lib/invokeAuthenticatedFunction.js';
import { accountResetRequest, canResetAccount } from '../lib/accountResetRequest.js';
import SchoolYearReportButton from '../components/SchoolYearReportButton.jsx';

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

function validListResponse(data, page, pageSize) {
  return data
    && typeof data === 'object'
    && !Array.isArray(data)
    && Array.isArray(data.accounts)
    && Number.isSafeInteger(data.total)
    && data.total >= 0
    && data.page === page
    && data.pageSize === pageSize;
}

function operationStatus(status, action) {
  if (status === 'unknown') return `${action} outcome unknown`;
  if (status === 'failed') return `${action} failed`;
  return `${action} not confirmed`;
}

function resetOutcomeUnknown(message) {
  if (message.includes('Password બદલાયો હોઈ શકે છે') || message.includes('outcomeUnknown')) return true;
  if (message.includes('Auth password reset નિષ્ફળ થયું')) return false;
  const status = Number(message.match(/HTTP (\d{3})/)?.[1]);
  return !status || (status >= 500 && status !== 503);
}

export default function AdminScopedAccountManagement({
  supabase,
  profile,
  initialAccountType = 'district',
  onCredentialsVisibilityChange,
}) {
  const [accountType, setAccountType] = useState(initialAccountType);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [accounts, setAccounts] = useState([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState({});
  const [credentials, setCredentials] = useState([]);
  const [editingSchool, setEditingSchool] = useState(null);
  const [schoolForm, setSchoolForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadAccounts = useCallback(async ({ preserveError = false } = {}) => {
    setLoading(true);
    if (!preserveError) setError('');
    try {
      const { data, error: invokeError } = await invokeAuthenticatedFunction(supabase, 'admin-scoped-account-management', {
        body: {
          action: 'list',
          accountType,
          filters: appliedFilters,
          page,
          pageSize: PAGE_SIZE,
        },
      });
      if (invokeError) throw new Error(await functionError(invokeError));
      if (!validListResponse(data, page, PAGE_SIZE)) throw new Error(invalidListResponse(data));
      setAccounts(data.accounts);
      setTotal(data.total);
    } catch (cause) {
      setError((current) => [
        preserveError ? current : '',
        `Login યાદી લોડ ન થઈ: ${cause.message}`,
      ].filter(Boolean).join(' '));
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

  useEffect(() => {
    onCredentialsVisibilityChange?.(credentials.some((result) => result.temporaryPassword));
  }, [credentials, onCredentialsVisibilityChange]);

  useEffect(() => () => onCredentialsVisibilityChange?.(false), [onCredentialsVisibilityChange]);

  useEffect(() => {
    if (!credentials.some((result) => result.temporaryPassword)) return undefined;
    function warnBeforeClose(event) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeClose);
    return () => window.removeEventListener('beforeunload', warnBeforeClose);
  }, [credentials]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedAccounts = useMemo(() => accounts.filter((account) =>
    selected[`${account.accountType}:${account.loginId}`]), [accounts, selected]);
  const selectedMissing = selectedAccounts.filter((account) =>
    account.accountStatus === 'missing' && (account.accountType !== 'school' || account.active));
  const selectedResettable = selectedAccounts.filter(canResetAccount);
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

  function recordFailure(account, action, cause, outcomeUnknown = false) {
    return {
      result: accountOperationResult(account, '', operationStatus(outcomeUnknown ? 'unknown' : 'failed', action)),
      message: `${account.loginId}: ${cause}`,
    };
  }

  async function createAccounts(targets) {
    if (!targets.length || busy) return;
    if (!window.confirm(`${targets.length} પસંદ કરેલા missing account માટે Login બનાવવા?`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    setCredentials([]);
    const results = [];
    const failures = [];
    try {
      const allSchools = targets.filter((account) => account.accountType === 'school');
      for (let start = 0; start < allSchools.length; start += 50) {
        const schools = allSchools.slice(start, start + 50);
        try {
          const { data, error: invokeError } = await invokeAuthenticatedFunction(supabase, 'create-school-account', {
            body: { schoolIds: schools.map((account) => account.schoolId) },
          });
          if (invokeError) throw new Error(await functionError(invokeError));
          if (!Array.isArray(data?.outcomes) || !Array.isArray(data?.created)) {
            throw new Error('School account outcome response અમાન્ય છે; requestની સ્થિતિ અસ્પષ્ટ છે.');
          }
          for (const account of schools) {
            const outcome = data.outcomes.find((item) => item.schoolCode === account.loginId);
            const provisioned = data.created.find((item) => item.schoolCode === account.loginId);
            if (outcome?.status === 'created' && typeof provisioned?.password === 'string' && provisioned.password) {
              try {
                results.push(credentialFrom(account, {
                  loginId: account.loginId,
                  schoolCode: account.loginId,
                  temporaryPassword: provisioned.password,
                  mustChangePassword: true,
                }, 'create'));
              } catch (cause) {
                const failure = recordFailure(account, 'Creation', cause.message, true);
                results.push(failure.result);
                failures.push(failure.message);
              }
            } else {
              const unknown = outcome?.status === 'unknown';
              const detail = outcome?.reason || (outcome?.status === 'already_exists'
                ? 'Login પહેલેથી હાજર છે.'
                : 'Serverએ creation સફળ ગણાવી નથી.');
              const failure = recordFailure(account, 'Creation', detail, unknown);
              results.push(failure.result);
              if (outcome?.status !== 'already_exists') failures.push(failure.message);
            }
          }
        } catch (cause) {
          for (const account of schools) {
            const failure = recordFailure(account, 'Creation', cause.message, true);
            results.push(failure.result);
            failures.push(failure.message);
          }
        }
      }

      for (const account of targets.filter((item) => item.accountType !== 'school')) {
        try {
          const { data, error: invokeError } = await invokeAuthenticatedFunction(supabase, 'create-scoped-account', {
            body: { role: account.accountType, code: account.loginId },
          });
          if (invokeError) throw new Error(await functionError(invokeError));
          results.push(credentialFrom(account, data, 'create'));
        } catch (cause) {
          const failure = recordFailure(account, 'Creation', cause.message, true);
          results.push(failure.result);
          failures.push(failure.message);
        }
      }

      setCredentials(results);
      const successes = results.filter((result) => result.temporaryPassword).length;
      if (successes) setMessage(`${successes} નવા Login server દ્વારા confirm થયા.`);
      if (failures.length) setError(failures.join('; '));
      await loadAccounts({ preserveError: true });
    } finally {
      setBusy(false);
    }
  }

  // Ek sathe badha Missing Login: badha pana vanchi (current filters), pachhi 50-50 ni batch ma banave.
  async function createAllMissing() {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    const missing = [];
    try {
      for (let pageNumber = 1; pageNumber <= 200; pageNumber += 1) {
        const { data, error: invokeError } = await invokeAuthenticatedFunction(supabase, 'admin-scoped-account-management', {
          body: { action: 'list', accountType, filters: { ...appliedFilters, status: 'missing' }, page: pageNumber, pageSize: PAGE_SIZE },
        });
        if (invokeError) throw new Error(await functionError(invokeError));
        if (!validListResponse(data, pageNumber, PAGE_SIZE)) throw new Error(invalidListResponse(data));
        missing.push(...data.accounts.filter((account) => account.accountStatus === 'missing'
          && (account.accountType !== 'school' || account.active)));
        if (pageNumber * PAGE_SIZE >= data.total) break;
      }
    } catch (cause) {
      setError(`Missing યાદી લોડ ન થઈ: ${cause.message}`);
      setBusy(false);
      return;
    }
    setBusy(false);
    if (!missing.length) {
      setMessage('કોઈ Missing Login બાકી નથી. ✔');
      return;
    }
    await createAccounts(missing);
  }

  async function resetPasswords(targets) {
    if (!targets.length || busy) return;
    const targetLabels = targets.map((account) => `${account.accountType} ${account.loginId}`).join(', ');
    if (!window.confirm(`${targetLabels}નું password reset કરવું? ${targets.length > 1 ? 'ફક્ત ઉપર દર્શાવેલા પસંદ કરેલા accounts reset થશે.' : 'હાલનો password તરત અમાન્ય થશે.'}`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    setCredentials([]);
    const results = [];
    const failures = [];
    try {
      for (const account of targets) {
        try {
          const request = accountResetRequest(account);
          const { data, error: invokeError } = await invokeAuthenticatedFunction(
            supabase,
            request.functionName,
            { body: request.body },
          );
          if (invokeError) throw new Error(await functionError(invokeError));
          results.push(credentialFrom(account, data, 'reset'));
        } catch (cause) {
          const failure = recordFailure(account, 'Reset', cause.message, resetOutcomeUnknown(cause.message));
          results.push(failure.result);
          failures.push(failure.message);
        }
      }
      setCredentials(results);
      const successes = results.filter((result) => result.temporaryPassword).length;
      if (successes) setMessage(`${successes} password reset Supabase દ્વારા confirm થયા.`);
      if (failures.length) setError(failures.join('; '));
      await loadAccounts({ preserveError: true });
    } finally {
      setBusy(false);
    }
  }

  async function copyText(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copy થયું.`);
    } catch (cause) {
      setError(`${label} copy ન થઈ શક્યું: ${cause.message}`);
    }
  }

  function downloadCredentials() {
    try {
      const workbook = buildCredentialsWorkbook(credentials);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      XLSX.writeFile(workbook, `fln-credentials-${timestamp}.xlsx`);
    } catch (cause) {
      setError(`Excel file બનાવી શકાઈ નથી: ${cause.message}`);
    }
  }

  function closeCredentials() {
    if (credentials.some((result) => result.temporaryPassword)
      && !window.confirm('One-time credentials panel બંધ કરશો? ત્યારબાદ આ passwords ફરી જોઈ શકાશે નહીં. ખાતરી કરો કે copy/download કરી લીધું છે.')) return;
    setCredentials([]);
    setMessage('');
  }

  async function editSchool(account) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const { data, error: queryError } = await supabase.from('schools')
        .select('id, district, block, cluster, code, name, active')
        .eq('id', account.schoolId)
        .maybeSingle();
      if (queryError) throw queryError;
      if (!data) throw new Error('શાળા record મળી નથી.');
      setEditingSchool(data);
      setSchoolForm({
        district: data.district || '',
        block: data.block || '',
        cluster: data.cluster || '',
        name: data.name || '',
        active: data.active === true,
      });
    } catch (cause) {
      setError(`શાળાની વિગતો લોડ થઈ શકી નથી: ${cause.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveSchool(event) {
    event.preventDefault();
    if (!editingSchool || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data, error: updateError } = await supabase.from('schools')
        .update({
          district: schoolForm.district.trim(),
          block: schoolForm.block.trim(),
          cluster: schoolForm.cluster.trim(),
          name: schoolForm.name.trim(),
          active: schoolForm.active,
        })
        .eq('id', editingSchool.id)
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!data) throw new Error('કોઈ શાળા record અપડેટ થયું નથી.');
      setEditingSchool(null);
      setSchoolForm(null);
      setMessage('શાળાની વિગતો અપડેટ થઈ. School ID અને સંબંધિત student/entry records બદલાયા નથી.');
      await loadAccounts();
    } catch (cause) {
      setError(`શાળાની વિગતો અપડેટ થઈ શકી નથી: ${cause.message}`);
    } finally {
      setBusy(false);
    }
  }

  const successfulCredentials = credentials.filter((result) => result.temporaryPassword);
  const accountTypes = accountTypesForRole(profile?.role);

  return (
    <section className="card scoped-account-management">
      <h2>Login &amp; Password Management</h2>
      <p className="muted">
        District, Block અને School accounts એક જ જગ્યાએ સંચાલિત કરો. Temporary password ફક્ત પુષ્ટિ થયેલા create/reset responseમાં મળે છે અને આ પેજની memoryમાં જ રહે છે.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {credentials.length > 0 && (
        <div className="credential-result" role="status">
          <h3>Operation results{successfulCredentials.length ? ' — one-time credentials' : ''}</h3>
          <p className="error">Passwords ફક્ત સફળતાપૂર્વક પુષ્ટિ થયેલા accounts માટે દર્શાવાય છે. આ પેજની memoryમાં જ રાખવામાં આવે છે; panel બંધ કરતાં પહેલાં copy અથવા download કરો.</p>
          <div className="scroll">
            <table className="report-table">
              <thead><tr><th>Account Type</th><th>Login ID</th><th>Reset status</th><th>Temporary Password</th><th>Actions</th></tr></thead>
              <tbody>{credentials.map((result) => (
                <tr key={`${result.accountType}:${result.loginId}`}>
                  <td>{result.accountType}</td>
                  <td>{result.loginId}</td>
                  <td>{result.status}</td>
                  <td>{result.temporaryPassword ? <code>{result.temporaryPassword}</code> : '—'}</td>
                  <td>
                    <button type="button" onClick={() => copyText(result.loginId, 'Login ID')}>Copy Login ID</button>
                    {result.temporaryPassword && <button type="button" onClick={() => copyText(result.temporaryPassword, 'Password')}>Copy Password</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {successfulCredentials.some((result) => result.passwordMode === 'shared-configured') && (
            <p className="error">ચેતવણી: Server પર shared temporary password configure છે. તેને બધા accounts માટે વાપરવાથી ગંભીર જોખમ છે; દરેક userએ તરત password બદલવો જરૂરી છે.</p>
          )}
          {credentials.some((result) => !result.temporaryPassword) && (
            <p className="muted">
              {credentials.filter((result) => !result.temporaryPassword).map((result) =>
                `${result.loginId}: ${result.status}`).join(' · ')}
            </p>
          )}
          <div className="row">
            <button type="button" className="primary" onClick={downloadCredentials}>
              {successfulCredentials.length ? 'Download Credentials Excel' : 'Download Results Excel'}
            </button>
            <button type="button" onClick={closeCredentials}>Close one-time credentials</button>
          </div>
        </div>
      )}
      <nav className="scoped-account-tabs" aria-label="Account type">
        {accountTypes.map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={accountType === value ? 'on' : ''}
            aria-selected={accountType === value}
            onClick={() => { setPage(1); setAccountType(value); }}
          >{label}</button>
        ))}
      </nav>
      <form className="scoped-account-filters" onSubmit={applyFilters}>
        {profile?.role === 'admin'
          ? <label>District name / code
            <input value={filters.district} onChange={(event) => setFilters((current) => ({ ...current, district: event.target.value }))} />
          </label>
          : <label>જિલ્લા scope
            <input value={profile?.district_code || ''} readOnly />
          </label>}
        {accountType !== 'district' && (
          <label>Block name / code
            {profile?.role === 'block'
              ? <input value={profile.block_code || ''} readOnly />
              : <input value={filters.block} onChange={(event) => setFilters((current) => ({ ...current, block: event.target.value }))} />}
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
        <button type="submit" className="primary filter-submit" disabled={busy}>ફિલ્ટર લાગુ કરો</button>
      </form>
      {(!appliedFilters.status || appliedFilters.status === 'missing') && (
        <div className="row bulk-create-row">
          <button type="button" className="primary" disabled={busy || loading} onClick={createAllMissing}>
            ⚡ બધા Missing Login એક સાથે બનાવો
          </button>
          <span className="muted">ફિલ્ટર મુજબ બધા પાનાના Missing accounts 50-50 ની batch માં બનશે; અંતે Excel download કરો.</span>
        </div>
      )}
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
      {selectedResettable.length > 0 && (
        <div className="row">
          <button type="button" disabled={busy} onClick={() => resetPasswords(selectedResettable)}>
            પસંદ કરેલા {selectedResettable.length} accountનું bulk reset
          </button>
        </div>
      )}
      <div className="scroll scoped-account-table">
        <table className="report-table">
          <thead><tr>
            <th>પસંદ કરો</th><th>Account Type</th><th>District / Code</th><th>Block / Code</th>
            <th>School / ID</th><th>Login ID</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {accounts.map((account) => {
              const key = `${account.accountType}:${account.loginId}`;
              const createAllowed = account.accountStatus === 'missing'
                && (account.accountType !== 'school' || account.active);
              const resetAllowed = canResetAccount(account);
              const school = account.accountType === 'school' ? {
                id: account.schoolId,
                code: account.loginId,
                name: account.schoolName,
                district: account.districtName,
                block: account.blockName,
                active: account.active,
              } : null;
              return (
                <tr key={key} className={account.accountType === 'school' ? 'school-account-row' : undefined}>
                  <td><input
                    type="checkbox"
                    aria-label={`${account.loginId} પસંદ કરો`}
                    disabled={busy || (!createAllowed && !resetAllowed)}
                    checked={Boolean(selected[key])}
                    onChange={(event) => setSelected((current) => ({ ...current, [key]: event.target.checked }))}
                  /></td>
                  <td>{account.accountType}</td>
                  <td className="nowrap">{account.districtName || '—'} · {account.districtCode || '—'}</td>
                  <td className="nowrap">{account.blockName ? `${account.blockName} · ${account.blockCode}` : '—'}</td>
                  <td className="scoped-school-identity" title={account.schoolName || ''}>{account.schoolName ? `${account.schoolName} · ${account.loginId}` : '—'}</td>
                  <td>{account.loginId}</td>
                  <td className={`scoped-account-actions ${account.accountType === 'school' ? 'school-account-actions' : ''}`}>
                    {createAllowed
                      ? <button type="button" className="act-create" disabled={busy} onClick={() => createAccounts([account])}>Create Login</button>
                      : <button type="button" className="act-reset" disabled={busy || !resetAllowed} onClick={() => resetPasswords([account])}>Reset Password</button>}
                    <button type="button" className="act-copy" disabled={busy} onClick={() => copyText(account.loginId, 'Login ID')}>Copy Login ID</button>
                    {account.accountType === 'school' && (
                      <>
                        {profile?.role === 'admin' && (
                          <button type="button" className="act-edit" disabled={busy} onClick={() => editSchool(account)}>Edit School Details</button>
                        )}
                        <SchoolYearReportButton supabase={supabase} school={school} />
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && accounts.length === 0 && <tr><td colSpan="7">આ filters માટે કોઈ account મળ્યો નથી.</td></tr>}
          </tbody>
        </table>
      </div>
      {loading && <p role="status">Account યાદી લોડ થઈ રહી છે…</p>}
      <div className="row between">
        <button type="button" disabled={loading || busy || page <= 1} onClick={() => setPage((current) => current - 1)}>પાછળનું પાનું</button>
        <span className="muted">કુલ {total.toLocaleString()} · પાનું {page}/{pageCount} (દરેક પાનામાં {PAGE_SIZE})</span>
        <button type="button" disabled={loading || busy || page >= pageCount} onClick={() => setPage((current) => current + 1)}>આગળનું પાનું</button>
      </div>
      {editingSchool && schoolForm && (
        <form className="card scoped-school-edit" onSubmit={saveSchool}>
          <h3>Edit School Details — {editingSchool.name}</h3>
          <p className="muted">School ID is read-only. Student and entry relationships are preserved.</p>
          <label>School ID<input value={editingSchool.code} readOnly /></label>
          <label>District<input required value={schoolForm.district} onChange={(event) => setSchoolForm((current) => ({ ...current, district: event.target.value }))} /></label>
          <label>Block<input required value={schoolForm.block} onChange={(event) => setSchoolForm((current) => ({ ...current, block: event.target.value }))} /></label>
          <label>Cluster<input value={schoolForm.cluster} onChange={(event) => setSchoolForm((current) => ({ ...current, cluster: event.target.value }))} /></label>
          <label>School name<input required value={schoolForm.name} onChange={(event) => setSchoolForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="check-label">
            <input type="checkbox" checked={schoolForm.active} onChange={(event) => setSchoolForm((current) => ({ ...current, active: event.target.checked }))} />
            Active
          </label>
          <div className="row">
            <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save School Details'}</button>
            <button type="button" disabled={busy} onClick={() => { setEditingSchool(null); setSchoolForm(null); }}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
