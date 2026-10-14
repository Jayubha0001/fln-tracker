import { useState } from 'react';

export default function ChangePassword({ supabase, school, onComplete, onSignOut }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('બંને password સરખા નથી.');
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { error: completionError } = await supabase.rpc('complete_school_password_change');
      if (completionError) throw completionError;

      onComplete();
    } catch (cause) {
      setError(`Password બદલી શકાયો નથી: ${cause.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>પ્રથમ Login: નવો Password સેટ કરો</h1>
        <p className="muted">{school?.name || 'શાળા'} · School ID {school?.code}</p>
        <p className="muted">Dashboard ખોલતાં પહેલાં one-time password બદલો.</p>
        <label>
          નવો password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          નવો password ફરી લખો
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button className="primary" disabled={busy}>{busy ? 'Password બદલાઈ રહ્યો છે…' : 'Password બદલો'}</button>
          <button type="button" disabled={busy} onClick={onSignOut}>લૉગઆઉટ</button>
        </div>
      </form>
    </main>
  );
}
