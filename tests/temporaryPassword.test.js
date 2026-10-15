import test from 'node:test';
import assert from 'node:assert/strict';
import { resetTemporaryPassword } from '../supabase/functions/_shared/temporaryPassword.js';

test('uses unique random reset credentials unless a server-configured override exists', () => {
  assert.deepEqual(resetTemporaryPassword('Random!Password123'), {
    password: 'Random!Password123',
    mode: 'unique-random',
  });
  assert.deepEqual(resetTemporaryPassword('Random!Password123', 'Admin@123'), {
    password: 'Admin@123',
    mode: 'shared-configured',
  });
});

test('rejects a configured reset password that does not meet basic complexity', () => {
  assert.throws(
    () => resetTemporaryPassword('Random!Password123', 'weak'),
    /ADMIN_TEMPORARY_PASSWORD/,
  );
});
