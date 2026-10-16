import test from 'node:test';
import assert from 'node:assert/strict';
import { accountTypesForRole } from '../src/lib/accountManagement.js';

test('exposes only role-appropriate account-management tabs', () => {
  assert.deepEqual(accountTypesForRole('admin').map(([type]) => type), ['district', 'block', 'school']);
  assert.deepEqual(accountTypesForRole('district').map(([type]) => type), ['block', 'school']);
  assert.deepEqual(accountTypesForRole('block').map(([type]) => type), ['school']);
  assert.deepEqual(accountTypesForRole('school'), []);
  assert.deepEqual(accountTypesForRole(undefined), []);
});
