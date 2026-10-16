export function canResetAccount(account) {
  return Boolean(account.profileId && account.active)
    && ['active', 'password_change_required', 'needs_attention'].includes(account.accountStatus);
}

export function accountResetRequest(account) {
  if (account.accountType === 'school') {
    return {
      functionName: 'admin-school-password-reset',
      body: {
        schoolId: account.schoolId,
        expectedBlockCode: account.blockCode,
      },
    };
  }
  if (account.accountType === 'district' || account.accountType === 'block') {
    return {
      functionName: 'admin-scoped-account-management',
      body: {
        action: 'reset-password',
        role: account.accountType,
        code: account.loginId,
        targetProfileId: account.profileId,
      },
    };
  }
  throw new Error('Unsupported account type for password reset.');
}
