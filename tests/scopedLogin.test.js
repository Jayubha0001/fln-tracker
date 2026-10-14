import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedAuthEmail, schoolAuthEmail } from '../src/lib/schoolLogin.js';

const projectUrl = 'https://nutnaymoiazrhhwgqlyv.supabase.co';

test('maps the confirmed district and block code lengths to their Auth identities', () => {
  assert.equal(scopedAuthEmail('2428', projectUrl), 'district-2428@nutnaymoiazrhhwgqlyv.supabase.co');
  assert.equal(scopedAuthEmail('242801', projectUrl), 'block-242801@nutnaymoiazrhhwgqlyv.supabase.co');
  assert.equal(schoolAuthEmail('24280103001', projectUrl), 'school-24280103001@nutnaymoiazrhhwgqlyv.supabase.co');
});

test('rejects unrecognized manager login identifiers', () => {
  assert.throws(() => scopedAuthEmail('24280', projectUrl), /4 અંકનો અથવા Block Login ID 6 અંકનો/);
});
