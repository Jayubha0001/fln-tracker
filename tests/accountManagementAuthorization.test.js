import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountManagementScope,
  canManageAccount,
  managedAccountTypes,
  managedResetAuthorizationFailure,
  schoolMatchesManagementScope,
} from '../supabase/functions/_shared/accountManagementAuthorization.js';

test('derives only valid active Admin, District, and Block management scopes', () => {
  assert.deepEqual(accountManagementScope({ role: 'admin', active: true }), { role: 'admin' });
  assert.deepEqual(accountManagementScope({
    role: 'district', active: true, district_code: '2428', block_code: null,
  }), { role: 'district', districtCode: '2428' });
  assert.deepEqual(accountManagementScope({
    role: 'block', active: true, district_code: '2428', block_code: '242801',
  }), { role: 'block', districtCode: '2428', blockCode: '242801' });
  assert.equal(accountManagementScope({ role: 'district', active: false, district_code: '2428' }), null);
  assert.equal(accountManagementScope({
    role: 'block', active: true, district_code: '2428', block_code: '251001',
  }), null);
});

test('limits account types and account targets by the caller role and exact codes', () => {
  const district = { role: 'district', districtCode: '2428' };
  const block = { role: 'block', districtCode: '2428', blockCode: '242801' };
  const admin = { role: 'admin' };

  assert.deepEqual(managedAccountTypes(admin), ['district', 'block', 'school']);
  assert.deepEqual(managedAccountTypes(district), ['block', 'school']);
  assert.deepEqual(managedAccountTypes(block), ['school']);
  assert.equal(canManageAccount(district, 'block', '2428', '242801'), true);
  assert.equal(canManageAccount(district, 'school', '2428', '242899'), true);
  assert.equal(canManageAccount(district, 'district', '2428', null), false);
  assert.equal(canManageAccount(district, 'school', '2510', '251001'), false);
  assert.equal(canManageAccount(block, 'school', '2428', '242801'), true);
  assert.equal(canManageAccount(block, 'school', '2428', '242802'), false);
  assert.equal(canManageAccount(block, 'block', '2428', '242801'), false);
  assert.equal(canManageAccount(admin, 'school', '2510', '251001'), true);
});

test('matches school accounts only within the authorized district or block', () => {
  assert.equal(schoolMatchesManagementScope({ role: 'admin' }, '25100100101'), true);
  assert.equal(schoolMatchesManagementScope({ role: 'district', districtCode: '2428' }, '24289900101'), true);
  assert.equal(schoolMatchesManagementScope({ role: 'district', districtCode: '2428' }, '25100100101'), false);
  assert.equal(schoolMatchesManagementScope({
    role: 'block', districtCode: '2428', blockCode: '242801',
  }, '24280100101'), true);
  assert.equal(schoolMatchesManagementScope({
    role: 'block', districtCode: '2428', blockCode: '242801',
  }, '24280200101'), false);
});

test('rejects password resets from unauthorized roles and for mismatched profile IDs', () => {
  const profile = {
    id: 'target-profile',
    email: 'block-242801@example.test',
    role: 'block',
    active: true,
    school_id: null,
    district_code: '2428',
    block_code: '242801',
  };
  const authUser = { id: profile.id, email: profile.email };
  const district = { role: 'district', districtCode: '2428' };
  const otherDistrict = { role: 'district', districtCode: '2510' };

  assert.equal(managedResetAuthorizationFailure(
    district, profile, authUser, 'block', '2428', '242801', '242801',
    'example.test', profile.id,
  ), null);
  assert.equal(managedResetAuthorizationFailure(
    otherDistrict, profile, authUser, 'block', '2428', '242801', '242801',
    'example.test', profile.id,
  ), 'scope_forbidden');
  assert.equal(managedResetAuthorizationFailure(
    district, profile, authUser, 'block', '2428', '242801', '242801',
    'example.test', 'different-profile',
  ), 'profile_target_mismatch');
  assert.equal(managedResetAuthorizationFailure(
    district, profile, authUser, 'block', '2428', '242802', '242802',
    'example.test', profile.id,
  ), 'profile_scope_mismatch');
});
