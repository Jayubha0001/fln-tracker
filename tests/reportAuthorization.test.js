import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessSchoolReport, reportScope } from '../supabase/functions/_shared/reportAuthorization.js';

const districtSchool = { id: 'school-a', code: '24280100001' };
const otherDistrictSchool = { id: 'school-b', code: '25100100001' };
const otherBlockSchool = { id: 'school-c', code: '24280200001' };

test('limits district report access to schools with its district code', () => {
  const scope = reportScope({ role: 'district', active: true, district_code: '2428' });
  assert.equal(canAccessSchoolReport(scope, districtSchool), true);
  assert.equal(canAccessSchoolReport(scope, otherDistrictSchool), false);
});

test('limits block report access to schools with both matching district and block codes', () => {
  const scope = reportScope({ role: 'block', active: true, district_code: '2428', block_code: '242801' });
  assert.equal(canAccessSchoolReport(scope, districtSchool), true);
  assert.equal(canAccessSchoolReport(scope, otherBlockSchool), false);
  assert.equal(canAccessSchoolReport(scope, otherDistrictSchool), false);
});

test('limits school report access to the profile school id and admin scope to active admins', () => {
  const scope = reportScope({
    role: 'school',
    active: true,
    school_id: '11111111-1111-4111-8111-111111111111',
  });
  assert.equal(canAccessSchoolReport(scope, {
    id: '11111111-1111-4111-8111-111111111111',
    code: '24280100001',
  }), true);
  assert.equal(canAccessSchoolReport(scope, districtSchool), false);
  assert.deepEqual(reportScope({ role: 'admin', active: true }), { role: 'admin' });
  assert.equal(reportScope({ role: 'admin', active: false }), null);
});

test('rejects malformed and inconsistent district/block profile scopes', () => {
  assert.equal(reportScope({ role: 'district', active: true, district_code: '242801' }), null);
  assert.equal(reportScope({ role: 'block', active: true, district_code: '2428', block_code: '251001' }), null);
  assert.equal(reportScope({ role: 'school', active: true, school_id: 'not-a-uuid' }), null);
});
