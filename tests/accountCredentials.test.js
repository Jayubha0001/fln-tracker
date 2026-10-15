import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '@e965/xlsx';
import {
  accountOperationResult,
  buildCredentialsWorkbook,
  confirmedCredential,
  CREDENTIAL_EXCEL_HEADERS,
} from '../src/lib/accountCredentials.js';
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

test('exports an Excel workbook with the required columns and blank passwords for unsuccessful operations', () => {
  const workbook = buildCredentialsWorkbook([
    {
      accountType: 'school',
      districtName: 'District',
      districtCode: '2428',
      blockName: 'Block',
      blockCode: '242801',
      schoolName: 'School',
      schoolId: '24280100001',
      loginId: '24280100001',
      temporaryPassword: 'TempPass!123',
      generatedAt: '2026-10-15T00:00:00.000Z',
      status: 'Password Change Required',
    },
    accountOperationResult(accountTypes[2], '', 'Reset failed', '2026-10-15T00:01:00.000Z'),
  ]);
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const parsed = XLSX.read(bytes, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(parsed.Sheets.Credentials, { header: 1 });
  assert.deepEqual(rows[0], CREDENTIAL_EXCEL_HEADERS);
  assert.equal(rows[1][8], 'TempPass!123');
  assert.equal(rows[2][8], '');
  assert.equal(rows[2][10], 'Reset failed');
});

test('keeps only returned temporary passwords and does not invent credentials for failed operations', () => {
  const account = accountTypes[2];
  const result = accountOperationResult(account, '', 'Reset failed');
  assert.equal(result.temporaryPassword, '');
  assert.equal(confirmedCredential(account, {
    loginId: account.loginId,
    schoolCode: account.loginId,
    mustChangePassword: true,
  }, 'reset'), null);
});

test('confirms a reset credential only when the server confirms it and requires password change', () => {
  const account = accountTypes[0];
  const credential = confirmedCredential(account, {
    role: 'district',
    loginId: account.loginId,
    temporaryPassword: 'server-returned-only',
    mustChangePassword: true,
  }, 'reset');
  assert.equal(credential.temporaryPassword, 'server-returned-only');
  assert.equal(credential.status, 'Password Change Required');
  assert.equal(confirmedCredential(account, {
    role: 'district',
    loginId: account.loginId,
    temporaryPassword: 'unconfirmed',
    mustChangePassword: false,
  }, 'reset'), null);
});

test('keeps generated passwords out of unsuccessful Excel rows', () => {
  const failed = accountOperationResult({
    accountType: 'school',
    loginId: '24280100001',
    districtName: '=2+2',
    districtCode: '2428',
    blockName: 'Block, "North"',
    blockCode: '242801',
    schoolName: 'Line 1\nLine 2',
  }, null, 'Reset failed', '2026-10-15T00:00:00.000Z');
  assert.equal(failed.temporaryPassword, '');
  const worksheet = buildCredentialsWorkbook([failed]).Sheets.Credentials;
  assert.equal(worksheet.B2.v, '=2+2');
  assert.equal(worksheet.B2.f, undefined);
  assert.equal(worksheet.I2.v, '');
});
