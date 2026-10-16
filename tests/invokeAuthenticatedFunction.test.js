import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeAuthenticatedFunction } from '../src/lib/invokeAuthenticatedFunction.js';

test('invokes an Edge Function with the current session bearer token', async () => {
  let invocation;
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'current-session-token' } }, error: null }) },
    functions: {
      invoke: async (name, options) => {
        invocation = { name, options };
        return { data: { accounts: [] }, error: null };
      },
    },
  };
  await invokeAuthenticatedFunction(supabase, 'admin-scoped-account-management', {
    body: { action: 'list' },
    headers: { 'x-client-header': 'present' },
  });
  assert.equal(invocation.name, 'admin-scoped-account-management');
  assert.deepEqual(invocation.options.body, { action: 'list' });
  assert.equal(invocation.options.headers.Authorization, 'Bearer current-session-token');
  assert.equal(invocation.options.headers['x-client-header'], 'present');
});

test('does not invoke an Edge Function when there is no valid current session', async () => {
  let invoked = false;
  const supabase = {
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    functions: { invoke: async () => { invoked = true; } },
  };
  await assert.rejects(
    invokeAuthenticatedFunction(supabase, 'admin-scoped-account-management'),
    /session સમાપ્ત છે/,
  );
  assert.equal(invoked, false);
});

test('surfaces session retrieval errors without invoking an Edge Function', async () => {
  const sessionError = new Error('refresh failed');
  const supabase = {
    auth: { getSession: async () => ({ data: { session: null }, error: sessionError }) },
    functions: { invoke: async () => assert.fail('must not invoke without a session') },
  };
  await assert.rejects(invokeAuthenticatedFunction(supabase, 'admin-scoped-account-management'), sessionError);
});
