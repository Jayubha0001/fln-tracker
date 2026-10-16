import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/202610150003_scoped_account_management.sql', import.meta.url),
  'utf8',
);

test('scoped login RPC applies exact District and Block scope in its database query', () => {
  assert.match(migration, /p_actor_role = 'district' and left\(s\.code, 4\) = p_actor_district_code/);
  assert.match(migration, /left\(s\.code, 6\) = p_actor_block_code/);
  assert.match(migration, /s\.code >= \(p_actor_block_code \|\| repeat\('0', 5\)\)/);
  assert.match(migration, /s\.code <= \(p_actor_block_code \|\| repeat\('9', 5\)\)/);
  assert.match(migration, /p\.district_code = p_actor_district_code/);
  assert.match(migration, /p_actor_role = 'admin'[\s\S]*?p_actor_role = 'district'/);
  assert.doesNotMatch(migration, /public\.admin_login_targets\s*\(/);
});

test('scoped login RPC filters Auth/profile attention before pagination', () => {
  assert.match(migration, /left join auth\.users au on au\.id = pr\.profile_id/);
  assert.match(migration, /then 'needs_attention'/);
  assert.match(migration, /coalesce\(p_status, ''\) = '' or a\.account_status = p_status/);
  assert.ok(migration.indexOf('filtered_targets as') < migration.indexOf('page_rows as'));
  assert.match(migration, /lower\(au\.email\) is distinct from lower\(pr\.email\)/);
  assert.match(migration, /p_project_host/);
});

test('scoped login RPC escapes literal search wildcards and returns totals for empty pages', () => {
  assert.match(migration, /replace\(replace\(replace\(coalesce\(p_district, ''\), E'\\\\', E'\\\\\\\\'\), '%', E'\\\\%'\), '_', E'\\\\_'\)/);
  assert.match(migration, /escape E'\\\\'/);
  assert.match(migration, /result_count as\s*\(\s*select count\(\*\)::bigint as total_count from filtered_targets/s);
  assert.match(migration, /from result_count\s+left join page_rows page on true/s);
});

test('scoped login RPC bounds pagination and remains service-role-only', () => {
  assert.match(migration, /p_page < 1 or p_page > 100000/);
  assert.match(migration, /p_page_size < 1 or p_page_size > 100/);
  assert.match(migration, /\(p_page::bigint - 1\) \* p_page_size::bigint/);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
  assert.doesNotMatch(migration, /\b(drop|delete|update|insert into)\b/i);
});
