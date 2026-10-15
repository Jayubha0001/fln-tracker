export const CREDENTIAL_CSV_HEADERS = [
  'Account Type',
  'District Name',
  'District Code',
  'Block Name',
  'Block Code',
  'School Name',
  'School ID',
  'Login ID',
  'Temporary Password',
  'Account Status',
  'Generated At',
];

function csvValue(value) {
  const text = String(value ?? '');
  const safeText = /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function buildCredentialsCsv(credentials) {
  return [
    CREDENTIAL_CSV_HEADERS,
    ...credentials.map((credential) => [
      credential.accountType,
      credential.districtName,
      credential.districtCode,
      credential.blockName,
      credential.blockCode,
      credential.schoolName,
      credential.schoolId,
      credential.loginId,
      credential.temporaryPassword,
      credential.accountStatus,
      credential.generatedAt,
    ]),
  ].map((row) => row.map(csvValue).join(',')).join('\r\n');
}

export function mergeCredentials(existing, incoming) {
  const credentialsByAccount = new Map(existing.map((credential) => [
    `${credential.accountType}:${credential.loginId}`,
    credential,
  ]));
  for (const credential of incoming) {
    credentialsByAccount.set(`${credential.accountType}:${credential.loginId}`, credential);
  }
  return [...credentialsByAccount.values()];
}

export function confirmedCredential(account, response, action, generatedAt = new Date().toISOString()) {
  if (!['district', 'block', 'school'].includes(account?.accountType)
    || !['create', 'reset'].includes(action)) return null;
  const success = action === 'create'
    ? response?.mustChangePassword === true && response?.temporaryPassword
    : response?.mustChangePassword === true && response?.temporaryPassword && !response?.resetApplied;
  if (!success) return null;
  if (response.loginId !== account.loginId
    || (account.accountType !== 'school' && response.role !== account.accountType)
    || (account.accountType === 'school' && response.schoolCode !== account.loginId)) return null;
  return {
    accountType: account.accountType,
    districtName: account.districtName || '',
    districtCode: account.districtCode || '',
    blockName: account.blockName || '',
    blockCode: account.blockCode || '',
    schoolName: account.schoolName || '',
    schoolId: account.accountType === 'school' ? account.loginId : '',
    loginId: account.loginId,
    temporaryPassword: response.temporaryPassword,
    accountStatus: 'Password Change Required',
    generatedAt,
  };
}
