import { useState } from 'react';
import { FUNCTIONS } from '../lib/functionsList.js';

// OPTIONS request (koi data/side-effect nathi): 404 = deploy nathi, biju badhu = chalu.
export default function FunctionStatus({ supabase }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    const base = String(supabase.supabaseUrl || import.meta.env?.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    const key = supabase.supabaseKey || import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || '';
    const result = await Promise.all(FUNCTIONS.map(async ([name, purpose]) => {
      try {
        const response = await fetch(`${base}/functions/v1/${name}`, { method: 'OPTIONS', headers: { apikey: key } });
        return { name, purpose, ok: response.status !== 404, note: response.status === 404 ? 'Deploy nathi / Not deployed' : `Chalu / Running (HTTP ${response.status})` };
      } catch (cause) {
        return { name, purpose, ok: false, note: `Pahonchatu nathi / Unreachable: ${cause.message}` };
      }
    }));
    setRows(result);
    setBusy(false);
  }

  return (
    <div className="card function-status">
      <div className="row between">
        <p className="muted">Edge Functions deploy thayela chhe ke nahi te tapase chhe (koi data badlato nathi). / Checks that every Edge Function is deployed (changes no data).</p>
        <button type="button" className="primary" disabled={busy} onClick={check}>{busy ? 'તપાસ ચાલુ… / Checking…' : '⚙ તપાસ કરો / Check functions'}</button>
      </div>
      {rows && (
        <ul className="list">
          {rows.map((row) => (
            <li key={row.name}>
              <span><b>{row.ok ? '✔' : '✖'} {row.name}</b><br /><small className="muted">{row.purpose}</small></span>
              <span className={row.ok ? 'success' : 'error'}>{row.note}</span>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.some((row) => !row.ok) && (
        <p className="error">Jya ✖ hoy te mate terminal ma: <code>npm run deploy:functions</code> / For ✖ items run <code>npm run deploy:functions</code>.</p>
      )}
    </div>
  );
}
