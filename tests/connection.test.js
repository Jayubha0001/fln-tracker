import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSupabaseReachable, friendlyError, isNetworkFailure } from '../src/lib/connection.js';

test('network failures get a helpful Gujarati-friendly hint; other errors stay as-is', () => {
  assert.equal(isNetworkFailure('Failed to fetch'), true);
  assert.match(friendlyError('લૉગિન નિષ્ફળ', 'Failed to fetch', 'abc.supabase.co'), /Restore project/);
  assert.equal(friendlyError('લૉગિન નિષ્ફળ', 'Invalid login credentials'), 'લૉગિન નિષ્ફળ: Invalid login credentials');
});

test('reachability: any HTTP answer is reachable, a thrown fetch is not', async () => {
  assert.equal((await checkSupabaseReachable('https://x.supabase.co', { fetchImpl: async () => new Response('', { status: 401 }) })).ok, true);
  const down = await checkSupabaseReachable('https://x.supabase.co', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal(down.ok, false);
  assert.equal((await checkSupabaseReachable('')).ok, false);
});
