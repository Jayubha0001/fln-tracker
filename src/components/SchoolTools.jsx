import { useEffect, useRef, useState } from 'react';
import { invokeAuthenticatedFunction } from '../lib/invokeAuthenticatedFunction.js';
import AdminSchoolImport from '../pages/AdminSchoolImport.jsx';

async function functionError(error) {
  try {
    const body = await error.context?.json?.();
    if (body?.error) return body.error;
  } catch { /* fall through */ }
  return error?.message || 'વિનંતી નિષ્ફળ.';
}

const emptyForm = { code: '', name: '', cluster: '' };
const RESULT_LIMIT = 20;

function Panel({ icon, title, hint, children }) {
  return (
    <details className="tool">
      <summary>
        <span className="tool-ico" aria-hidden="true">{icon}</span>
        <b>{title}</b>
        <small>{hint}</small>
        <i className="tool-chev" aria-hidden="true">⌄</i>
      </summary>
      <div className="tool-body">{children}</div>
    </details>
  );
}

// Search a school by name / code, then remove (deactivate) it from the result list.
// admin: direct update (Admin RLS), can also restore. district/block: Edge Function, scope enforced on server.
export function SchoolRemovePanel({ supabase, viaFunction, onChanged }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const query = term.replace(/[%,()*\\]/g, ' ').trim();
    if (query.length < 2) {
      setResults(null);
      return undefined;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      setError('');
      const { data, error: searchError } = await supabase.from('schools')
        .select('id,code,name,district,block,active')
        .or(`name.ilike.%${query}%,code.ilike.%${query}%`)
        .order('name').order('code')
        .limit(RESULT_LIMIT + 1);
      if (id !== requestId.current) return;
      setSearching(false);
      if (searchError) {
        setError(`શોધ નિષ્ફળ: ${searchError.message}`);
        setResults([]);
      } else {
        setResults(data || []);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [supabase, term, refresh]);

  async function change(school, active) {
    const label = `${school.name} (${school.code})`;
    if (!active && !window.confirm(`“${label}” કાઢી નાખશો?\n\nશાળા નિષ્ક્રિય થશે અને યાદીમાંથી દૂર થશે. વિદ્યાર્થી અને એન્ટ્રી ડેટા સુરક્ષિત રહે છે.`)) return;
    setBusyId(school.id);
    setMessage('');
    setError('');
    try {
      if (viaFunction) {
        const { error: invokeError } = await invokeAuthenticatedFunction(supabase, 'scoped-school-management', {
          body: { action: active ? 'activate' : 'deactivate', schoolId: school.id },
        });
        if (invokeError) throw new Error(await functionError(invokeError));
      } else {
        const { error: updateError } = await supabase.from('schools').update({ active }).eq('id', school.id);
        if (updateError) throw updateError;
      }
      setMessage(active ? `“${label}” પાછી ચાલુ કરી.` : `“${label}” કાઢી નાખી (નિષ્ક્રિય).`);
      setRefresh((value) => value + 1);
      await onChanged?.();
    } catch (cause) {
      setError(`ફેરફાર થઈ શક્યો નથી: ${cause.message}`);
    } finally {
      setBusyId('');
    }
  }

  const shown = (results || []).slice(0, RESULT_LIMIT);
  return (
    <div className="card school-remove">
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      <label>શાળા શોધો (નામ અથવા School Code)
        <input
          type="search"
          placeholder="ઓછામાં ઓછા 2 અક્ષર લખો…"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
      </label>
      {searching && <p className="muted">શોધાય છે…</p>}
      {results && !searching && !shown.length && <p className="muted">કોઈ શાળા મળી નથી.</p>}
      {shown.length > 0 && (
        <ul className="list school-remove-list">
          {shown.map((item) => (
            <li key={item.id}>
              <span>
                <b>{item.name}</b> <small>({item.code})</small>
                <br /><small className="muted">{item.district} › {item.block}{item.active ? '' : ' · નિષ્ક્રિય'}</small>
              </span>
              {item.active
                ? <button type="button" className="danger" disabled={busyId === item.id} onClick={() => change(item, false)}>🗑 કાઢો</button>
                : !viaFunction && <button type="button" disabled={busyId === item.id} onClick={() => change(item, true)}>↺ ચાલુ કરો</button>}
            </li>
          ))}
        </ul>
      )}
      {results && results.length > RESULT_LIMIT && <p className="muted">પહેલી {RESULT_LIMIT} શાળા બતાવી છે; શોધ વધુ ચોક્કસ કરો.</p>}
    </div>
  );
}

// District / Block: add one school, import by Excel, or search-and-remove — all inside own area.
export function ScopedSchoolTools({ supabase, onChanged }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function add(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const { error: invokeError } = await invokeAuthenticatedFunction(supabase, 'scoped-school-management', {
        body: { action: 'add', ...form },
      });
      if (invokeError) throw new Error(await functionError(invokeError));
      setForm(emptyForm);
      setMessage('શાળા ઉમેરાઈ. School Login બનાવવા Login & Password Management ટેબ વાપરો.');
      onChanged?.();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="school-tools">
      <Panel icon="⇧" title="School Import" hint="Excel/CSV થી તમારા વિસ્તારની શાળાઓ ઉમેરો">
        <AdminSchoolImport supabase={supabase} onImportComplete={onChanged} />
      </Panel>
      <Panel icon="＋" title="નવી શાળા ઉમેરો" hint="તમારા વિસ્તારમાં એક શાળા ઉમેરો">
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        <form className="card" onSubmit={add}>
          <label>School Code / Login ID (11 અંક)
            <input required inputMode="numeric" maxLength={11} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </label>
          <label>શાળાનું નામ
            <input required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>ક્લસ્ટર
            <input maxLength={100} value={form.cluster} onChange={(e) => setForm({ ...form, cluster: e.target.value })} />
          </label>
          <div className="row">
            <button className="primary" disabled={busy}>{busy ? 'સાચવાય છે…' : 'શાળા ઉમેરો'}</button>
            <button type="button" onClick={() => setForm(emptyForm)}>સાફ કરો</button>
          </div>
        </form>
      </Panel>
      <Panel icon="🗑" title="શાળા કાઢો" hint="શાળા શોધો અને યાદીમાંથી કાઢો">
        <SchoolRemovePanel supabase={supabase} viaFunction onChanged={onChanged} />
      </Panel>
    </div>
  );
}
