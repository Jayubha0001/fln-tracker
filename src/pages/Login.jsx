import { useEffect, useState } from 'react';
import { checkSupabaseReachable, friendlyError } from '../lib/connection.js';
import { schoolAuthEmail, scopedAuthEmail } from '../lib/schoolLogin.js';

export default function Login({ supabase, supabaseUrl }) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reach, setReach] = useState(null);
  const host = (() => { try { return new URL(supabaseUrl).host; } catch { return ''; } })();

  const runCheck = () => {
    setReach(null);
    checkSupabaseReachable(supabaseUrl).then(setReach);
  };
  useEffect(() => {
    let mounted = true;
    checkSupabaseReachable(supabaseUrl).then((result) => { if (mounted) setReach(result); });
    return () => { mounted = false; };
  }, [supabaseUrl]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const identifier = loginId.trim();
      const email = identifier.includes('@')
        ? identifier
        : /^\d{11}$/.test(identifier)
          ? schoolAuthEmail(identifier, supabaseUrl)
          : scopedAuthEmail(identifier, supabaseUrl);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) setError(friendlyError('લૉગિન નિષ્ફળ', signInError.message, host));
    } catch (cause) {
      setError(friendlyError('લૉગિન નિષ્ફળ', cause.message, host));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>ગણિત ટ્રેકર – FLN</h1>
        <p className="muted">School ID (11 અંક), Block ID (6 અંક), District ID (4 અંક) અથવા Admin email વડે લૉગિન કરો.</p>
        <label>Login ID / Admin Email<input type="text" autoComplete="username" required value={loginId} onChange={(e) => setLoginId(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {reach && !reach.ok && (
          <p className="error" role="alert">
            ⚠ Supabase server ({host || 'URL ગોઠવેલ નથી'}) સુધી પહોંચાતું નથી: {reach.reason}<br />
            Project paused હોય તો Supabase Dashboard → <b>Restore project</b>. Internet/VPN/Ad-blocker પણ તપાસો.{' '}
            <button type="button" onClick={runCheck}>↻ ફરી તપાસો</button>
          </p>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'લૉગિન થાય છે…' : 'લૉગિન'}</button>
      </form>
    </main>
  );
}
