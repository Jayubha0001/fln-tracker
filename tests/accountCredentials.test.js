import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCredentialsCsv, confirmedCredential, mergeCredentials } from '../src/lib/accountCredentials.js';
import { isActiveAdmin, isSupportedAccountType } from '../supabase/functions/_shared/scopedAccountManagement.js';

const accountTypes = [
  { accountType: 'district', loginId: '2428' },
  { accountType: 'block', loginId: '242801' },
  { accountType: 'school', loginId: '24280100001' },
];

test('confirms temporary credentials only for successful create and reset responses for all account types', () => {
  for (const account of accountTypes) {
    assert.equal(isSupportedAccountType(account.accountType), true);
    const response = {
      role: account.accountType,
      loginId: account.loginId,
      schoolCode: account.loginId,
      temporaryPassword: 'Temp,Pass"word',
      mustChangePassword: true,
    };
    assert.equal(confirmedCredential(account, response, 'create').loginId, account.loginId);
    assert.equal(confirmedCredential(account, response, 'reset').loginId, account.loginId);
  }
  assert.equal(isSupportedAccountType('admin'), false);
  assert.equal(isActiveAdmin({ role: 'admin', active: true }), true);
  assert.equal(isActiveAdmin({ role: 'admin', active: false }), false);
});

test('never returns a credential for failed, mismatched or unknown reset outcomes', () => {
  const account = accountTypes[1];
  assert.equal(confirmedCredential(account, { loginId: account.loginId, resetApplied: true }, 'reset'), null);
  assert.equal(confirmedCredential(account, { loginId: account.loginId, temporaryPassword: 'x' }, 'reset'), null);
  assert.equal(confirmedCredential(account, {
    role: 'block', loginId: '242802', temporaryPassword: 'x', mustChangePassword: true,
  }, 'reset'), null);
  assert.equal(confirmedCredential(account, undefined, 'reset'), null);
  assert.equal(confirmedCredential(account, {
    role: 'block', loginId: '242801', temporaryPassword: 'x', mustChangePassword: true,
  }, 'other'), null);
});

test('escapes CSV delimiters, quotes, newlines and spreadsheet formula prefixes', () => {
  const csv = buildCredentialsCsv([{
    accountType: 'school',
    districtName: '=2+2',
    districtCode: '2428',
    blockName: 'Block, "North"',
    blockCode: '242801',
    schoolName: 'Line 1\nLine 2',
    schoolId: '24280100001',
    loginId: '24280100001',
    temporaryPassword: 'p,"ass',
    accountStatus: 'Password Change Required',
    generatedAt: '2026-10-15T00:00:00.000Z',
  }]);
  assert.match(csv, /^"Account Type","District Name","District Code"/);
  assert.match(csv, /"'=2\+2"/);
  assert.match(csv, /"Block, ""North"""/);
  assert.match(csv, /"Line 1\nLine 2"/);
  assert.match(csv, /"p,""ass"/);
});

test('replaces an older temporary credential for the same account after a later reset', () => {
  const oldCredential = { accountType: 'school', loginId: 'school-a', temporaryPassword: 'old' };
  const newCredential = { ...oldCredential, temporaryPassword: 'new' };
  assert.deepEqual(mergeCredentials([oldCredential], [newCredential]), [newCredential]);
});
