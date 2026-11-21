import { useState } from 'react';
import { invokeBinaryFunction } from '../lib/invokeBinaryFunction.js';

const slug = (value) => String(value || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'all';

// Vidyarthi-vaar, vidhan (question) pramane Excel report: shala / block / jillo / rajya mate, ek mahina no.
export function studentReportLevel({ district, block, schoolId }) {
  if (schoolId) return 'school';
  if (district && block) return 'block';
  if (district) return 'district';
  return 'state';
}

export default function StudentQuestionReportButton({ supabase, district = '', block = '', schoolId = '', schoolCode = '', month, grade = '' }) {
  const level = studentReportLevel({ district, block, schoolId });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    const { data, error: invokeError } = await invokeBinaryFunction(supabase, 'admin-reports', {
      body: { action: 'student-question-report', level, district, block, schoolId, month, grade },
    });
    setBusy(false);
    if (invokeError) {
      setError(invokeError.message);
      return;
    }
    const place = level === 'school' ? schoolCode : level === 'state' ? 'gujarat' : level === 'district' ? district : `${district}-${block}`;
    const url = URL.createObjectURL(data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fln-students-${level}-${slug(place)}-${month}${grade ? `-${grade}` : ''}.xlsx`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <span className="scope-year-report-action">
      <button type="button" disabled={busy} onClick={download} title="વિદ્યાર્થી-વાર વિધાન Report / Student-wise Question Report (Excel)">
        {busy ? 'Report બને છે… / Preparing…' : '⬇ વિદ્યાર્થી-વાર Report / Student-wise Report'}
      </button>
      {error && <span className="error" role="alert">{error}</span>}
    </span>
  );
}
