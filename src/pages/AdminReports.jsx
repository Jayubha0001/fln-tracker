import { useEffect, useState } from 'react';
import { CLASSES, MONTHS } from '../lib/category';

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

export default function AdminReports({ supabase }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [report, setReport] = useState(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  function update(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="card admin-reports">
      <h2>દિવસવાર એન્ટ્રી રિપોર્ટ</h2>
      <form className="report-filters" onSubmit={applyFilters}>
        <label>Start date<input required type="date" value={filters.startDate} onChange={(event) => update('startDate', event.target.value)} /></label>
        <label>End date<input required type="date" value={filters.endDate} onChange={(event) => update('endDate', event.target.value)} /></label>
        <label>શાળા કોડ<input inputMode="numeric" value={filters.schoolCode} onChange={(event) => update('schoolCode', event.target.value)} placeholder="બધી શાળાઓ" /></label>
        <label>જિલ્લો<input value={filters.district} onChange={(event) => update('district', event.target.value)} /></label>
        <label>તાલુકો<input value={filters.block} onChange={(event) => update('block', event.target.value)} /></label>
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
        <button type="button" disabled={busy || !report} onClick={exportReport}>તમામ શાળાઓની એન્ટ્રી – Excel Export</button>
      </form>
      <p className="muted">તારીખના filters `updated_at` (સાચવવાનો સમય) પર લાગુ પડે છે. જૂની entries માટે મૂળ assessment date અજ્ઞાત હોઈ શકે.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {busy && <p role="status">Report તૈયાર થાય છે…</p>}
      {report && (
        <>
          <div className="summary-counts">
            <div><span>શાળાઓ</span><b>{report.totals.schools}</b></div>
            <div><span>નોંધાયેલા વિદ્યાર્થીઓ</span><b>{report.totals.enrolled}</b></div>
            <div><span>ચૂકવેલી entries</span><b>{report.totals.submitted}</b></div>
            <div><span>બાકી</span><b>{report.totals.pending}</b></div>
            <div><span>Completion</span><b>{report.totals.completionPercent}%</b></div>
          </div>
          <h3>દિવસ પ્રમાણે સાચવેલી entries</h3>
          {report.daily.length ? (
            <div className="scroll"><table className="report-table">
              <thead><tr><th>સાચવેલી તારીખ</th><th>Submitted entries</th></tr></thead>
              <tbody>{report.daily.map((item) => <tr key={item.date}><td>{item.date}</td><td>{item.submitted}</td></tr>)}</tbody>
            </table></div>
          ) : <p>આ filters માટે હજી ડેટા ઉપલબ્ધ નથી.</p>}
          <h3>Learning outcome પ્રમાણે કામગીરી</h3>
          {report.outcomes.length ? (
            <div className="scroll"><table className="report-table">
              <thead><tr><th>ધોરણ</th><th>Outcome</th><th>હા</th><th>ના</th><th>જવાબ નોંધાયેલા</th></tr></thead>
              <tbody>{report.outcomes.map((item) => (
                <tr key={`${item.dhoran}-${item.outcome}`}><td>{CLASSES[item.dhoran]?.label || item.dhoran}</td><td>{item.outcome}</td><td>{item.yes}</td><td>{item.no}</td><td>{item.answered}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <p>હજુ ડેટા ઉપલબ્ધ નથી.</p>}
          <h3>શાળા પ્રમાણે submitted / pending</h3>
          <div className="scroll"><table className="report-table">
            <thead><tr><th>School Code</th><th>શાળા</th><th>જિલ્લો</th><th>તાલુકો</th><th>નોંધાયેલા</th><th>Entry ધરાવતા વિદ્યાર્થીઓ</th><th>Pending</th><th>%</th></tr></thead>
            <tbody>{report.schools.map((item) => (
              <tr key={item.schoolId}>
                <td>{item.schoolCode}</td><td className="left">{item.schoolName}</td>
                <td>{item.district}</td><td>{item.taluka}</td><td>{item.enrolled}</td>
                <td>{item.submitted}</td><td>{item.pending}</td><td>{item.completionPercent}%</td>
              </tr>
            ))}</tbody>
          </table></div>
          <h3>Student-wise assessment history (page {report.page})</h3>
          <div className="scroll"><table className="report-table">
            <thead><tr><th>સાચવેલી તારીખ/સમય</th><th>Assessment date</th><th>Month</th><th>School</th><th>Code</th><th>Student</th><th>Grade</th><th>Answers</th></tr></thead>
            <tbody>{report.entries.map((item) => (
              <tr key={`${item.studentId}-${item.month}-${item.dhoran}`}>
                <td>{new Date(item.savedAt).toLocaleString()}</td>
                <td>{item.assessmentDate || 'અજ્ઞાત'}</td><td>{item.month}</td>
                <td>{item.schoolName}</td><td>{item.schoolCode}</td><td>{item.student}</td>
                <td>{CLASSES[item.dhoran]?.label || item.dhoran}</td>
                <td>{Object.entries(item.answers || {}).filter(([, value]) => typeof value === 'boolean').map(([number, value]) => `${number}:${value ? 'હા' : 'ના'}`).join(', ')}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="row between">
            <button disabled={busy || page <= 1} onClick={() => setPage((current) => current - 1)}>પાછળનું પાનું</button>
            <span>શાળા pages: {report.schoolPage}/{report.schoolPageCount} · Entry pages: {report.page}/{report.entryPageCount}</span>
            <button disabled={busy || (page >= report.schoolPageCount && page >= report.entryPageCount)} onClick={() => setPage((current) => current + 1)}>આગળનું પાનું</button>
          </div>
        </>
      )}
    </section>
  );
}
