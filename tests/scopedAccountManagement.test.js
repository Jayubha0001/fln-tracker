import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountListResponse,
  accountListRowsFromRpc,
  accountListError,
  accountStatus,
  authVerificationFailureStatus,
  isActiveAdmin,
  matchingScopedProfiles,
  resetCanRevealCredential,
  resetFailureReason,
  scopedResetAuthorizationFailure,
  schoolMatchesBlockScope,
  scopedAccountKey,
  validScopedTarget,
  validScopedResetTarget,
  validLoginListPagination,
} from '../supabase/functions/_shared/scopedAccountManagement.js';

test('returns the canonical login-list response contract even for empty pages', () => {
  assert.deepEqual(accountListResponse([], 0, 1, 50), {
    accounts: [],
    total: 0,
    page: 1,
    pageSize: 50,
  });
  assert.deepEqual(accountListResponse([{ loginId: '2428' }], 1, 2, 50), {
    accounts: [{ loginId: '2428' }],
    total: 1,
    page: 2,
    pageSize: 50,
  });
});

test('preserves exact totals for empty RPC pages and maps database-verified attention status', () => {
  assert.deepEqual(accountListRowsFromRpc([{
    login_id: null,
    total_count: 146,
  }], 'project.supabase.co'), {
    accounts: [],
    total: 146,
  });
  const result = accountListRowsFromRpc([{
    account_type: 'school',
    district_name: 'District',
    district_code: '2428',
    block_name: 'Block',
    block_code: '242801',
    school_name: 'School',
    school_id: 'school-uuid',
    login_id: '24280100101',
    email: 'school-24280100101@project.supabase.co',
    profile_id: 'profile-uuid',
    account_status: 'needs_attention',
    identity_consistent: false,
    target_active: true,
    total_count: 1,
  }], 'project.supabase.co');
  assert.equal(result.total, 1);
  assert.equal(result.accounts[0].accountStatus, 'needs_attention');
  assert.equal(result.accounts[0].identityConsistent, false);
});

test('bounds login-list pages and rejects invalid, fractional, and oversized inputs', () => {
  assert.equal(validLoginListPagination(1, 1), true);
  assert.equal(validLoginListPagination(100000, 100), true);
  assert.equal(validLoginListPagination(100001, 50), false);
  assert.equal(validLoginListPagination(0, 50), false);
  assert.equal(validLoginListPagination(1.5, 50), false);
  assert.equal(validLoginListPagination(1, 101), false);
  assert.equal(validLoginListPagination('2', 50), false);
});

test('reports missing login-list RPC/schema objects with actionable HTTP 503 diagnostics', () => {
  const result = accountListError({
    code: 'PGRST202',
    message: 'Could not find the function public.admin_login_targets in the schema cache',
  });
  assert.equal(result.status, 503);
  assert.equal(result.databaseCode, 'PGRST202');
  assert.match(result.error, /202610150001_central_login_management\.sql/);
  assert.match(result.databaseMessage, /admin_login_targets/);
});

test('preserves actual database query errors for login-list diagnostics', () => {
  const result = accountListError({ code: '42501', message: 'permission denied for function' });
  assert.equal(result.status, 500);
  assert.equal(result.databaseCode, '42501');
  assert.match(result.databaseMessage, /permission denied for function/);
});

test('validates district and block targets and binds them to their scope', () => {
  assert.equal(validScopedTarget('district', '2428'), true);
  assert.equal(validScopedTarget('block', '242801'), true);
  assert.equal(validScopedTarget('district', '242801'), false);
  assert.equal(validScopedTarget('block', '242802'), true);
  assert.equal(scopedAccountKey('district', '2428', null), 'district:2428');
  assert.equal(scopedAccountKey('block', '2428', '242801'), 'block:2428:242801');
});

test('requires a valid selected profile UUID along with a District or Block reset target', () => {
  const profileId = '2f1c4f89-78ca-4b92-9c2d-6513fcb16ee1';
  assert.equal(validScopedResetTarget('district', '2428', profileId), true);
  assert.equal(validScopedResetTarget('block', '242801', profileId), true);
  assert.equal(validScopedResetTarget('block', '242801', 'not-a-uuid'), false);
  assert.equal(validScopedResetTarget('district', '242801', profileId), false);
  assert.equal(validScopedResetTarget('admin', '2428', profileId), false);
});

test('allows only an active admin caller', () => {
  assert.equal(isActiveAdmin({ role: 'admin', active: true }), true);
  assert.equal(isActiveAdmin({ role: 'admin', active: false }), false);
  assert.equal(isActiveAdmin({ role: 'district', active: true }), false);
});

test('rejects invalid caller sessions and distinguishes auth-service failures', () => {
  assert.equal(authVerificationFailureStatus(401), 401);
  assert.equal(authVerificationFailureStatus(403), 401);
  assert.equal(authVerificationFailureStatus(500), 503);
  assert.equal(authVerificationFailureStatus(undefined), 503);
  assert.equal(isActiveAdmin({ role: 'admin', active: true }), true);
  assert.equal(isActiveAdmin({ role: 'school', active: true }), false);
  assert.equal(isActiveAdmin({ role: 'admin', active: false }), false);
});

test('finds only profiles matching the exact district or district-block pair', () => {
  const profiles = [
    { id: 'd1', role: 'district', district_code: '2428', block_code: null },
    { id: 'b1', role: 'block', district_code: '2428', block_code: '242801' },
    { id: 'b2', role: 'block', district_code: '2428', block_code: '242802' },
  ];
  assert.deepEqual(matchingScopedProfiles(profiles, 'district', '2428').map(({ id }) => id), ['d1']);
  assert.deepEqual(matchingScopedProfiles(profiles, 'block', '242801').map(({ id }) => id), ['b1']);
  assert.deepEqual(matchingScopedProfiles(profiles, 'block', '242899'), []);
  assert.equal(matchingScopedProfiles([...profiles, profiles[1]], 'block', '242801').length, 2);
});

test('surfaces missing, mismatched, inactive, and first-password-change states', () => {
  const profile = { id: 'u1', email: 'district-2428@example.test', active: true, must_change_password: false };
  const auth = { id: 'u1', email: 'district-2428@example.test' };
  assert.equal(accountStatus(null, null), 'missing');
  assert.equal(accountStatus(profile, null), 'needs_attention');
  assert.equal(accountStatus(profile, auth, true), 'needs_attention');
  assert.equal(accountStatus({ ...profile, active: false }, auth), 'inactive');
  assert.equal(accountStatus({ ...profile, must_change_password: true }, auth), 'password_change_required');
  assert.equal(accountStatus(profile, auth), 'active');
});

test('blocks resets for missing profiles, wrong scope, inactive profiles, and Auth mismatches', () => {
  const profile = {
    id: 'u1',
    email: 'block-242801@example.test',
    role: 'block',
    active: true,
    school_id: null,
    district_code: '2428',
    block_code: '242801',
  };
  const auth = { id: 'u1', email: profile.email };
  assert.equal(resetFailureReason(null, null, 'block', '242801', 'example.test'), 'profile_missing');
  assert.equal(resetFailureReason(profile, auth, 'block', '242802', 'example.test'), 'profile_scope_mismatch');
  assert.equal(resetFailureReason({ ...profile, active: false }, auth, 'block', '242801', 'example.test'), 'profile_inactive');
  assert.equal(resetFailureReason(profile, null, 'block', '242801', 'example.test'), 'auth_profile_mismatch');
  assert.equal(resetFailureReason(profile, { ...auth, email: 'other@example.test' }, 'block', '242801', 'example.test'), 'auth_profile_mismatch');
  assert.equal(resetFailureReason(profile, auth, 'block', '242801', 'example.test'), null);
});

test('authorizes district and block resets only for an active admin and the exact scoped target', () => {
  const admin = { role: 'admin', active: true };
  const districtProfile = {
    id: 'district-user',
    email: 'district-2428@example.test',
    role: 'district',
    active: true,
    school_id: null,
    district_code: '2428',
    block_code: null,
  };
  const blockProfile = {
    id: 'block-user',
    email: 'block-242801@example.test',
    role: 'block',
    active: true,
    school_id: null,
    district_code: '2428',
    block_code: '242801',
  };

  assert.equal(scopedResetAuthorizationFailure(admin, districtProfile, {
    id: districtProfile.id, email: districtProfile.email,
  }, 'district', '2428', 'example.test', districtProfile.id), null);
  assert.equal(scopedResetAuthorizationFailure(admin, districtProfile, {
    id: districtProfile.id, email: districtProfile.email,
  }, 'district', '2510', 'example.test', districtProfile.id), 'profile_scope_mismatch');
  assert.equal(scopedResetAuthorizationFailure(admin, blockProfile, {
    id: blockProfile.id, email: blockProfile.email,
  }, 'block', '242801', 'example.test', blockProfile.id), null);
  assert.equal(scopedResetAuthorizationFailure(admin, blockProfile, {
    id: blockProfile.id, email: blockProfile.email,
  }, 'block', '242802', 'example.test', blockProfile.id), 'profile_scope_mismatch');
  assert.equal(scopedResetAuthorizationFailure({ role: 'block', active: true }, blockProfile, {
    id: blockProfile.id, email: blockProfile.email,
  }, 'block', '242801', 'example.test', blockProfile.id), 'admin_required');
  assert.equal(scopedResetAuthorizationFailure(admin, blockProfile, {
    id: blockProfile.id, email: blockProfile.email,
  }, 'block', '242801', 'example.test', 'different-profile-id'), 'profile_target_mismatch');
});

test('rejects school password resets when the school is outside the expected block', () => {
  assert.equal(schoolMatchesBlockScope('24280100101', '242801'), true);
  assert.equal(schoolMatchesBlockScope('24280200101', '242801'), false);
  assert.equal(schoolMatchesBlockScope('24280100101', '251001'), false);
  assert.equal(schoolMatchesBlockScope('invalid', '242801'), false);
  assert.equal(schoolMatchesBlockScope('24280100101', '242801001'), false);
});

test('reveals a reset credential only after Auth, mandatory-change flag, and audit succeed', () => {
  assert.equal(resetCanRevealCredential({ authUpdated: true, firstLoginFlag: true, auditSaved: true }), true);
  assert.equal(resetCanRevealCredential({ authUpdated: false, firstLoginFlag: true, auditSaved: true }), false);
  assert.equal(resetCanRevealCredential({ authUpdated: true, firstLoginFlag: false, auditSaved: true }), false);
  assert.equal(resetCanRevealCredential({ authUpdated: true, firstLoginFlag: true, auditSaved: false }), false);
});

import { legacyAdminListFallbackAllowed } from '../supabase/functions/_shared/scopedAccountManagement.js';
import { accountManagementScope, managedAccountTypes, canManageAccount } from '../supabase/functions/_shared/accountManagementAuthorization.js';

test('only State Admin may fall back to the legacy list RPC when the scoped RPC is missing', () => {
  const missing = { code: 'PGRST202' };
  assert.equal(legacyAdminListFallbackAllowed({ role: 'admin' }, missing), true);
  assert.equal(legacyAdminListFallbackAllowed({ role: 'district', districtCode: '2401' }, missing), false);
  assert.equal(legacyAdminListFallbackAllowed({ role: 'block', districtCode: '2401', blockCode: '240101' }, missing), false);
  assert.equal(legacyAdminListFallbackAllowed({ role: 'admin' }, { code: '42501' }), false);
});

test('district and block scopes cannot manage other districts, blocks or higher roles', () => {
  const district = accountManagementScope({ role: 'district', active: true, district_code: '2401', block_code: null });
  const block = accountManagementScope({ role: 'block', active: true, district_code: '2401', block_code: '240101' });
  assert.deepEqual(managedAccountTypes(district), ['block', 'school']);
  assert.deepEqual(managedAccountTypes(block), ['school']);
  assert.equal(canManageAccount(district, 'block', '2402', '240201'), false);
  assert.equal(canManageAccount(district, 'district', '2401', null), false);
  assert.equal(canManageAccount(block, 'school', '2401', '240102'), false);
  assert.equal(canManageAccount(block, 'school', '2401', '240101'), true);
  assert.equal(accountManagementScope({ role: 'district', active: false, district_code: '2401', block_code: null }), null);
});
