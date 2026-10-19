import { schoolMatchesManagementScope } from './accountManagementAuthorization.js';

export const SCHOOL_ACTIONS = ['add', 'deactivate', 'activate'];

export function validateNewSchool(scope, input) {
  const code = String(input?.code ?? '').trim();
  const name = String(input?.name ?? '').trim().replace(/\s+/g, ' ');
  const cluster = String(input?.cluster ?? '').trim();
  if (!/^\d{11}$/.test(code)) return { status: 422, error: 'School Code / Login ID 11 અંકનો હોવો જોઈએ.' };
  if (!schoolMatchesManagementScope(scope, code)) {
    return { status: 403, error: 'આ School Code તમારા વિસ્તારનો નથી; શાળા ઉમેરાઈ નથી.' };
  }
  if (!name || name.length > 200) return { status: 422, error: 'શાળાનું નામ જરૂરી છે (વધુમાં વધુ 200 અક્ષર).' };
  if (cluster.length > 100) return { status: 422, error: 'ક્લસ્ટર વધુમાં વધુ 100 અક્ષરનું હોઈ શકે.' };
  return { value: { code, name, cluster } };
}

// Scoped (District/Block) Excel import: row must be inside caller scope and its
// District/Block names must come from an existing school with the same 6-digit prefix.
export function scopedImportRowIssue(scope, schoolId, siblingNames) {
  if (!scope || scope.role === 'admin') return '';
  if (!schoolMatchesManagementScope(scope, schoolId)) return 'આ SchoolId તમારા વિસ્તારનો નથી.';
  if (!siblingNames?.district || !siblingNames?.block) {
    return 'આ બ્લોકમાં હાલ કોઈ શાળા નથી; District/Block નામ નક્કી થતું નથી. State Admin પાસે ઉમેરાવો.';
  }
  return '';
}

export function canChangeSchool(scope, school) {
  return Boolean(scope && school && schoolMatchesManagementScope(scope, school.code));
}
