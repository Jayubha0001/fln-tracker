import * as XLSX from '@e965/xlsx';

export const CREDENTIAL_EXCEL_HEADERS = [
  'Account Type',
  'District Name',
  'District Code',
  'Block Name',
  'Block Code',
  'School Name',
  'School ID',
  'Login ID',
  'Temporary Password',
  'Reset/Creation Date and Time',
  'Status',
];

export function accountOperationResult(
  account,
  temporaryPassword,
  status,
  generatedAt = new Date().toISOString(),
  passwordMode = 'unique-random',
) {
  return {
    accountType: account.accountType,
    districtName: account.districtName || '',
    districtCode: account.districtCode || '',
    blockName: account.blockName || '',
    blockCode: account.blockCode || '',
    schoolName: account.schoolName || '',
    schoolId: account.accountType === 'school' ? account.loginId : '',
    loginId: account.loginId,
    temporaryPassword: typeof temporaryPassword === 'string' ? temporaryPassword : '',
    generatedAt,
    status,
    passwordMode,
  };
}

export function buildCredentialsWorkbook(results) {
  const rows = results.map((result) => [
    result.accountType,
    result.districtName,
    result.districtCode,
    result.blockName,
    result.blockCode,
    result.schoolName,
    result.schoolId,
    result.loginId,
    result.temporaryPassword,
    result.generatedAt,
    result.status,
  ]);
  const worksheet = XLSX.utils.aoa_to_sheet([CREDENTIAL_EXCEL_HEADERS, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Credentials');
  return workbook;
}

export function confirmedCredential(account, response, action, generatedAt = new Date().toISOString()) {
  if (!['district', 'block', 'school'].includes(account?.accountType)
    || !['create', 'reset'].includes(action)
    || response?.mustChangePassword !== true
    || typeof response?.temporaryPassword !== 'string'
    || !response.temporaryPassword) return null;
  if (response.loginId !== account.loginId
    || (account.accountType !== 'school' && response.role !== account.accountType)
    || (account.accountType === 'school' && response.schoolCode !== account.loginId)
    || (action === 'reset' && response.resetApplied === true)) return null;
  return accountOperationResult(
    account,
    response.temporaryPassword,
    'Password Change Required',
    generatedAt,
    response.temporaryPasswordMode || 'unique-random',
  );
}
