export function reportScope(profile) {
  if (!profile?.active) return null;
  if (profile.role === 'admin') return { role: 'admin' };
  if (profile.role === 'district'
    && typeof profile.district_code === 'string'
    && /^\d{4}$/.test(profile.district_code)) {
    return { role: 'district', districtCode: profile.district_code };
  }
  if (profile.role === 'block'
    && typeof profile.district_code === 'string'
    && /^\d{4}$/.test(profile.district_code)
    && typeof profile.block_code === 'string'
    && /^\d{6}$/.test(profile.block_code)
    && profile.block_code.slice(0, 4) === profile.district_code) {
    return {
      role: 'block',
      districtCode: profile.district_code,
      blockCode: profile.block_code,
    };
  }
  if (profile.role === 'school'
    && typeof profile.school_id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profile.school_id)) {
    return { role: 'school', schoolId: profile.school_id };
  }
  return null;
}

export function canAccessSchoolReport(scope, school) {
  if (!scope || !school) return false;
  if (scope.role === 'admin') return true;
  if (scope.role === 'school') return school.id === scope.schoolId;
  if (typeof school.code !== 'string' || !/^\d{11}$/.test(school.code)) return false;
  if (scope.role === 'district') return school.code.slice(0, 4) === scope.districtCode;
  return scope.role === 'block'
    && school.code.slice(0, 4) === scope.districtCode
    && school.code.slice(0, 6) === scope.blockCode;
}
