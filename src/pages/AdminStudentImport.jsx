import { useState } from 'react';
import {
  buildAdminStudentPreview,
  loadExistingStudentKeys,
  parseAdminStudentWorkbook,
} from '../lib/adminStudentImport';

export default function AdminStudentImport({ supabase, schoolsLoaded }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [pilotComplete, setPilotComplete] = useState(false);

  async function onFileChange(event) {
    const file = event.target.files?.[0];
    setPreview(null);
    setResult(null);
    setPilotComplete(false);
    setError('');
    if (!file) return;

    setBusy(true);
    try {
      const records = parseAdminStudentWorkbook(await file.arrayBuffer());
      const sourceCodes = [...new Set(records.map((row) => row.schoolCode).filter(Boolean))];
      const sourceSchools = [];
      for (let offset = 0; offset < sourceCodes.length; offset += 500) {
        const { data, error: schoolError } = await supabase.from('schools')
          .select('id,code,name,active,district,block,cluster')
          .in('code', sourceCodes.slice(offset, offset + 500));
        if (schoolError) throw schoolError;
        sourceSchools.push(...(data || []));
      }
      const activeSchools = sourceSchools.filter((school) => school.active);
      const existingKeys = await loadExistingStudentKeys(
        supabase,
        [...new Set(activeSchools.map((school) => school.id))]
      );
      setPreview(buildAdminStudentPreview(records, sourceSchools, existingKeys));
    } catch (cause) {
      const safeMessages = new Set([
        'ફાઈલમાં worksheet મળી નથી.',
        'ફાઈલમાં વિદ્યાર્થી records મળ્યા નથી.',
        'ફાઈલમાં જરૂરી SchoolId, StudentName, StudyingClass અથવા GRNo કૉલમ મળ્યો નથી.',
      ]);
      setError(safeMessages.has(cause.message)
        ? cause.message
        : 'ફાઈલ અથવા હાલના student records વાંચી શકાયા નથી. જરૂરી columns અને database connection તપાસો.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  async function importMatched(pilotOnly) {
    if (!preview) return;
    const matchedRows = pilotOnly ? preview.validRows.slice(0, 5) : preview.validRows;
    const selectedCodes = new Set(matchedRows.map((row) => row.schoolCode));
    const matchedSchools = preview.matchedSchools.filter((school) => selectedCodes.has(school.code));
    if (!matchedSchools.length || !matchedRows.length) {
      setError('Import કરવા યોગ્ય matched school records મળ્યા નથી.');
      return;
    }

    const approved = confirm(
      pilotOnly
        ? `Pilot: ${matchedRows.length} records એક atomic transactionમાં import કરવા?`
        : `${matchedSchools.length} matched શાળાના ${matchedRows.length} બાકી records એક atomic transactionમાં import કરવા?`
    );
    if (!approved) return;

    setBusy(true);
    setError('');
    setResult(null);
    let finalResult = null;
    let failureMessage = '';
    try {
      const { data, error: rpcError } = await supabase
        .schema('public')
        .rpc('admin_import_students', {
          p_school_codes: matchedSchools.map((school) => school.code),
          p_rows: matchedRows.map((row) => ({
            school_code: row.schoolCode,
            dhoran: row.dhoran,
            name: row.name,
            gr_no: row.grNo,
            gender: row.gender,
            section: row.section,
          })),
        });
      if (rpcError) {
        const sqlState = /^[0-9A-Z]{5}$/.test(rpcError.code || '') ? rpcError.code : '';
        finalResult = {
          submitted: matchedRows.length,
          added: 0,
          duplicates: 0,
          failed: sqlState ? matchedRows.length : 0,
          confirmed: Boolean(sqlState || rpcError.code === 'PGRST202'),
          errorCode: rpcError.code || '',
        };
        const explanations = {
          PGRST202: 'RPC admin_import_students મળી નથી અથવા PostgREST schema cache જૂનો છે. Migration 202610130002 લાગુ છે કે નહીં અને function signature તપાસો.',
          '42501': 'Admin અધિકાર અથવા database permission નકારાઈ. profiles.id, role=admin, active=true અને RPC execute grant/RLS તપાસો.',
          '22023': 'RPC validation નકારાઈ: school code, row fields, row limit અને migration SQL inputs તપાસો.',
          '23502': 'students tableના જરૂરી NOT NULL column માટે import payload પૂરતું નથી.',
          '23503': 'School અથવા student foreign-key reference માન્ય નથી.',
          '23505': 'Unique constraintને કારણે duplicate row આવી; import previewમાં GRNo/ID duplicates ફરી તપાસો.',
          '42703': 'Databaseમાં import function જે column વાપરે છે તે મળ્યો નથી; deployed students schema અને migration સરખાવો.',
        };
        const message = String(rpcError.message || 'PostgRESTએ import નકારી.');
        if (rpcError.code === 'PGRST202') {
          failureMessage = [
            'PostgREST RPC admin_import_students(p_school_codes text[], p_rows jsonb) શોધી શકતું નથી.',
            message,
            'આ request RPC ચલાવે તે પહેલાં જ અટકી; આ પ્રયાસે કોઈ row commit કરી નથી. Supabase SQL Editorમાં public.admin_import_students signature તપાસો; function હોય તો NOTIFY pgrst, \'reload schema\'; ચલાવો.',
          ].join(' ');
        } else {
          failureMessage = [
            sqlState ? `Database SQLSTATE ${sqlState}` : `Import request error ${rpcError.code || rpcError.name || ''}`.trim(),
            message,
            explanations[rpcError.code] || '',
            finalResult.confirmed
              ? 'આ RPC requestએ rows commit કર્યા નથી; કોઈ bulk retry કરશો નહીં.'
              : 'આ requestની write સ્થિતિ ચકાસી શકાયી નથી; retry પહેલાં databaseમાં records તપાસો.',
          ].filter(Boolean).join(' ');
        }
        return;
      }

      const summary = Array.isArray(data) ? data[0] : data;
      const added = Number(summary?.inserted_count);
      const duplicates = Number(summary?.duplicate_count);
      if (
        !Number.isInteger(added)
        || !Number.isInteger(duplicates)
        || added < 0
        || duplicates < 0
        || added + duplicates !== matchedRows.length
      ) {
        finalResult = {
          submitted: matchedRows.length,
          added: 0,
          duplicates: 0,
          failed: matchedRows.length,
          confirmed: false,
        };
        failureMessage = 'Server response ચકાસી શકાયો નથી. ફરી upload કરતાં પહેલાં previewમાં duplicates તપાસો.';
        return;
      }
      finalResult = {
        submitted: matchedRows.length,
        added,
        duplicates,
        failed: 0,
        confirmed: true,
      };
      const submittedRowNumbers = new Set(matchedRows.map((row) => row.rowNumber));
      const remainingRows = preview.validRows.filter((row) => !submittedRowNumbers.has(row.rowNumber));
      const rowsPerSchool = new Map();
      for (const row of remainingRows) {
        rowsPerSchool.set(row.schoolId, (rowsPerSchool.get(row.schoolId) || 0) + 1);
      }
      setPreview({
        ...preview,
        validRows: remainingRows,
        duplicateRecords: preview.duplicateRecords + duplicates,
        matchedSchools: preview.matchedSchools
          .filter((school) => rowsPerSchool.has(school.id))
          .map((school) => ({ ...school, rows: rowsPerSchool.get(school.id) })),
      });
      if (pilotOnly) setPilotComplete(true);
    } catch (cause) {
      if (!finalResult) {
        finalResult = {
          submitted: matchedRows.length,
          added: 0,
          duplicates: 0,
          failed: matchedRows.length,
          confirmed: false,
        };
      }
      failureMessage = cause.message || 'Import status ચકાસી શકાયો નથી. ફરી upload કરતાં પહેલાં duplicate preview તપાસો.';
    } finally {
      if (finalResult) setResult(finalResult);
      if (failureMessage) setError(failureMessage);
      setBusy(false);
    }
  }

  return (
    <section className="card admin-import">
      <h3>Admin Excel / CSV વિદ્યાર્થી ઇમ્પોર્ટ</h3>
      <p className="muted">
        SchoolId માત્ર શાળાના database code સાથે મેળ ખાય ત્યારે જ import થશે. શાળાનું નામ match માટે વપરાતું નથી.
      AadhaarUID ક્યારેય import થતું નથી. પહેલા વધુમાં વધુ 5 recordsનો pilot ચલાવો; pilot સફળ થયા પછી બાકીના records અલગથી confirm કરી શકાય છે.
      </p>
      {!schoolsLoaded && <p className="muted">Databaseની શાળા યાદી લોડ થયા પછી import ઉપલબ્ધ થશે.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {result && (
        <div className={result.confirmed ? 'import-result' : 'import-result warning'}>
          <b>{result.confirmed ? 'Import પરિણામ' : 'Import પરિણામની પુષ્ટિ બાકી'}</b>
          <div>મોકલેલા records: {result.submitted}</div>
          <div>ઉમેરાયા: {result.added}</div>
          <div>Duplicate: {result.duplicates}</div>
          <div>
            {result.errorCode === 'PGRST202'
              ? 'RPC શોધાઈ નહીં; database function ચાલ્યું નથી; આ requestથી કોઈ row commit થઈ નથી.'
              : result.confirmed
                ? 'નિષ્ફળ/rollback: ' + result.failed
                : 'સ્થિતિ અસ્પષ્ટ; failed ગણતરીની પુષ્ટિ શક્ય નથી.'}
          </div>
        </div>
      )}
      <label>
        Excel અથવા CSV ફાઇલ
        <input type="file" accept=".xlsx,.xls,.csv" disabled={busy || !schoolsLoaded} onChange={onFileChange} />
      </label>
      {busy && <p className="muted">ફાઈલ/ડેટા તપાસાઈ રહ્યા છે…</p>}

      {preview && (
        <>
          <h4>ઇમ્પોર્ટ Preview</h4>
          <dl className="import-stats">
            <div><dt>કુલ rows</dt><dd>{preview.totalRows}</dd></div>
            <div><dt>Valid અને નવા records</dt><dd>{preview.validRows.length}</dd></div>
            <div><dt>Duplicate students (file + database)</dt><dd>{preview.duplicateRecords}</dd></div>
            <div><dt>Unmatched schools</dt><dd>{preview.unmatchedSchools.length}</dd></div>
            <div><dt>Unmatched rows</dt><dd>{preview.unmatchedRecords}</dd></div>
            <div><dt>Invalid records</dt><dd>{preview.invalidRecords}</dd></div>
            <div><dt>હાલના FLN scope બહારના ધોરણ</dt><dd>{preview.unsupportedClassRecords}</dd></div>
          </dl>
          <p className="muted">Duplicate, unmatched, invalid અને unsupported ગણતરીઓ અલગ checks છે; એક row એકથી વધુ checksમાં દેખાઈ શકે છે.</p>

          {preview.unmatchedSchools.length > 0 && (
            <div>
              <h4>Databaseમાં સક્રિય School Code સાથે match ન થયો</h4>
              <ul className="unmatched-schools">
                {preview.unmatchedSchools.map((school) => (
                  <li key={`${school.code}|${school.name}`}>
                    <b>{school.code || 'SchoolId ખાલી'}</b>
                    {school.name && <> · {school.name}</>}
                    <span> · {school.rows} rows</span>
                    {school.reason === 'database-ambiguous' && <small> · code એકથી વધુ database schools સાથે મળે છે</small>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.unsupportedClassRecords > 0 && (
            <p className="muted">
              વર્તમાન FLN tracker ફક્ત બાલવાટિકા અને ધોરણ 1–2 સ્વીકારે છે; આ rows importમાં સામેલ નહીં થાય.
            </p>
          )}

          <h4>Matched શાળાઓ ({preview.matchedSchools.length})</h4>
          {preview.matchedSchools.length === 0 ? (
            <p className="muted">Import કરવા યોગ્ય matched school records મળ્યા નથી.</p>
          ) : (
            <ul className="matched-schools">
              {preview.matchedSchools.map((school) => (
                <li key={school.id}>
                  <b>{school.name}</b> · {school.code}
                  <small>{school.district} › {school.block} · {school.rows} નવા valid records</small>
                </li>
              ))}
            </ul>
          )}
          <p className="muted">બધી matched શાળાઓના નવા records: {preview.validRows.length}</p>
          <button
            className="primary"
            disabled={busy || pilotComplete || preview.matchedSchools.length === 0 || preview.validRows.length === 0}
            onClick={() => importMatched(true)}
          >
            {busy ? 'Pilot import ચાલી રહ્યું છે…' : pilotComplete ? 'Pilot પૂર્ણ — પરિણામ ચકાસો' : `પહેલા ${Math.min(5, preview.validRows.length)} rowsનો pilot import કરો`}
          </button>
          {pilotComplete && preview.validRows.length > 0 && (
            <button
              disabled={busy}
              onClick={() => importMatched(false)}
            >
              Pilot ચકાસ્યા પછી બાકીના {preview.validRows.length} records Import કરો
            </button>
          )}
        </>
      )}
    </section>
  );
}
