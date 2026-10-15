import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPendingStudents, buildReportMetrics } from '../supabase/functions/_shared/reportMetrics.js';

test('calculates pending and submissions independently by school and grade', () => {
  const schools = [
    { id: 'school-a', code: '1', name: 'A', district: 'D', block: 'T' },
    { id: 'school-b', code: '2', name: 'B', district: 'D', block: 'T' },
  ];
  const enrollment = new Map([
    ['school-a:B', 2],
    ['school-a:1', 1],
    ['school-b:2', 2],
  ]);
  const entries = [
    { school_id: 'school-a', student_id: 'student-a', dhoran: 'B', updated_at: '2026-10-02T10:00:00Z', answers: { 1: true } },
    { school_id: 'school-a', student_id: 'student-a', dhoran: '1', updated_at: '2026-10-02T11:00:00Z', answers: { 1: true } },
    { school_id: 'school-b', student_id: 'student-b', dhoran: '2', updated_at: '2026-10-03T10:00:00Z', answers: { 1: false } },
  ];

  const report = buildReportMetrics(schools, enrollment, entries, ['B', '1', '2']);

  assert.deepEqual(report.schools.map(({ schoolId, enrolled, submitted, pending }) => ({
    schoolId, enrolled, submitted, pending,
  })), [
    { schoolId: 'school-a', enrolled: 3, submitted: 2, pending: 1 },
    { schoolId: 'school-b', enrolled: 2, submitted: 1, pending: 1 },
  ]);
  assert.equal(report.totals.enrolled, 5);
  assert.equal(report.totals.submitted, 3);
  assert.deepEqual(report.outcomes, [
    { dhoran: '1', outcome: '1', yes: 1, no: 0, answered: 1 },
    { dhoran: '2', outcome: '1', yes: 0, no: 1, answered: 1 },
    { dhoran: 'B', outcome: '1', yes: 1, no: 0, answered: 1 },
  ]);
  assert.deepEqual(report.daily, [
    { date: '2026-10-02', submitted: 2 },
    { date: '2026-10-03', submitted: 1 },
  ]);
});

test('counts repeated saves as submissions by save date, but once for pending student status', () => {
  const schools = [{ id: 'school-a', code: '1', name: 'A', district: 'D', block: 'T' }];
  const enrollment = new Map([['school-a:B', 1]]);
  const entries = [
    { school_id: 'school-a', student_id: 'student-a', dhoran: 'B', updated_at: '2026-10-02T10:00:00Z', assessment_date: null },
    { school_id: 'school-a', student_id: 'student-a', dhoran: 'B', updated_at: '2026-10-02T11:00:00Z', assessment_date: null },
  ];

  const report = buildReportMetrics(schools, enrollment, entries, ['B']);

  assert.equal(report.schools[0].submitted, 1);
  assert.equal(report.schools[0].pending, 0);
  assert.equal(report.totals.submitted, 2);
  assert.deepEqual(report.daily, [{ date: '2026-10-02', submitted: 2 }]);
  assert.equal(entries[0].assessment_date, null);
});

test('lists enrolled students without a matching submission in the selected report period', () => {
  const schools = [
    { id: 'school-a', code: '2', name: 'A', district: 'D', block: 'T' },
    { id: 'school-b', code: '1', name: 'B', district: 'D', block: 'U' },
  ];
  const students = [
    { id: 'submitted', name: 'Submitted', school_id: 'school-a', dhoran: '2' },
    { id: 'pending-a', name: 'Pending A', school_id: 'school-a', dhoran: '2' },
    { id: 'pending-b', name: 'Pending B', school_id: 'school-b', dhoran: 'B' },
    { id: 'other-grade', name: 'Other Grade', school_id: 'school-a', dhoran: '1' },
  ];
  const entries = [{ student_id: 'submitted', school_id: 'school-a', dhoran: '2' }];

  assert.deepEqual(buildPendingStudents(schools, students, entries, ['B', '2']), [
    {
      schoolCode: '1',
      schoolName: 'B',
      district: 'D',
      block: 'U',
      studentId: 'pending-b',
      studentName: 'Pending B',
      dhoran: 'B',
    },
    {
      schoolCode: '2',
      schoolName: 'A',
      district: 'D',
      block: 'T',
      studentId: 'pending-a',
      studentName: 'Pending A',
      dhoran: '2',
    },
  ]);
});
