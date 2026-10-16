import test from 'node:test';
import assert from 'node:assert/strict';
import { accountResetRequest, canResetAccount } from '../src/lib/accountResetRequest.js';
import { confirmedCredential } from '../src/lib/accountCredentials.js';

test('sends a district reset to the selected profile and exact district login ID', () => {
  const profileId = '2f1c4f89-78ca-4b92-9c2d-6513fcb16ee1';
  assert.deepEqual(accountResetRequest({
    accountType: 'district',
    loginId: '2428',
    profileId,
  }), {
    functionName: 'admin-scoped-account-management',
    body: {
      action: 'reset-password',
      role: 'district',
      code: '2428',
      targetProfileId: profileId,
    },
  });
});

test('sends a block reset to the selected profile and exact block login ID', () => {
  const profileId = '2f1c4f89-78ca-4b92-9c2d-6513fcb16ee1';
  assert.deepEqual(accountResetRequest({
    accountType: 'block',
    loginId: '242801',
    profileId,
  }), {
    functionName: 'admin-scoped-account-management',
    body: {
      action: 'reset-password',
      role: 'block',
      code: '242801',
      targetProfileId: profileId,
    },
  });
});

test('completes District and Block reset response-to-one-time-credential flow only for confirmed matches', () => {
  for (const account of [
    { accountType: 'district', loginId: '2428', profileId: 'district-profile' },
    { accountType: 'block', loginId: '242801', profileId: 'block-profile' },
  ]) {
    const request = accountResetRequest(account);
    assert.equal(request.functionName, 'admin-scoped-account-management');
    assert.equal(request.body.role, account.accountType);
    assert.equal(request.body.code, account.loginId);
    assert.equal(request.body.targetProfileId, account.profileId);

    const response = {
      role: account.accountType,
      loginId: account.loginId,
      temporaryPassword: 'server-returned-temporary-password',
      mustChangePassword: true,
    };
    const credential = confirmedCredential(account, response, 'reset');
    assert.equal(credential.loginId, account.loginId);
    assert.equal(credential.temporaryPassword, response.temporaryPassword);
    assert.equal(credential.status, 'Password Change Required');
    const wrongRole = account.accountType === 'district' ? 'block' : 'district';
    assert.equal(confirmedCredential(account, { ...response, role: wrongRole }, 'reset'), null);
    assert.equal(confirmedCredential(account, { ...response, mustChangePassword: false }, 'reset'), null);
  }
});

test('preserves the school UUID and block constraint for school resets', () => {
  const schoolId = '2f1c4f89-78ca-4b92-9c2d-6513fcb16ee1';
  assert.deepEqual(accountResetRequest({
    accountType: 'school',
    schoolId,
    blockCode: '242801',
  }), {
    functionName: 'admin-school-password-reset',
    body: { schoolId, expectedBlockCode: '242801' },
  });
});

test('rejects unsupported account reset types', () => {
  assert.throws(() => accountResetRequest({ accountType: 'admin' }), /Unsupported account type/);
});

test('offers resets for existing active profiles needing attention while excluding unsafe targets', () => {
  assert.equal(canResetAccount({
    profileId: 'profile-id',
    active: true,
    accountStatus: 'needs_attention',
  }), true);
  assert.equal(canResetAccount({
    profileId: null,
    active: true,
    accountStatus: 'active',
  }), false);
  assert.equal(canResetAccount({
    profileId: 'profile-id',
    active: false,
    accountStatus: 'active',
  }), false);
  assert.equal(canResetAccount({
    profileId: 'profile-id',
    active: true,
    accountStatus: 'missing',
  }), false);
});
