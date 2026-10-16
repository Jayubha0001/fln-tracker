import { useEffect, useState } from 'react';
import * as XLSX from '@e965/xlsx';
import { db } from '../db';
import { CLASSES } from '../lib/category';
import { loadAllRows } from '../lib/loadAllRows.js';
import { normDhoran, detectStandard, parseStandard } from '../lib/importStudents';
import SchoolStudentImport from './SchoolStudentImport.jsx';

const IMPORT_BATCH_SIZE = 300;

function hasMigrated(schoolId) {
  try {
    return localStorage.getItem(`fln-cloud-migrated-${schoolId}`) === 'true';
  } catch {
    return false;
  }
}

async function saveBatches(supabase, rows) {
  for (let offset = 0; offset < rows.length; offset += IMPORT_BATCH_SIZE) {
    const { error } = await supabase.from('students').insert(rows.slice(offset, offset + IMPORT_BATCH_SIZE));
    if (error) throw error;
  }
}

const PAGE_SIZE = 50;

export default function Students({ supabase, school, dhoran: dhoranProp }) {
  const dhoran = CLASSES[dhoranProp] ? dhoranProp : '1';
  const [search, setSearch] = useState('');
  const [listPage, setListPage] = useState(1);
  const [students, setStudents] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [name, setName] = useState('');
  const [reg, setReg] = useState('');
  const [sheet, setSheet] = useState(null);
  const [map, setMap] = useState({ name: '', reg: '', dhoran: '', school: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [migrationAvailable, setMigrationAvailable] = useState(false);
  const [migrationDone, setMigrationDone] = useState(() => hasMigrated(school.id));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    setStudents(null);
    setListPage(1);
    loadAllRows(supabase.from('students').select('*')
      .eq('school_id', school.id)
      .eq('dhoran', dhoran)
      .order('name').order('id'))
      .then((rows) => {
        if (mounted) setStudents(rows);
      })
      .catch((cause) => {
        if (!mounted) return;
        setStudents([]);
        setError(`વિદ્યાર્થી લોડ થઈ શક્યા નથી: ${cause.message}`);
      });
    return () => { mounted = false; };
  }, [supabase, school.id, dhoran, reloadKey]);

  useEffect(() => {
    db.students.count()
      .then((count) => setMigrationAvailable(count > 0 && !migrationDone))
      .catch((cause) => setError(`આ device નો જૂનો data તપાસી શકાયો નથી: ${cause.message}`));
  }, [migrationDone]);

  async function add() {
    if (!name.trim()) return;
    setError('');
    try {
      const { error: insertError } = await supabase.from('students').insert({
        school_id: school.id,
        dhoran,
        name: name.trim(),
        reg: reg.trim(),
        student_id: reg.trim() || null,
      });
      if (insertError) throw insertError;
      setReloadKey((key) => key + 1);
      setName('');
      setReg('');
    } catch (cause) {
      setError(`વિદ્યાર્થી ઉમેરાઈ શક્યો નથી: ${cause.message}`);
    }
  }

  async function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSheet(null);
    setError('');
    setMessage('');
    try {
      const buffer = await file.arrayBuffer();
      const head = new TextDecoder().decode(buffer.slice(0, 3000));
      if (/Workbook Frameset/i.test(head)) {
        setMessage(
          'આ ફાઈલ ફક્ત "wrapper" છે, અસલી ડેટા તેની બાજુના "_files" ફોલ્ડરની sheet001.htm ફાઈલમાં છે. ' +
          'કાં તો તે sheet001.htm ફાઈલ પસંદ કરો, કાં તો આ ફાઈલ Excel માં ખોલી .xlsx તરીકે Save As કરી પસંદ કરો.'
        );
        return;
      }
      const workbook = XLSX.read(buffer);
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
      if (!rows.length) {
        setMessage('ફાઈલમાં ડેટા મળ્યો નહીં');
        return;
      }
      const headers = Object.keys(rows[0]);
      const standardHeaders = detectStandard(headers);
      if (standardHeaders) {
        setSheet({ rows, headers, standard: true, parsed: parseStandard(rows, standardHeaders, school.code) });
        return;
      }
      const find = (pattern) => headers.find((header) => pattern.test(header.toLowerCase())) || '';
      setMap({
        name: find(/name|નામ|student/),
        reg: find(/reg|roll|id|રજી|ક્રમ/),
        dhoran: find(/std|class|dhoran|ધોરણ/),
        school: find(/school.?id|udise|schoolid/),
      });
      setSheet({ rows, headers, standard: false });
    } catch (cause) {
      setError(`ફાઈલ વાંચી શકાઈ નહીં: ${cause.message}`);
    }
  }

  async function saveList(list) {
    const { data: existing, error: queryError } = await supabase
      .from('students')
      .select('dhoran, name, reg, student_id')
      .eq('school_id', school.id);
    if (queryError) throw queryError;

    const keysOf = (student) => {
      const keys = [];
      if (student.reg) keys.push(`reg|${student.reg}`);
      const studentId = student.studentId || student.student_id;
      if (studentId) keys.push(`id|${studentId}`);
      if (!keys.length) keys.push(`${student.dhoran}|${student.name.toLowerCase()}`);
      return keys;
    };
    const seen = new Set((existing || []).flatMap(keysOf));
    const fresh = [];
    let duplicates = 0;
    for (const student of list) {
      const keys = keysOf(student);
      if (keys.some((key) => seen.has(key))) {
        duplicates += 1;
        continue;
      }
      keys.forEach((key) => seen.add(key));
      fresh.push({
        school_id: school.id,
        dhoran: student.dhoran,
        name: student.name,
        reg: student.reg || '',
        student_id: student.reg || student.studentId || null,
        gender: student.gender || '',
        section: student.section || '',
      });
    }
    await saveBatches(supabase, fresh);
    return { added: fresh.length, duplicates };
  }

  async function doImportStandard() {
    setBusy(true);
    setError('');
    try {
      const { added, duplicates } = await saveList(sheet.parsed.list);
      setReloadKey((key) => key + 1);
      setSheet(null);
      setMessage(`${added} વિદ્યાર્થી ઉમેર્યા. પહેલેથી હતા: ${duplicates}, બીજી શાળાના: ${sheet.parsed.other}, બીજું ધોરણ: ${sheet.parsed.skipped}`);
    } catch (cause) {
      setError(`વિદ્યાર્થી ઇમ્પોર્ટ થઈ શક્યા નથી: ${cause.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function doImportGeneric() {
    if (!map.name) {
      setError('નામ વાળો કૉલમ પસંદ કરો');
      return;
    }
    const list = [];
    let other = 0;
    let skipped = 0;
    for (const row of sheet.rows) {
      const studentName = String(row[map.name] ?? '').trim();
      if (!studentName) continue;
      if (map.school && String(row[map.school]).trim() !== school.code) {
        other += 1;
        continue;
      }
      const className = map.dhoran ? normDhoran(row[map.dhoran]) : dhoran;
      if (!className) {
        skipped += 1;
        continue;
      }
      list.push({
        dhoran: className,
        name: studentName,
        reg: map.reg ? String(row[map.reg]).trim() : '',
      });
    }
    setBusy(true);
    setError('');
    try {
      const { added, duplicates } = await saveList(list);
      setReloadKey((key) => key + 1);
      setSheet(null);
      setMessage(`${added} વિદ્યાર્થી ઉમેર્યા. પહેલેથી હતા: ${duplicates}, બીજી શાળાના: ${other}, બીજું ધોરણ: ${skipped}`);
    } catch (cause) {
      setError(`વિદ્યાર્થી ઇમ્પોર્ટ થઈ શક્યા નથી: ${cause.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(student) {
    if (!confirm('આ વિદ્યાર્થી અને તેની બધી FLN એન્ટ્રી કાઢી નાખવી?')) return;
    setError('');
    try {
      const { error: deleteError } = await supabase
        .from('students')
        .delete()
        .eq('id', student.id)
        .eq('school_id', school.id);
      if (deleteError) throw deleteError;
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setError(`વિદ્યાર્થી કાઢી શકાયો નથી: ${cause.message}`);
    }
  }

  async function migrateLocalData() {
    if (!confirm('આ device પરનો જૂનો data આ લૉગિન કરેલી શાળામાં ઉમેરવો? ખાતરી કરો કે આ device નો data આ જ શાળાનો છે. જૂની local copy કાઢવામાં નહીં આવે.')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const [localStudents, localEntries] = await Promise.all([
        db.students.toArray(),
        db.entries.toArray(),
      ]);
      const mismatched = localStudents.find((student) => student.schoolId && student.schoolId !== school.code);
      if (mismatched) throw new Error('આ device પર બીજી School ID નો data છે; તેને આ શાળામાં migrate કરાયો નથી.');

      let installationId = localStorage.getItem('fln-local-installation-id');
      if (!installationId) {
        installationId = crypto.randomUUID();
        localStorage.setItem('fln-local-installation-id', installationId);
      }
      const legacyRows = localStudents.map((student) => ({
        school_id: school.id,
        dhoran: student.dhoran,
        name: student.name,
        reg: student.reg || '',
        student_id: student.studentId || null,
        gender: student.gender || '',
        section: student.section || '',
        legacy_id: `${installationId}:${student.id}`,
      }));
      const migratedStudents = [];
      for (let offset = 0; offset < legacyRows.length; offset += IMPORT_BATCH_SIZE) {
        const { data, error: insertError } = await supabase
          .from('students')
          .upsert(legacyRows.slice(offset, offset + IMPORT_BATCH_SIZE), {
            onConflict: 'school_id,legacy_id',
          })
          .select('id, legacy_id');
        if (insertError) throw insertError;
        migratedStudents.push(...(data || []));
      }
      const byLegacyId = new Map(migratedStudents.map((student) => [student.legacy_id, student.id]));
      const remoteEntries = localEntries.flatMap((entry) => {
        const studentId = byLegacyId.get(`${installationId}:${entry.studentId}`);
        return studentId ? [{
          student_id: studentId,
          school_id: school.id,
          month: entry.month,
          dhoran: entry.dhoran,
          assessment_date: null,
          answers: entry.answers || {},
          updated_at: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : new Date().toISOString(),
        }] : [];
      });
      for (let offset = 0; offset < remoteEntries.length; offset += IMPORT_BATCH_SIZE) {
        const { error: entryError } = await supabase
          .from('entries')
          .upsert(remoteEntries.slice(offset, offset + IMPORT_BATCH_SIZE), {
            onConflict: 'student_id,month,dhoran',
          });
        if (entryError) throw entryError;
      }
      setReloadKey((key) => key + 1);
      localStorage.setItem(`fln-cloud-migrated-${school.id}`, 'true');
      setMigrationDone(true);
      setMigrationAvailable(false);
      setMessage(`${localStudents.length} વિદ્યાર્થી અને ${remoteEntries.length} FLN એન્ટ્રી migrate થઈ. જૂનો local data યથાવત્ છે.`);
    } catch (cause) {
      setError(`જૂનો data migrate થઈ શક્યો નથી: ${cause.message}`);
    } finally {
      setBusy(false);
    }
  }

  const ColumnSelect = ({ field, label, optional = false }) => (
    <label>
      {label}
      <select value={map[field]} onChange={(event) => setMap({ ...map, [field]: event.target.value })}>
        <option value="">{optional ? '— નથી —' : '— પસંદ કરો —'}</option>
        {sheet.headers.map((header) => <option key={header} value={header}>{header}</option>)}
      </select>
    </label>
  );

  const needle = search.trim().toLowerCase();
  const filtered = (students || []).filter((student) => !needle
    || `${student.name || ''} ${student.reg || ''} ${student.student_id || ''}`.toLowerCase().includes(needle));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(listPage, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const counts = sheet?.standard
    ? sheet.parsed.list.reduce((result, student) => ({
      ...result,
      [student.dhoran]: (result[student.dhoran] || 0) + 1,
    }), {})
    : null;

  return (
    <div>
      <h2>{CLASSES[dhoran].label} – વિદ્યાર્થી ({students?.length ?? '…'})</h2>
      {(error || message) && (
        <p className={error ? 'error' : 'success'} role={error ? 'alert' : 'status'}>{error || message}</p>
      )}

      {migrationAvailable && (
        <div className="card">
          <h3>આ device નો અગાઉનો data</h3>
          <p className="muted">જૂના offline tracker માંથી વિદ્યાર્થીઓ અને FLN એન્ટ્રી આ શાળામાં એક વખત ઉમેરો.</p>
          <button className="primary" disabled={busy} onClick={migrateLocalData}>જૂનો local data migrate કરો</button>
        </div>
      )}

      <SchoolStudentImport
        supabase={supabase}
        school={school}
        onImported={() => setReloadKey((key) => key + 1)}
      />

      <details className="card">
        <summary>જૂના Excel / CSV ફોર્મેટ માટે ઇમ્પોર્ટ</summary>
        <input type="file" accept=".xlsx,.xls,.csv,.htm,.html" onChange={onFile} />
        {sheet?.standard && (
          <>
            <p><b>{school.name}</b> ({school.code}) ના વિદ્યાર્થી: <b>{sheet.parsed.list.length}</b></p>
            <p className="muted">
              બાલવાટિકા {counts.B || 0} · ધોરણ 1: {counts['1'] || 0} · ધોરણ 2: {counts['2'] || 0}
              <br />બીજી શાળાના: {sheet.parsed.other} · બીજું ધોરણ (3 થી 8): {sheet.parsed.skipped}
            </p>
            {sheet.parsed.list.length === 0 ? (
              <p className="muted">આ શાળાનો (SchoolId {school.code}) કોઈ વિદ્યાર્થી ફાઈલમાં મળ્યો નથી.</p>
            ) : (
              <button className="primary" disabled={busy} onClick={doImportStandard}>ઇમ્પોર્ટ કરો</button>
            )}
          </>
        )}

        {sheet && !sheet.standard && (
          <>
            <p className="muted">આ ફાઈલ પોર્ટલના ફોર્મેટની નથી, એટલે કૉલમ જાતે પસંદ કરો.</p>
            <ColumnSelect field="name" label="નામ કૉલમ" />
            <ColumnSelect field="reg" label="રજીસ્ટર નં. કૉલમ" optional />
            <ColumnSelect field="dhoran" label="ધોરણ કૉલમ" optional />
            <ColumnSelect field="school" label="School ID કૉલમ" optional />
            <p className="muted">ઉદાહરણ: {sheet.rows.slice(0, 3).map((row) => String(row[map.name] ?? '')).join(' | ')}</p>
            <button className="primary" disabled={busy} onClick={doImportGeneric}>ઇમ્પોર્ટ કરો</button>
          </>
        )}
      </details>

      <div className="card">
        <h3>એક વિદ્યાર્થી ઉમેરો</h3>
        <input placeholder="વિદ્યાર્થીનું નામ" value={name} onChange={(event) => setName(event.target.value)} />
        <input placeholder="રજીસ્ટર નં. (વૈકલ્પિક)" value={reg} onChange={(event) => setReg(event.target.value)} />
        <button className="primary" onClick={add}>ઉમેરો</button>
      </div>

      {!students ? <p>વિદ્યાર્થી લોડ થાય છે…</p> : (
        <>
          <div className="card row">
            <input
              aria-label="વિદ્યાર્થી શોધો"
              placeholder="નામ / રજીસ્ટર નં. શોધો"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setListPage(1); }}
            />
            <span className="muted">{filtered.length} / {students.length}</span>
          </div>
          {!students.length && !error && <p className="muted">આ ધોરણમાં હજી કોઈ વિદ્યાર્થી નથી.</p>}
          {!!students.length && !filtered.length && <p className="muted">શોધ મુજબ કોઈ વિદ્યાર્થી મળ્યો નથી.</p>}
          <ul className="list">
            {visible.map((student, index) => (
              <li key={student.id}>
                <span>{(currentPage - 1) * PAGE_SIZE + index + 1}. {student.name} {student.reg && <small>({student.reg})</small>}</span>
                <button className="link" onClick={() => remove(student)}>કાઢો</button>
              </li>
            ))}
          </ul>
          {pageCount > 1 && (
            <div className="row between">
              <button disabled={currentPage <= 1} onClick={() => setListPage(currentPage - 1)}>← પાછળનું</button>
              <span className="muted">પાનું {currentPage}/{pageCount}</span>
              <button disabled={currentPage >= pageCount} onClick={() => setListPage(currentPage + 1)}>આગળનું →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
