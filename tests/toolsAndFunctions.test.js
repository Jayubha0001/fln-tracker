import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { FUNCTIONS } from '../src/lib/functionsList.js';
import { parseCsv, functionNames } from '../tools/lib.mjs';

test('every Edge Function folder is listed in the app status panel (and vice versa)', () => {
  const folders = readdirSync(new URL('../supabase/functions', import.meta.url)).filter((name) => !name.startsWith('_') && existsSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url))).sort();
  assert.deepEqual(FUNCTIONS.map(([name]) => name).sort(), folders);
  assert.deepEqual(functionNames(), folders);
});

test('every function has JWT verification enabled in config.toml', () => {
  const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  for (const name of functionNames()) {
    const block = config.split(`[functions.${name}]`)[1];
    assert.ok(block, `${name}: missing in config.toml`);
    assert.match(block.split('[')[0], /verify_jwt\s*=\s*true/, `${name}: verify_jwt must be true`);
  }
});

test('CSV parser handles quotes, commas, BOM-less headers and blank lines', () => {
  const rows = parseCsv('Name,Class,Reg\r\n"KUMAR, AMIT",1,101\r\n\r\nBINA,"Std 2",\r\n');
  assert.deepEqual(rows, [{ name: 'KUMAR, AMIT', class: '1', reg: '101' }, { name: 'BINA', class: 'Std 2', reg: '' }]);
});
