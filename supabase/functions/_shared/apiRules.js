// fln-api: shared validation (no network) so it can be unit-tested.
export const API_MAX_STUDENTS = 500;
export const API_MAX_SCHOOLS = 200;

const GRADE_ALIASES = {
  B: 'B', BALVATIKA: 'B', BAL: 'B', KG: 'B', 'બાલવાટિકા': 'B', 'બાલવાટીકા': 'B', 'બાલ': 'B',
  '1': '1', 'ધોરણ 1': '1', 'STD 1': '1', 'STD1': '1', 'CLASS 1': '1', I: '1', 'ધો-1': '1', 'ધો.1': '1', 'ધો 1': '1',
  '2': '2', 'ધોરણ 2': '2', 'STD 2': '2', 'STD2': '2', 'CLASS 2': '2', II: '2', 'ધો-2': '2', 'ધો.2': '2', 'ધો 2': '2',
};

export function normalizeGrade(value) {
  const key = String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  return GRADE_ALIASES[key] || GRADE_ALIASES[String(value ?? '').trim()] || '';
}

export const normalizeName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
export const nameKey = (value) => normalizeName(value).toUpperCase();

/**
 * rows: [{ name, class|dhoran|grade, reg? }]
 * existing: [{ name, dhoran, reg, student_id }] already in the school
 * Returns { toInsert: [{ name, dhoran, reg }], outcomes: [{ row, status, reason? }] }
 */
export function planStudentRows(rows, existing = []) {
  const seenNames = new Set(existing.map((student) => `${student.dhoran}|${nameKey(student.name)}`));
  const seenRegs = new Set(existing.flatMap((student) => [student.reg, student.student_id]).map((value) => String(value ?? '').trim()).filter(Boolean));
  const toInsert = [];
  const outcomes = [];
  rows.forEach((raw, index) => {
    const row = index + 1;
    const name = normalizeName(raw?.name);
    const dhoran = normalizeGrade(raw?.class ?? raw?.dhoran ?? raw?.grade);
    const reg = String(raw?.reg ?? raw?.register ?? '').trim();
    if (!name || name.length > 200) return outcomes.push({ row, status: 'invalid', reason: 'નામ જરૂરી છે (વધુમાં વધુ 200 અક્ષર) / name is required (max 200 chars)' });
    if (!dhoran) return outcomes.push({ row, status: 'invalid', reason: 'ધોરણ માન્ય નથી (B, 1, 2) / class must be B, 1 or 2' });
    if (reg.length > 60) return outcomes.push({ row, status: 'invalid', reason: 'રજિસ્ટર નં. ખૂબ લાંબો / register no. too long' });
    const nameId = `${dhoran}|${nameKey(name)}`;
    if (seenNames.has(nameId)) return outcomes.push({ row, status: 'duplicate', reason: 'આ ધોરણમાં આ નામ પહેલેથી છે / same name already in this class' });
    if (reg && seenRegs.has(reg)) return outcomes.push({ row, status: 'duplicate', reason: 'આ રજિસ્ટર નં. પહેલેથી છે / register no. already used' });
    seenNames.add(nameId);
    if (reg) seenRegs.add(reg);
    toInsert.push({ name, dhoran, reg });
    outcomes.push({ row, status: 'added' });
  });
  return { toInsert, outcomes };
}

export function validateApiSchool(input) {
  const code = String(input?.code ?? '').trim();
  const name = normalizeName(input?.name);
  const cluster = String(input?.cluster ?? '').trim();
  const district = normalizeName(input?.district);
  const block = normalizeName(input?.block);
  if (!/^\d{11}$/.test(code)) return { error: 'School code 11 અંકનો હોવો જોઈએ / must be 11 digits' };
  if (!name || name.length > 200) return { error: 'શાળાનું નામ જરૂરી છે / school name is required' };
  if (cluster.length > 100 || district.length > 120 || block.length > 120) return { error: 'ક્લસ્ટર/જિલ્લો/તાલુકો ખૂબ લાંબો / value too long' };
  return { value: { code, name, cluster, district, block } };
}

export const API_ACTIONS = ['whoami', 'add-school', 'add-schools', 'add-students', 'list-students', 'list-schools'];
