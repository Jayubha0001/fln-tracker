const REQUIRED_HEADERS = ['district', 'block', 'clusterid', 'cluster', 'schoolid', 'school'];

function normalizeHeader(value) {
  return String(value ?? '').replace(/[\s_-]+/g, '').toLowerCase();
}

function stringValue(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return '';
}

export function parseSchoolRows(rows) {
  const headers = (rows[0] || []).map(normalizeHeader);
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`ફાઈલમાં જરૂરી columns નથી: ${missing.join(', ')}.`);
  const column = Object.fromEntries(REQUIRED_HEADERS.map((header) => [header, headers.indexOf(header)]));
  return rows.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    district: stringValue(cells[column.district]),
    block: stringValue(cells[column.block]),
    clusterId: stringValue(cells[column.clusterid]),
    cluster: stringValue(cells[column.cluster]),
    schoolId: stringValue(cells[column.schoolid]),
    school: stringValue(cells[column.school]),
  })).filter((row) => Object.entries(row).some(([key, value]) => key !== 'rowNumber' && value !== ''));
}
