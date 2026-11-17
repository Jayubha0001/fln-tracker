import { SCHOOL_YEAR_MONTHS } from './schoolYearReport.js';

export const SCOPE_GRADES = ['B', '1', '2'];
export const SCOPE_LEVELS = ['state', 'district', 'block'];

// State -> districts, District -> blocks, Block -> schools.
export const CHILD_GROUP = { state: 'district', district: 'block', block: 'school' };

const emptyMonth = () => ({ enrolled: 0, saved: 0, complete: 0, incomplete: 0, absent: 0, pending: 0, U: 0, P: 0, N: 0 });

function addInto(target, source) {
  for (const key of Object.keys(emptyMonth())) target[key] += source[key] || 0;
  return target;
}

// Who may ask for which level (names are resolved + checked against code prefixes in the edge function).
export function scopeLevelAllowed(scope, level) {
  if (!scope || !SCOPE_LEVELS.includes(level)) return false;
  if (scope.role === 'admin') return true;
  if (scope.role === 'district') return level === 'district' || level === 'block';
  if (scope.role === 'block') return level === 'block';
  return false;
}

// The sample school (any school of the requested district/block, read through RLS) must sit inside the caller's code scope.
export function sampleSchoolInScope(scope, level, sampleCode) {
  if (!scope || typeof sampleCode !== 'string' || !/^\d{11}$/.test(sampleCode)) return false;
  if (scope.role === 'admin') return true;
  if (scope.role === 'district') return sampleCode.slice(0, 4) === scope.districtCode;
  return scope.role === 'block' && level === 'block'
    && sampleCode.slice(0, 4) === scope.districtCode && sampleCode.slice(0, 6) === scope.blockCode;
}

/**
 * statRows[grade][monthKey] = rows from fln_group_stats(child group, scope names, grade, month)
 * absentRows = [{ school_id, dhoran, month }]   schools = [{ id, code, district, block }]
 */
export function assembleScopeYearReport({ level, statRows, absentRows = [], schools = [], schoolRows = [] }) {
  const unitKeyOfSchool = (school) => (level === 'state' ? school.district : level === 'district' ? school.block : school.code);
  const schoolById = new Map(schools.map((school) => [school.id, school]));
  const absentCount = new Map();
  for (const row of absentRows) {
    const school = schoolById.get(row.school_id);
    if (!school) continue;
    const key = `${unitKeyOfSchool(school)}|${row.dhoran}|${row.month}`;
    absentCount.set(key, (absentCount.get(key) || 0) + 1);
  }

  const unitMap = new Map();
  const gradeRows = {};
  for (const grade of SCOPE_GRADES) {
    gradeRows[grade] = SCHOOL_YEAR_MONTHS.map((month) => ({ key: month.key, label: month.label, ...emptyMonth() }));
    SCHOOL_YEAR_MONTHS.forEach((month, index) => {
      for (const row of statRows?.[grade]?.[month.key] || []) {
        const unit = unitMap.get(row.group_key) || { key: row.group_key, label: row.group_label, code: row.school_code || '', block: row.block || '', perGrade: {} };
        unitMap.set(row.group_key, unit);
        unit.perGrade[grade] ||= SCHOOL_YEAR_MONTHS.map(() => emptyMonth());
        const enrolled = Number(row.registered) || 0;
        const saved = Number(row.entered) || 0;
        const U = Number(row.uday) || 0;
        const P = Number(row.pragati) || 0;
        const N = Number(row.nipun) || 0;
        const absent = absentCount.get(`${row.group_key}|${grade}|${month.key}`) || 0;
        const cell = {
          enrolled, saved, complete: U + P + N, absent, U, P, N,
          incomplete: Math.max(0, saved - (U + P + N) - absent),
          pending: Math.max(0, enrolled - saved),
        };
        unit.perGrade[grade][index] = cell;
        addInto(gradeRows[grade][index], cell);
      }
    });
  }

  const units = [...unitMap.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  let latest = -1;
  SCHOOL_YEAR_MONTHS.forEach((_, index) => {
    if (SCOPE_GRADES.some((grade) => gradeRows[grade][index].saved > 0)) latest = index;
  });

  // school-level status for the latest month (all grades together)
  const eligible = schoolRows.filter((row) => Number(row.registered) > 0);
  const complete = eligible.filter((row) => Number(row.entered) >= Number(row.registered)).length;
  const pending = eligible.filter((row) => Number(row.entered) === 0).length;
  const schoolStats = {
    total: schoolRows.length, eligible: eligible.length, noStudents: schoolRows.length - eligible.length,
    complete, pending, partial: eligible.length - complete - pending, started: eligible.length - pending,
  };
  return { level, gradeRows, units, latest, schoolStats };
}

export function sumGradeMonth(grades, index) {
  const total = emptyMonth();
  for (const grade of Object.keys(grades)) addInto(total, grades[grade]?.[index] || emptyMonth());
  return total;
}
