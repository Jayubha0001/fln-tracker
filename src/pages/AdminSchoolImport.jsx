import { useMemo, useState } from 'react';
import * as XLSX from '@e965/xlsx';
const BATCH_SIZE = 500;
import { parseSchoolRows } from '../lib/schoolImport.js';

async function responseError(error) {
  if (error?.context instanceof Response) {
    const status = error.context.status;
    const text = await error.context.clone().text();
    try {
      const body = JSON.parse(text);
      return `HTTP ${status}: ${body.error || body.message || text}`;
    } catch {
      return `HTTP ${status}: ${text || error.message}`;
    }
  }
  return error?.message || 'School import function સુધી request પહોંચી નથી.';
}

function downloadErrorRows(rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
    'Excel Row': row.rowNumber,
    SchoolId: row.schoolId,
    District: row.district,
    Block: row.block,
    ClusterId: row.clusterId,
    Cluster: row.cluster,
    School: row.school,
    Status: row.status,
    Error: row.reason,
  })));
  XLSX.utils.book_append_sheet(workbook, sheet, 'Import errors');
  XLSX.writeFile(workbook, 'school-import-errors.xlsx');
}

export default function AdminSchoolImport({ supabase, onImportComplete }) {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ phase: '', done: 0, total: 0 });
  const [previewReady, setPreviewReady] = useState(false);
  const [outcomePage, setOutcomePage] = useState(0);
  const outcomePageSize = 100;

  const summary = useMemo(() => outcomes.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {}), [outcomes]);

  async function chooseFile(event) {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setRows([]);
    setOutcomes([]);
    setOutcomePage(0);
    setPreviewReady(false);
    setError('');
    if (!nextFile) return;
    try {
      const workbook = XLSX.read(await nextFile.arrayBuffer(), { cellDates: false, raw: false });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error('ફાઈલમાં worksheet મળ્યો નથી.');
      const matrix = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false });
      const parsed = parseSchoolRows(matrix);
      if (!parsed.length) throw new Error('ફાઈલમાં import કરવા rows નથી.');
      setRows(parsed);
    } catch (cause) {
      setError(`ફાઈલ વાંચી શકાઈ નથી: ${cause.message}`);
    }
  }

  async function preview() {
    if (!rows.length || busy) return;
    setBusy(true);
    setError('');
    setPreviewReady(false);
    const results = [];
    const seen = new Set();
    const chunks = Math.ceil(rows.length / BATCH_SIZE);
    setProgress({ phase: 'Preview તપાસ', done: 0, total: chunks });
    try {
      for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
        const chunk = rows.slice(offset, offset + BATCH_SIZE);
        const requestRows = chunk.map((row) => {
          if (row.schoolId && seen.has(row.schoolId)) {
            return { ...row, schoolId: row.schoolId, __localDuplicate: true };
          }
          if (row.schoolId) seen.add(row.schoolId);
          return row;
        });
        const eligible = requestRows.filter((row) => !row.__localDuplicate);
        let remoteOutcomes = [];
        if (eligible.length) {
          const { data, error: invokeError } = await supabase.functions.invoke('admin-import-schools', {
            body: { action: 'preview', rows: eligible },
          });
          if (invokeError) throw new Error(await responseError(invokeError));
          if (!Array.isArray(data?.outcomes)) throw new Error('Preview functionનું response માન્ય નથી.');
          remoteOutcomes = data.outcomes;
        }
        const byRow = new Map(remoteOutcomes.map((item) => [item.rowNumber, item]));
        for (const row of requestRows) {
          if (row.__localDuplicate) {
            results.push({ ...row, status: 'duplicate_file', reason: 'આ SchoolId uploadમાં પહેલેથી છે.' });
          } else {
            results.push({ ...row, ...(byRow.get(row.rowNumber) || { status: 'invalid', reason: 'Server outcome મળ્યો નથી.' }) });
          }
        }
        setProgress({ phase: 'Preview તપાસ', done: Math.floor(offset / BATCH_SIZE) + 1, total: chunks });
        setOutcomes([...results]);
      }
      setPreviewReady(true);
    } catch (cause) {
      setError(`Preview નિષ્ફળ: ${cause.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function importNewSchools() {
    if (!previewReady || busy) return;
    const toImport = outcomes.filter((item) => item.status === 'new');
    if (!toImport.length) {
      setError('Previewમાં ઉમેરવા માટે નવી અને valid શાળા નથી.');
      return;
    }
    if (!window.confirm(`${toImport.length} નવી શાળાઓ ઉમેરવી? Existing records overwrite નહીં થાય.`)) return;
    setBusy(true);
    setError('');
    const resultByRow = new Map(outcomes.map((item) => [item.rowNumber, item]));
    const chunks = Math.ceil(toImport.length / BATCH_SIZE);
    setProgress({ phase: 'શાળાઓ ઉમેરો', done: 0, total: chunks });
    try {
      for (let offset = 0; offset < toImport.length; offset += BATCH_SIZE) {
        const chunk = toImport.slice(offset, offset + BATCH_SIZE);
        const { data, error: invokeError } = await supabase.functions.invoke('admin-import-schools', {
          body: { action: 'import', rows: chunk },
        });
        if (invokeError) throw new Error(await responseError(invokeError));
        if (!Array.isArray(data?.outcomes)) throw new Error('Import functionનું response માન્ય નથી.');
        data.outcomes.forEach((item) => resultByRow.set(item.rowNumber, {
          ...resultByRow.get(item.rowNumber),
          ...item,
        }));
        setOutcomes(rows.map((row) => resultByRow.get(row.rowNumber)));
        setProgress({ phase: 'શાળાઓ ઉમેરો', done: Math.floor(offset / BATCH_SIZE) + 1, total: chunks });
      }
      setPreviewReady(false);
      await onImportComplete?.();
    } catch (cause) {
      setError(`Import અટક્યો: ${cause.message}. પહેલાના batches ઉમેરાયા હોઈ શકે; ફરી preview કરશો તો existing codes ઓળખાઈ જશે અને overwrite નહીં થાય.`);
      setPreviewReady(false);
      await onImportComplete?.();
    } finally {
      setBusy(false);
    }
  }

  const errors = outcomes.filter((item) => ['invalid', 'duplicate_file'].includes(item.status));
  const outcomePageCount = Math.ceil(outcomes.length / outcomePageSize);
  const visibleOutcomes = outcomes.slice(outcomePage * outcomePageSize, (outcomePage + 1) * outcomePageSize);

  return (
    <section className="card admin-school-import">
      <h3>શાળાઓ Import/Add કરો</h3>
      <p className="muted">District, Block, ClusterId, Cluster, SchoolId, School columns જરૂરી છે. SchoolId text રૂપે 11 અંકનો હોવો જોઈએ; server દરેક batchમાં 500 rows સુધી તપાસે છે.</p>
      <label>Excel (.xlsx, .xls) અથવા CSV
        <input type="file" accept=".xlsx,.xls,.csv" onChange={chooseFile} disabled={busy} />
      </label>
      {file && <p>{file.name} · {rows.length.toLocaleString()} rows વાંચ્યા</p>}
      {rows.length > 0 && (
        <div className="row">
          <button disabled={busy} onClick={preview}>{busy && progress.phase === 'Preview તપાસ' ? 'ચકાસાઈ રહ્યું છે…' : 'Preview કરો'}</button>
          <button className="primary" disabled={busy || !previewReady || !outcomes.some((item) => item.status === 'new')} onClick={importNewSchools}>
            {busy && progress.phase === 'શાળાઓ ઉમેરો' ? 'Import થાય છે…' : 'નવી શાળાઓ ઉમેરો'}
          </button>
          {errors.length > 0 && <button disabled={busy} onClick={() => downloadErrorRows(errors)}>Error Excel Download</button>}
        </div>
      )}
      {busy && <p role="status">{progress.phase}: {progress.done}/{progress.total} batches પૂર્ણ</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {previewReady && (
        <div className="import-stats">
          <div><dt>નવી valid શાળાઓ</dt><dd>{summary.new || 0}</dd></div>
          <div><dt>પહેલેથી રહેલી</dt><dd>{summary.existing || 0}</dd></div>
          <div><dt>Invalid IDs / જરૂરી માહિતી</dt><dd>{summary.invalid || 0}</dd></div>
          <div><dt>Uploadમાં duplicate IDs</dt><dd>{summary.duplicate_file || 0}</dd></div>
        </div>
      )}
      {outcomes.length > 0 && (
        <>
          <div className="scroll school-import-preview">
            <table className="report-table">
              <thead><tr><th>Excel Row</th><th>SchoolId</th><th>School</th><th>District / Block</th><th>ClusterId / Cluster</th><th>Status / કારણ</th></tr></thead>
              <tbody>{visibleOutcomes.map((item) => (
                <tr key={`${item.rowNumber}-${item.schoolId}`}>
                  <td>{item.rowNumber}</td><td>{item.schoolId}</td><td>{item.school}</td>
                  <td>{item.district} / {item.block}</td><td>{item.clusterId} / {item.cluster}</td>
                  <td>{item.status}{item.reason ? ` · ${item.reason}` : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="row between">
            <button disabled={outcomePage <= 0} onClick={() => setOutcomePage((page) => page - 1)}>પાછળનું પાનું</button>
            <span className="muted">Rows {outcomePage * outcomePageSize + 1}–{Math.min((outcomePage + 1) * outcomePageSize, outcomes.length)} / {outcomes.length.toLocaleString()}</span>
            <button disabled={outcomePage + 1 >= outcomePageCount} onClick={() => setOutcomePage((page) => page + 1)}>આગળનું પાનું</button>
          </div>
        </>
      )}
    </section>
  );
}
