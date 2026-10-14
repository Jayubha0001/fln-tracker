import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountStatus,
  isActiveAdmin,
  matchingScopedProfiles,
  resetCanRevealCredential,
  resetFailureReason,
  scopedAccountKey,
  validScopedTarget,
} from '../supabase/functions/_shared/scopedAccountManagement.js';

test('validates district and block targets and binds them to their scope', () => {
  assert.equal(validScopedTarget('district', '2428'), true);
  assert.equal(validScopedTarget('block', '242801'), true);
  assert.equal(validScopedTarget('district', '242801'), false);
  assert.equal(validScopedTarget('block', '242802'), true);
  assert.equal(scopedAccountKey('district', '2428', null), 'district:2428');
  assert.equal(scopedAccountKey('block', '2428', '242801'), 'block:2428:242801');
});

test('allows only an active admin caller', () => {
  assert.equal(isActiveAdmin({ role: 'admin', active: true }), true);
  assert.equal(isActiveAdmin({ role: 'admin', active: false }), false);
  assert.equal(isActiveAdmin({ role: 'district', active: true }), false);
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

test('reveals a reset credential only after Auth, mandatory-change flag, and audit succeed', () => {
  assert.equal(resetCanRevealCredential({ authUpdated: true, firstLoginFlag: true, auditSaved: true }), true);
  assert.equal(resetCanRevealCredential({ authUpdated: false, firstLoginFlag: true, auditSaved: true }), false);
  assert.equal(resetCanRevealCredential({ authUpdated: true, firstLoginFlag: false, auditSaved: true }), false);
  assert.equal(resetCanRevealCredential({ authUpdated: true, firstLoginFlag: true, auditSaved: false }), false);
});
