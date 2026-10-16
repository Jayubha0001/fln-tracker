import { resetFailureReason } from './scopedAccountManagement.js';

export function accountManagementScope(profile) {
  if (!profile?.active) return null;
  if (profile.role === 'admin') return { role: 'admin' };
  if (profile.role === 'district'
    && typeof profile.district_code === 'string'
    && /^\d{4}$/.test(profile.district_code)
    && profile.block_code == null) {
    return { role: 'district', districtCode: profile.district_code };
  }
  if (profile.role === 'block'
    && typeof profile.district_code === 'string'
    && /^\d{4}$/.test(profile.district_code)
    && typeof profile.block_code === 'string'
    && /^\d{6}$/.test(profile.block_code)
    && profile.block_code.slice(0, 4) === profile.district_code) {
    return {
      role: 'block',
      districtCode: profile.district_code,
      blockCode: profile.block_code,
    };
  }
  return null;
}

export function managedAccountTypes(scope) {
  if (scope?.role === 'admin') return ['district', 'block', 'school'];
  if (scope?.role === 'district') return ['block', 'school'];
  if (scope?.role === 'block') return ['school'];
  return [];
}

export function canManageAccount(scope, accountType, districtCode, blockCode) {
  if (!scope || !managedAccountTypes(scope).includes(accountType)) return false;
  if (scope.role === 'admin') return true;
  if (scope.role === 'district') return districtCode === scope.districtCode;
  return scope.role === 'block'
    && districtCode === scope.districtCode
    && blockCode === scope.blockCode;
}

export function schoolMatchesManagementScope(scope, schoolCode) {
  if (typeof schoolCode !== 'string' || !/^\d{11}$/.test(schoolCode) || !scope) return false;
  if (scope.role === 'admin') return true;
  if (scope.role === 'district') return schoolCode.slice(0, 4) === scope.districtCode;
  return scope.role === 'block'
    && schoolCode.slice(0, 4) === scope.districtCode
    && schoolCode.slice(0, 6) === scope.blockCode;
}

export function managedResetAuthorizationFailure(
  scope,
  profile,
  authUser,
  accountType,
  districtCode,
  blockCode,
  loginId,
  projectHost,
  targetProfileId,
) {
  if (!canManageAccount(scope, accountType, districtCode, blockCode)) return 'scope_forbidden';
  if (typeof targetProfileId !== 'string' || profile?.id !== targetProfileId) return 'profile_target_mismatch';
  const code = accountType === 'district' ? districtCode : blockCode;
  if (loginId !== code) return 'profile_scope_mismatch';
  return resetFailureReason(profile, authUser, accountType, code, projectHost);
}
