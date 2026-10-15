import { useEffect, useState } from 'react';
import { CLASSES, MONTHS } from '../lib/category';
import { STATEMENTS } from '../data/statements';

const DEFAULT_END = new Date().toISOString().slice(0, 10);
const DEFAULT_START = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
const EMPTY_FILTERS = {
  startDate: DEFAULT_START,
  endDate: DEFAULT_END,
  schoolCode: '',
  district: '',
  block: '',
  dhoran: '',
  month: '',
};

function errorMessage(error) {
  const context = error?.context;
  if (context instanceof Response) {
    return context.clone().text().then((text) => {
      try {
        const detail = JSON.parse(text).error || text || error.message;
        return `HTTP ${context.status}: ${detail}`;
      } catch {
        return text || error.message;
      }
    });
  }
  return Promise.resolve(error?.message || 'Report request નિષ્ફળ.');
}

export default function AdminReports({ supabase, profile }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [report, setReport] = useState(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    supabase.functions.invoke('admin-reports', {
      body: { action: 'report', filters: applied, page },
    }).then(async ({ data, error: invokeError }) => {
      if (!active) return;
      if (invokeError) {
        setError(await errorMessage(invokeError));
      } else {
        setReport(data);
      }
    }).catch((cause) => {
      if (active) setError(`દિવસવાર report લોડ ન થયો: ${cause.message}`);
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [supabase, applied, page]);

  function applyFilters(event) {
    event.preventDefault();
    if (filters.startDate > filters.endDate) {
      setError('Start date, end dateથી આગળ ન હોઈ શકે.');
      return;
    }
    const span = (Date.parse(`${filters.endDate}T00:00:00Z`) - Date.parse(`${filters.startDate}T00:00:00Z`)) / 86400000;
    if (span > 92) {
      setError('એક report માટે વધુમાં વધુ 93 દિવસ પસંદ કરો.');
      return;
    }
    setPage(1);
    setReport(null);
    setApplied({ ...filters });
  }

  async function exportReport() {
    setBusy(true);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-reports', {
        body: { action: 'export', filters: applied },
        responseType: 'blob',
      });
      if (invokeError) {
        setError(await errorMessage(invokeError));
        return;
      }
      if (!(data instanceof Blob) || data.size === 0) {
        setError('Excel export ખાલી અથવા અમાન્ય છે; ફરી પ્રયાસ કરતાં પહેલાં function logs તપાસો.');
        return;
      }
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `fln-admin-${applied.startDate}-${applied.endDate}.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(`Excel export નિષ્ફળ: ${cause.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportPendingList() {
    setBusy(true);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-reports', {
        body: { action: 'pending-export', filters: applied },
        responseType: 'blob',
      });
      if (invokeError) {
        setError(await errorMessage(invokeError));
        return;
      }
      if (!(data instanceof Blob) || data.size === 0) {
        setError('Pending Excel export ખાલી અથવા અમાન્ય છે; ફરી પ્રયાસ કરતાં પહેલાં function logs તપાસો.');
        return;
      }
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `fln-pending-${applied.startDate}-${applied.endDate}.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(`Pending list download નિષ્ફળ: ${cause.message}`);
    } finally {
      setBusy(false);
    }
  }

  function update(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const pctOf = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const stmtText = (dhoran, n) => STATEMENTS[dhoran]?.find((x) => String(x.n) === String(n))?.text || '';

  return (
    <section className="admin-reports dash">
      <div className="dash-hero">
        <div>
          <small>FLN · Entry Monitoring</small>
          <h2>દિવસવાર એન્ટ્રી રિપોર્ટ</h2>
        </div>
      </div>
      <form className="dash-filter-card report-filters" onSubmit={applyFilters}>
        <label>Start date<input required type="date" value={filters.startDate} onChange={(event) => update('startDate', event.target.value)} /></label>
        <label>End date<input required type="date" value={filters.endDate} onChange={(event) => update('endDate', event.target.value)} /></label>
        {isAdmin && <label>શાળા કોડ<input inputMode="numeric" value={filters.schoolCode} onChange={(event) => update('schoolCode', event.target.value)} placeholder="બધી શાળાઓ" /></label>}
        {isAdmin && <label>જિલ્લો<input value={filters.district} onChange={(event) => update('district', event.target.value)} /></label>}
        {isAdmin && <label>તાલુકો<input value={filters.block} onChange={(event) => update('block', event.target.value)} /></label>}
        <label>ધોરણ
          <select value={filters.dhoran} onChange={(event) => update('dhoran', event.target.value)}>
            <option value="">બધાં</option>
            {Object.entries(CLASSES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select>
        </label>
        <label>Assessment month
          <select value={filters.month} onChange={(event) => update('month', event.target.value)}>
            <option value="">બધા મહિના</option>
            {MONTHS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <button className="primary" disabled={busy}>Report જુઓ</button>
        <button type="button" disabled={busy || !report} onClick={exportReport}>⬇ Excel</button>
        <button type="button" disabled={busy || !report} onClick={exportPendingList}>⬇ બાકી વિદ્યાર્થીઓ</button>
      </form>
      <p className="muted">તારીખના filters સાચવવાના સમય (updated_at) પર લાગુ પડે છે. જૂની entries માટે મૂળ assessment date અજ્ઞાત હોઈ શકે.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {busy && <p role="status">Report તૈયાર થાય છે…</p>}
      {report && (
        <>
          <div className="dash-kpis">
            <div className="dash-kpi"><span>શાળાઓ</span><b>{report.totals.schools}</b></div>
            <div className="dash-kpi"><span>નોંધાયેલા વિદ્યાર્થીઓ</span><b>{report.totals.enrolled}</b></div>
            <div className="dash-kpi n"><span>એન્ટ્રી થયેલ</span><b>{report.totals.submitted}</b></div>
            <div className="dash-kpi u"><span>બાકી</span><b>{report.totals.pending}</b></div>
            <div className="dash-kpi"><span>Completion</span><b>{report.totals.completionPercent}%</b></div>
          </div>

          <div className="card dash-card">
            <h3>દિવસ પ્રમાણે સાચવેલી entries</h3>
            {report.daily.length ? (
              <div className="scroll dash-scroll"><table className="dash-table">
                <thead><tr><th className="left">તારીખ</th><th>Entries</th><th className="wide">પ્રમાણ</th></tr></thead>
                <tbody>{report.daily.map((item) => {
                  const max = Math.max(...report.daily.map((d) => d.submitted), 1);
                  return (
                    <tr key={item.date}><td className="left">{item.date}</td><td><b>{item.submitted}</b></td>
                      <td><div className="dash-bar"><i className="n" style={{ width: `${pctOf(item.submitted, max)}%` }} /></div></td></tr>
                  );
                })}</tbody>
              </table></div>
            ) : <p className="muted">આ filters માટે હજી ડેટા ઉપલબ્ધ નથી.</p>}
          </div>

          <div className="card dash-card">
            <h3>Learning outcome (વિધાન) પ્રમાણે કામગીરી</h3>
            {report.outcomes.length ? (
              <div className="scroll dash-scroll"><table className="dash-table">
                <thead><tr><th className="left">ધોરણ</th><th>વિધાન</th><th className="left">વિગત</th><th className="hn">હા</th><th className="hu">ના</th><th className="wide">હા %</th></tr></thead>
                <tbody>{report.outcomes.map((item) => (
                  <tr key={`${item.dhoran}-${item.outcome}`}>
                    <td className="left">{CLASSES[item.dhoran]?.label || item.dhoran}</td><td><b>{item.outcome}</b></td>
                    <td className="left small-text">{stmtText(item.dhoran, item.outcome)}</td>
                    <td className="cn">{item.yes}</td><td className="cu">{item.no}</td>
                    <td><div className="dash-bar" title={`${pctOf(item.yes, item.answered)}%`}><i className="n" style={{ width: `${pctOf(item.yes, item.answered)}%` }} /><i className="u" style={{ width: `${pctOf(item.no, item.answered)}%` }} /></div></td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <p className="muted">હજુ ડેટા ઉપલબ્ધ નથી.</p>}
          </div>

          <div className="card dash-card">
            <h3>શાળા પ્રમાણે Submitted / Pending <span className="dash-pill">{report.schools.length} શાળાઓ</span></h3>
            <SchoolRows rows={report.schools.slice(0, 5)} />
            {report.schools.length > 5 && (
              <details className="dash-more">
                <summary>બાકીની {report.schools.length - 5} શાળાઓ જુઓ ▾</summary>
                <SchoolRows rows={report.schools.slice(5)} />
              </details>
            )}
          </div>

          <div className="card dash-card">
            <h3>Student-wise assessment history (પાનું {report.page})</h3>
            <div className="scroll dash-scroll"><table className="dash-table">
              <thead><tr><th>સાચવેલ સમય</th><th>Month</th><th className="left">શાળા</th><th className="left">વિદ્યાર્થી</th><th>ધોરણ</th><th>હા/કુલ</th><th className="wide">જવાબો</th></tr></thead>
              <tbody>{report.entries.map((item) => {
                const ans = Object.entries(item.answers || {}).filter(([, value]) => typeof value === 'boolean');
                return (
                  <tr key={`${item.studentId}-${item.month}-${item.dhoran}`}>
                    <td>{new Date(item.savedAt).toLocaleString()}</td><td>{item.month}</td>
                    <td className="left">{item.schoolName}<small> · {item.schoolCode}</small></td><td className="left">{item.student}</td>
                    <td>{CLASSES[item.dhoran]?.label || item.dhoran}</td>
                    <td><b>{ans.filter(([, v]) => v).length}/{CLASSES[item.dhoran]?.total}</b></td>
                    <td><div className="ans-wrap">{ans.map(([number, value]) => <span key={number} className={`ans-chip ${value ? 'y' : 'n'}`}>{number}</span>)}</div></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            <div className="row between">
              <button disabled={busy || page <= 1} onClick={() => setPage((current) => current - 1)}>← પાછળનું</button>
              <span className="muted">શાળા pages: {report.schoolPage}/{report.schoolPageCount} · Entry pages: {report.page}/{report.entryPageCount}</span>
              <button disabled={busy || (page >= report.schoolPageCount && page >= report.entryPageCount)} onClick={() => setPage((current) => current + 1)}>આગળનું →</button>
            </div>
            <p className="muted">લીલા = હા, લાલ = ના (વિધાન નંબર).</p>
          </div>
        </>
      )}
    </section>
  );
}

function SchoolRows({ rows }) {
  return (
    <div className="scroll dash-scroll"><table className="dash-table">
      <thead><tr><th>કોડ</th><th className="left">શાળા</th><th className="left">જિલ્લો</th><th className="left">તાલુકો</th><th>નોંધાયેલા</th><th>એન્ટ્રી</th><th>Pending</th><th className="wide">પ્રગતિ</th></tr></thead>
      <tbody>{rows.map((item) => (
        <tr key={item.schoolId}>
          <td>{item.schoolCode}</td><td className="left">{item.schoolName}</td>
          <td className="left">{item.district}</td><td className="left">{item.taluka}</td><td>{item.enrolled}</td>
          <td className="cn">{item.submitted}</td><td className="cu">{item.pending}</td>
          <td><div className="dash-bar" title={`${item.completionPercent}%`}><i className="n" style={{ width: `${item.completionPercent}%` }} /></div><small>{item.completionPercent}%</small></td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}
