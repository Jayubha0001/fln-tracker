import { useRef, useState } from 'react';
import * as XLSX from '@e965/xlsx';
import { normDhoran } from '../lib/importStudents.js';

const BATCH_SIZE = 100;
const COLUMN_ALIASES = {
  schoolCode: ['schoolid', 'schoolcode', 'udisecode'],
  studentName: ['studentname'],
  fatherName: ['fathername'],
  surname: ['surname'],
  dhoran: ['studyingclass'],
  section: ['section'],
  grNo: ['grno'],
  gender: ['gender'],
};

function normalizeHeader(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cellText(value) {
  return String(value ?? '').trim();
}

function normalizeIdentifier(value) {
  return cellText(value).toLocaleLowerCase();
}

function hasControlCharacters(value) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function readSchoolWorkbook(buffer, expectedSchoolCode) {
  const workbook = XLSX.read(buffer, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('ફાઈલમાં worksheet મળી નથી.');

  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });
  if (matrix.length < 2) throw new Error('ફાઈલમાં વિદ્યાર્થી records મળ્યા નથી.');

  const headers = matrix[0].map(normalizeHeader);
  const indexes = Object.fromEntries(
    Object.entries(COLUMN_ALIASES).map(([field, aliases]) => [
      field,
      headers.findIndex((header) => aliases.includes(header)),
    ])
  );
  if (indexes.schoolCode < 0 || indexes.studentName < 0 || indexes.dhoran < 0) {
    throw new Error('SchoolId, StudentName અને StudyingClass કૉલમ જરૂરી છે.');
  }

  return matrix.slice(1).flatMap((cells, index) => {
    const read = (field) => (indexes[field] < 0 ? '' : cellText(cells[indexes[field]]));
    const schoolCode = read('schoolCode');
    const studentName = read('studentName');
    const fatherName = read('fatherName');
    const surname = read('surname');
    const classValue = read('dhoran');
    const section = read('section');
    const grNo = read('grNo');
    const gender = read('gender');
    if (![schoolCode, studentName, fatherName, surname, classValue, section, grNo, gender].some(Boolean)) {
      return [];
    }

    const name = [studentName, fatherName, surname].filter(Boolean).join(' ');
    const row = {
      rowNumber: index + 2,
      schoolCode,
      name,
      studentName,
      dhoran: normDhoran(classValue),
      section,
      grNo,
      gender,
      status: 'pending',
      reason: '',
    };
    if (!schoolCode) {
      row.status = 'error';
      row.reason = 'SchoolId ખાલી છે.';
    } else if (schoolCode !== String(expectedSchoolCode || '')) {
      row.status = 'error';
      row.reason = 'SchoolId login કરેલી શાળાના code સાથે મળતો નથી.';
    } else if (!studentName) {
      row.status = 'error';
      row.reason = 'StudentName ખાલી છે.';
    } else if (!row.dhoran) {
      row.status = 'error';
      row.reason = 'StudyingClass માન્ય નથી; ફક્ત બાલવાટિકા, 1 અથવા 2 સ્વીકાર્ય છે.';
    } else if (hasControlCharacters(name)) {
      row.status = 'error';
      row.reason = 'StudentNameમાં માન્ય ન હોય તેવા control characters છે.';
    } else if (hasControlCharacters(section)) {
      row.status = 'error';
      row.reason = 'Sectionમાં માન્ય ન હોય તેવા control characters છે.';
    } else if (hasControlCharacters(grNo)) {
      row.status = 'error';
      row.reason = 'GRNoમાં માન્ય ન હોય તેવા control characters છે.';
    } else {
      row.status = 'ready';
    }
    return [row];
  });
}

function exportErrors(rows) {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const failures = rows.filter((row) => row.status === 'error');
  const csv = [
    ['Excel Row', 'SchoolId', 'StudentName', 'GRNo', 'Error'].map(escape).join(','),
    ...failures.map((row) => [
      row.rowNumber,
      row.schoolCode,
      row.name,
      row.grNo,
      row.reason,
    ].map(escape).join(',')),
  ];
  const blob = new Blob([`\uFEFF${csv.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'student-import-errors.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SchoolStudentImport({ supabase, school, onImported }) {
  const fileInput = useRef(null);
  const [rows, setRows] = useState([]);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);

  async function prepareFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setRows([]);
    setSummary(null);
    setError('');
    setBusy(true);
    try {
      const parsedRows = readSchoolWorkbook(await file.arrayBuffer(), school.code);
      const seen = new Set();
      let offset = 0;
      while (true) {
        const { data: existing, error: existingError } = await supabase
          .from('students')
          .select('id, reg, student_id')
          .eq('school_id', school.id)
          .order('id')
          .range(offset, offset + 999);
        if (existingError) throw existingError;
        for (const student of existing || []) {
          for (const identifier of [student.reg, student.student_id]) {
            const normalized = normalizeIdentifier(identifier);
            if (normalized) seen.add(normalized);
          }
        }
        if (!existing || existing.length < 1000) break;
        offset += 1000;
      }
      for (const row of parsedRows) {
        if (row.status !== 'ready') continue;
        const identifier = normalizeIdentifier(row.grNo);
        if (identifier && seen.has(identifier)) {
          row.status = 'duplicate';
          row.reason = 'આ SchoolId અને GRNoનો વિદ્યાર્થી પહેલેથી database અથવા આ ફાઈલમાં છે.';
        } else if (identifier) {
          seen.add(identifier);
        }
      }
      setFilename(file.name);
      setRows(parsedRows);
    } catch (cause) {
      setError(`Excel/CSV preview બનાવી શકાયું નથી: ${cause.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function importRows() {
    const readyRows = rows.filter((row) => row.status === 'ready');
    if (!readyRows.length) return;
    setBusy(true);
    setError('');
    let nextRows = [...rows];
    try {
      for (let offset = 0; offset < readyRows.length; offset += BATCH_SIZE) {
        const batch = readyRows.slice(offset, offset + BATCH_SIZE);
        const payload = batch.map((row) => ({
          school_id: school.id,
          dhoran: row.dhoran,
          name: row.name,
          reg: row.grNo,
          student_id: row.grNo || null,
          gender: row.gender,
          section: row.section,
        }));
        const { error: insertError } = await supabase.from('students').insert(payload);
        if (!insertError) {
          const batchRows = new Set(batch.map((row) => row.rowNumber));
          nextRows = nextRows.map((row) => (
            batchRows.has(row.rowNumber) ? { ...row, status: 'imported', reason: '' } : row
          ));
          continue;
        }

        if (insertError.code !== '23505') {
          const batchRows = new Set(batch.map((row) => row.rowNumber));
          nextRows = nextRows.map((row) => (
            batchRows.has(row.rowNumber)
              ? { ...row, status: 'error', reason: `Database insert નિષ્ફળ: ${insertError.message}` }
              : row
          ));
          continue;
        }

        for (const row of batch) {
          const { error: rowInsertError } = await supabase.from('students').insert({
            school_id: school.id,
            dhoran: row.dhoran,
            name: row.name,
            reg: row.grNo,
            student_id: row.grNo || null,
            gender: row.gender,
            section: row.section,
          });
          nextRows = nextRows.map((item) => (
            item.rowNumber === row.rowNumber
              ? rowInsertError?.code === '23505'
                ? { ...item, status: 'duplicate', reason: 'Import દરમિયાન આ SchoolId અને GRNoનો વિદ્યાર્થી ઉમેરાઈ ગયો.' }
                : rowInsertError
                  ? { ...item, status: 'error', reason: `Database insert નિષ્ફળ: ${rowInsertError.message}` }
                  : { ...item, status: 'imported', reason: '' }
              : item
          ));
        }
      }
      setRows(nextRows);
      setSummary({
        total: nextRows.length,
        imported: nextRows.filter((row) => row.status === 'imported').length,
        duplicates: nextRows.filter((row) => row.status === 'duplicate').length,
        failed: nextRows.filter((row) => row.status === 'error').length,
      });
      if (nextRows.some((row) => row.status === 'imported')) onImported();
    } catch (cause) {
      setRows(nextRows);
      if (nextRows.some((row) => row.status === 'imported')) onImported();
      setError(`ઇમ્પોર્ટ status ચકાસી શકાયો નથી: ${cause.message}. ફરી પ્રયાસ કરતાં પહેલાં વિદ્યાર્થી યાદી/GRNo તપાસો.`);
    } finally {
      setBusy(false);
    }
  }

  const readyCount = rows.filter((row) => row.status === 'ready').length;
  const duplicateCount = rows.filter((row) => row.status === 'duplicate').length;
  const errorCount = rows.filter((row) => row.status === 'error').length;

  return (
    <section className="card">
      <h3>Excel માંથી વિદ્યાર્થીઓ ઉમેરો</h3>
      <p className="muted">
        SchoolId, StudentName અને StudyingClass જરૂરી છે. SchoolId login કરેલી શાળાના code સાથે મેળ ખાય તે rows જ ઉમેરાશે. GRNo, Gender અને Section ફાઈલમાં હોય તો વપરાશે. AadhaarUID બતાવવામાં કે સાચવવામાં આવતો નથી.
      </p>
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={prepareFile}
      />
      <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
        {busy ? 'પ્રક્રિયા ચાલુ છે…' : 'Excel માંથી વિદ્યાર્થીઓ ઉમેરો'}
      </button>
      {filename && <p className="muted">ફાઈલ: {filename}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {rows.length > 0 && (
        <>
          <p>
            કુલ rows: {rows.length} · ઉમેરવા યોગ્ય: {readyCount} · Duplicate: {duplicateCount} · ભૂલ: {errorCount}
          </p>
          <div className="scroll">
            <table>
              <thead>
                <tr><th>Excel Row</th><th>SchoolId</th><th>વિદ્યાર્થી</th><th>ધોરણ</th><th>GRNo</th><th>સ્થિતિ / કારણ</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{row.schoolCode}</td>
                    <td>{row.name}</td>
                    <td>{row.dhoran || '—'}</td>
                    <td>{row.grNo || '—'}</td>
                    <td>{row.status === 'ready' ? 'ઉમેરવા તૈયાર' : row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="primary" disabled={busy || readyCount === 0} onClick={importRows}>
              {busy ? 'વિદ્યાર્થી ઉમેરાઈ રહ્યા છે…' : `${readyCount} વિદ્યાર્થીઓ ઉમેરો`}
            </button>
            {errorCount > 0 && <button type="button" onClick={() => exportErrors(rows)}>ભૂલવાળી rows CSV Download</button>}
          </div>
        </>
      )}
      {summary && (
        <p className="success" role="status">
          Import પરિણામ — કુલ: {summary.total} · સફળ: {summary.imported} · Duplicate: {summary.duplicates} · નિષ્ફળ: {summary.failed}
        </p>
      )}
    </section>
  );
}
