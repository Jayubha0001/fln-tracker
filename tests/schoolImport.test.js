import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSchoolRows } from '../src/lib/schoolImport.js';

test('parses SchoolId as a string and retains leading zeroes', () => {
  const rows = parseSchoolRows([
    ['District', 'Block', 'ClusterId', 'Cluster', 'SchoolId', 'School'],
    ['D', 'B', 'C01', 'Cluster A', '01280103001', 'Primary School'],
  ]);

  assert.equal(rows[0].schoolId, '01280103001');
  assert.equal(typeof rows[0].schoolId, 'string');
  assert.equal(rows[0].clusterId, 'C01');
  assert.equal(typeof rows[0].clusterId, 'string');
  assert.equal(rows[0].rowNumber, 2);
});

test('rejects files missing required school columns', () => {
  assert.throws(
    () => parseSchoolRows([['SchoolId', 'School'], ['01280103001', 'Primary School']]),
    /district, block, clusterid, cluster/,
  );
});

test('ignores blank spreadsheet rows', () => {
  const rows = parseSchoolRows([
    ['District', 'Block', 'ClusterId', 'Cluster', 'SchoolId', 'School'],
    ['', '', '', '', '', ''],
    ['D', 'B', 'C01', 'Cluster A', '01280103001', 'Primary School'],
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].rowNumber, 3);
});
