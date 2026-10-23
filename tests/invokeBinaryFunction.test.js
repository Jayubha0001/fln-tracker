import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeBinaryFunction } from '../src/lib/invokeBinaryFunction.js';

const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } }, error: null }) } };

test('sends the session token and returns the xlsx bytes as a Blob', async () => {
  let call;
  const fetchImpl = async (url, options) => {
    call = { url, options };
    return new Response(new Uint8Array([80, 75, 3, 4]), { status: 200, headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
  };
  const { data, error } = await invokeBinaryFunction(supabase, 'admin-reports', { body: { action: 'export' }, url: 'https://x.supabase.co/', key: 'pub', fetchImpl });
  assert.equal(error, null);
  assert.equal(data.size, 4);
  assert.equal(call.url, 'https://x.supabase.co/functions/v1/admin-reports');
  assert.equal(call.options.headers.Authorization, 'Bearer tok');
});

test('surfaces the server error message and rejects empty files', async () => {
  const forbidden = async () => new Response(JSON.stringify({ error: 'અધિકાર નથી' }), { status: 403 });
  const denied = await invokeBinaryFunction(supabase, 'admin-reports', { url: 'https://x.supabase.co', key: 'k', fetchImpl: forbidden });
  assert.match(denied.error.message, /403.*અધિકાર નથી/);
  const empty = async () => new Response(new Uint8Array(), { status: 200 });
  const blank = await invokeBinaryFunction(supabase, 'admin-reports', { url: 'https://x.supabase.co', key: 'k', fetchImpl: empty });
  assert.ok(blank.error);
});

test('fails clearly without a session', async () => {
  const none = { auth: { getSession: async () => ({ data: { session: null }, error: null }) } };
  const { error } = await invokeBinaryFunction(none, 'admin-reports', { url: 'https://x.supabase.co' });
  assert.match(error.message, /session/);
});
