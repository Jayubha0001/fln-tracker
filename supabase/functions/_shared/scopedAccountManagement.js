export function validScopedTarget(role, code) {
  return (role === 'district' && typeof code === 'string' && /^\d{4}$/.test(code))
    || (role === 'block' && typeof code === 'string' && /^\d{6}$/.test(code));
}

export function isActiveAdmin(profile) {
  return profile?.role === 'admin' && profile.active === true;
}

export function isSupportedAccountType(accountType) {
  return accountType === 'district' || accountType === 'block' || accountType === 'school';
}

export function accountListResponse(accounts, total, page, pageSize) {
  return { accounts, total, page, pageSize };
}

export function accountListError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message : 'Unknown database error';
  const schemaError = ['PGRST202', 'PGRST203', 'PGRST205', '42P01', '42883'].includes(code);
  return {
    status: schemaError ? 503 : 500,
    error: schemaError
      ? `Central login list database object is missing or unavailable (${code || 'unknown'}). Apply migration 202610150001_central_login_management.sql after verifying its prerequisites, then reload the PostgREST schema cache.`
      : `Central login list database query failed (${code || 'unknown'}).`,
    databaseCode: code || null,
    databaseMessage: message,
  };
}

export function scopedAccountKey(role, districtCode, blockCode) {
  return role === 'district'
    ? `district:${districtCode}`
    : `block:${districtCode}:${blockCode}`;
}

export function accountStatus(profile, authUser, lookupFailed = false) {
  if (!profile) return 'missing';
  if (lookupFailed) return 'needs_attention';
  if (!authUser || authUser.id !== profile.id
    || authUser.email?.toLowerCase() !== profile.email?.toLowerCase()) return 'needs_attention';
  if (!profile.active) return 'inactive';
  if (profile.must_change_password) return 'password_change_required';
  return 'active';
}

export function matchingScopedProfiles(profiles, role, code) {
  return profiles.filter((profile) => role === 'district'
    ? profile.role === role && profile.district_code === code && profile.block_code === null
    : profile.role === role && profile.block_code === code && profile.district_code === code.slice(0, 4));
}

export function resetFailureReason(profile, authUser, role, code, projectHost) {
  if (!profile) return 'profile_missing';
  const districtCode = role === 'district' ? code : code.slice(0, 4);
  const blockCode = role === 'block' ? code : null;
  if (profile.role !== role
    || profile.school_id !== null
    || profile.district_code !== districtCode
    || profile.block_code !== blockCode) return 'profile_scope_mismatch';
  if (!profile.active) return 'profile_inactive';
  const expectedEmail = `${role}-${code}@${projectHost}`.toLowerCase();
  if (!authUser || authUser.id !== profile.id
    || authUser.email?.toLowerCase() !== profile.email?.toLowerCase()
    || profile.email?.toLowerCase() !== expectedEmail) return 'auth_profile_mismatch';
  return null;
}

export function resetCanRevealCredential({ authUpdated, firstLoginFlag, auditSaved }) {
  return authUpdated === true && firstLoginFlag === true && auditSaved === true;
}
