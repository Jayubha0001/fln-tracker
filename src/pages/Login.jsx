import { useState } from 'react';
import { schoolAuthEmail, scopedAuthEmail } from '../lib/schoolLogin.js';

export default function Login({ supabase, supabaseUrl }) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      if (signInError) setError(`લૉગિન નિષ્ફળ: ${signInError.message}`);
    } catch (cause) {
      setError(`લૉગિન નિષ્ફળ: ${cause.message}`);
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
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'લૉગિન થાય છે…' : 'લૉગિન'}</button>
      </form>
    </main>
  );
}
