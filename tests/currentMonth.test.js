import test from 'node:test';
import assert from 'node:assert/strict';
import { pickCurrentMonth } from '../src/lib/currentMonth.js';

const MONTHS = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'].map((key) => ({ key }));

test('entry and dashboard default to the current tracker month, not July', () => {
  assert.equal(pickCurrentMonth(MONTHS, new Date(2026, 9, 19)), '2026-10');
  assert.equal(pickCurrentMonth(MONTHS, new Date(2026, 6, 1)), '2026-07');
});

test('months outside the tracker range clamp to the nearest month', () => {
  assert.equal(pickCurrentMonth(MONTHS, new Date(2026, 4, 5)), '2026-07');
  assert.equal(pickCurrentMonth(MONTHS, new Date(2027, 5, 5)), '2027-03');
});
