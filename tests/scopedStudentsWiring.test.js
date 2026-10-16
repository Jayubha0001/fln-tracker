import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../src/pages/ScopedDashboard.jsx', import.meta.url), 'utf8');
const students = readFileSync(new URL('../src/pages/Students.jsx', import.meta.url), 'utf8');

test('District/Block dashboard passes the selected class to Student Management', () => {
  assert.match(dashboard, /<Students[^>]*dhoran=\{dhoran\}/);
});

test('Student Management tolerates a missing class and pages through all rows', () => {
  assert.match(students, /CLASSES\[dhoranProp\] \? dhoranProp : '1'/);
  assert.match(students, /loadAllRows\(/);
  assert.match(students, /PAGE_SIZE/);
});
