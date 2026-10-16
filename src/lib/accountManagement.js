const ACCOUNT_TYPES = [
  ['district', 'District Logins'],
  ['block', 'Block Logins'],
  ['school', 'School Logins'],
];

export function accountTypesForRole(role) {
  if (role === 'admin') return ACCOUNT_TYPES;
  if (role === 'district') return ACCOUNT_TYPES.filter(([type]) => ['block', 'school'].includes(type));
  if (role === 'block') return ACCOUNT_TYPES.filter(([type]) => type === 'school');
  return [];
}
