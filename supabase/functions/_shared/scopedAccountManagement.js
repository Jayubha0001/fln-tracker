export function validScopedTarget(role, code) {
  return (role === 'district' && typeof code === 'string' && /^\d{4}$/.test(code))
    || (role === 'block' && typeof code === 'string' && /^\d{6}$/.test(code));
}

export function validScopedResetTarget(role, code, targetProfileId) {
  return validScopedTarget(role, code)
    && typeof targetProfileId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetProfileId);
}

export function isActiveAdmin(profile) {
  return profile?.role === 'admin' && profile.active === true;
}

export function authVerificationFailureStatus(status) {
  return status === 401 || status === 403 ? 401 : 503;
}

export function isSupportedAccountType(accountType) {
  return accountType === 'district' || accountType === 'block' || accountType === 'school';
}

export function accountListResponse(accounts, total, page, pageSize) {
  return { accounts, total, page, pageSize };
}

export function validLoginListPagination(page, pageSize) {
  return Number.isInteger(page) && page >= 1 && page <= 100000
    && Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100;
}

export function accountListRowsFromRpc(data, projectHost) {
  if (!Array.isArray(data)) return null;
  return {
    accounts: data.filter((row) => typeof row?.login_id === 'string').map((row) => ({
      accountType: row.account_type,
      districtName: row.district_name || '',
      districtCode: row.district_code || '',
      blockName: row.block_name || '',
      blockCode: row.block_code || '',
      schoolName: row.school_name || '',
      schoolId: row.school_id || '',
      loginId: row.login_id,
      email: row.email || `${row.account_type}-${row.login_id}@${projectHost}`,
      profileId: row.profile_id,
      accountStatus: row.account_status,
      lastUpdated: null,
      mustChangePassword: row.must_change_password === true,
      identityConsistent: row.identity_consistent === true,
      active: row.target_active === true,
    })),
    total: Number(data[0]?.total_count || 0),
  };
}

export function accountListError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message : 'Unknown database error';
  const schemaError = ['PGRST202', 'PGRST203', 'PGRST205', '42P01', '42883'].includes(code);
  return {
    status: schemaError ? 503 : 500,
    error: schemaError
      ? `Scoped login list database object is missing or unavailable (${code || 'unknown'}). Apply migrations 202610150001_central_login_management.sql and 202610150003_scoped_account_management.sql after verifying their prerequisites, then reload the PostgREST schema cache.`
      : `Central login list database query failed (${code || 'unknown'}).`,
    databaseCode: code || null,
    databaseMessage: message,
  };
}

// Production may not yet have migration 202610150003 (scoped_login_targets).
// Only the State Admin may fall back to the older admin_login_targets RPC;
// District/Block callers never fall back, so they can never see unscoped data.
export function legacyAdminListFallbackAllowed(scope, error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  return scope?.role === 'admin' && ['PGRST202', 'PGRST203', '42883'].includes(code);
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

export function scopedResetAuthorizationFailure(actor, profile, authUser, role, code, projectHost, targetProfileId) {
  if (!isActiveAdmin(actor)) return 'admin_required';
  if (typeof targetProfileId !== 'string' || profile?.id !== targetProfileId) return 'profile_target_mismatch';
  return resetFailureReason(profile, authUser, role, code, projectHost);
}

export function schoolMatchesBlockScope(schoolCode, expectedBlockCode) {
  return typeof schoolCode === 'string'
    && /^\d{11}$/.test(schoolCode)
    && typeof expectedBlockCode === 'string'
    && /^\d{6}$/.test(expectedBlockCode)
    && schoolCode.slice(0, 6) === expectedBlockCode;
}

export function resetCanRevealCredential({ authUpdated, firstLoginFlag, auditSaved }) {
  return authUpdated === true && firstLoginFlag === true && auditSaved === true;
}
