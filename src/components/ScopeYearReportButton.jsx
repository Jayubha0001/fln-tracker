import { useState } from 'react';
import { invokeBinaryFunction } from '../lib/invokeBinaryFunction.js';

const slug = (value) => String(value || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'all';

// State / District / Block mate vaarshik FLN report (Excel, ગુજરાતી + English). Level dashboard na drill-down mujab.
export function scopeLevelFor({ district, block }) {
  if (district && block) return 'block';
  if (district) return 'district';
  return 'state';
}

const LABEL = {
  state: ['રાજ્ય', 'State'],
  district: ['જિલ્લા', 'District'],
  block: ['તાલુકા', 'Block'],
};

export default function ScopeYearReportButton({ supabase, district = '', block = '' }) {
  const level = scopeLevelFor({ district, block });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    const { data, error: invokeError } = await invokeBinaryFunction(supabase, 'admin-reports', {
      body: { action: 'scope-year-report', level, district, block },
    });
    setBusy(false);
    if (invokeError) {
      setError(invokeError.message);
      return;
    }
    const url = URL.createObjectURL(data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fln-${level}-${slug(level === 'state' ? 'gujarat' : level === 'district' ? district : `${district}-${block}`)}-2026-27.xlsx`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <span className="scope-year-report-action">
      <button type="button" disabled={busy} onClick={download} title={`વાર્ષિક ${LABEL[level][0]} FLN Report / Annual ${LABEL[level][1]} FLN Report (Excel)`}>
        {busy ? 'Report બને છે… / Preparing…' : `⬇ વાર્ષિક ${LABEL[level][0]} Report / Annual ${LABEL[level][1]} Report`}
      </button>
      {error && <span className="error" role="alert">{error}</span>}
    </span>
  );
}
