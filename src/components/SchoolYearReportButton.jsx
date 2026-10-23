import { useState } from 'react';
import { invokeBinaryFunction } from '../lib/invokeBinaryFunction.js';

async function invokeErrorMessage(error) {
  if (error?.context instanceof Response) {
    const text = await error.context.clone().text();
    try {
      const body = JSON.parse(text);
      return body.error || text || error.message;
    } catch {
      return text || error.message;
    }
  }
  return error?.message || 'શાળા report request નિષ્ફળ.';
}

export default function SchoolYearReportButton({ supabase, school }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    try {
      const { data, error: invokeError } = await invokeBinaryFunction(supabase, 'admin-reports', {
        body: { action: 'school-year-report', schoolId: school.id },
      });
      if (invokeError) throw new Error(await invokeErrorMessage(invokeError));
      if (!(data instanceof Blob) || data.size === 0) {
        throw new Error('ખાલી/અમાન્ય Excel response મળ્યો; Function deployment અને logs તપાસો.');
      }
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `fln-school-${school.code}-2026-27.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="school-year-report-action">
      <button disabled={busy} onClick={download}>
        {busy ? 'Report બને છે…' : 'વાર્ષિક શાળા FLN Report'}
      </button>
      {error && <span className="error" role="alert">{error}</span>}
    </span>
  );
}
