import test from 'node:test';
import assert from 'node:assert/strict';
import { canChangeSchool, validateNewSchool } from '../supabase/functions/_shared/schoolManagement.js';

const district = { role: 'district', districtCode: '2428' };
const block = { role: 'block', districtCode: '2428', blockCode: '242801' };

test('district and block can add only schools inside their own code prefix', () => {
  assert.ok(validateNewSchool(district, { code: '24280101999', name: 'New School' }).value);
  assert.equal(validateNewSchool(district, { code: '24290101999', name: 'X' }).status, 403);
  assert.ok(validateNewSchool(block, { code: '24280101999', name: 'New School' }).value);
  assert.equal(validateNewSchool(block, { code: '24280201999', name: 'X' }).status, 403);
});

test('school code, name and cluster are validated', () => {
  assert.equal(validateNewSchool(district, { code: '2428', name: 'X' }).status, 422);
  assert.equal(validateNewSchool(district, { code: '24280101999', name: '  ' }).status, 422);
  assert.equal(validateNewSchool(district, { code: '24280101999', name: 'X', cluster: 'c'.repeat(101) }).status, 422);
  assert.equal(validateNewSchool(null, { code: '24280101999', name: 'X' }).status, 403);
});

test('remove/restore is limited to schools in scope', () => {
  assert.equal(canChangeSchool(district, { code: '24280101102' }), true);
  assert.equal(canChangeSchool(district, { code: '24290101102' }), false);
  assert.equal(canChangeSchool(block, { code: '24280201102' }), false);
  assert.equal(canChangeSchool({ role: 'admin' }, { code: '99990000000' }), true);
  assert.equal(canChangeSchool(null, { code: '24280101102' }), false);
});

import { scopedImportRowIssue } from '../supabase/functions/_shared/schoolManagement.js';

test('scoped Excel import rejects out-of-scope rows and blocks without a known district/block name', () => {
  const names = { district: 'Botad', block: 'BARVALA' };
  assert.equal(scopedImportRowIssue(district, '24280101999', names), '');
  assert.match(scopedImportRowIssue(district, '24290101999', names), /વિસ્તારનો નથી/);
  assert.match(scopedImportRowIssue(block, '24280201999', names), /વિસ્તારનો નથી/);
  assert.match(scopedImportRowIssue(block, '24280101999', null), /State Admin/);
  assert.equal(scopedImportRowIssue({ role: 'admin' }, '99990000000', null), '');
});
