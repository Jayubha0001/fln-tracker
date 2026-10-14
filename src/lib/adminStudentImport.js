import * as XLSX from '@e965/xlsx';
import { normDhoran } from './importStudents.js';

const COLUMN_ALIASES = {
  district: ['district'],
  block: ['block', 'taluka'],
  clusterId: ['clusterid'],
  cluster: ['cluster'],
  schoolCode: ['schoolid', 'udisecode', 'schoolcode'],
  schoolName: ['school'],
  studentName: ['studentname'],
  fatherName: ['fathername'],
  surname: ['surname'],
  dhoran: ['studyingclass'],
  section: ['section'],
  gender: ['gender'],
  grNo: ['grno'],
};

const normalizeHeader = (header) => String(header ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function identifierText(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return '';
    return String(value);
  }
  return String(value ?? '').trim();
}

export function normalizeSchoolCode(value) {
  return identifierText(value);
}

export function normalizeGrNo(value) {
  return identifierText(value);
}

export function parseAdminStudentWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('ફાઈલમાં worksheet મળી નથી.');

  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  });
  if (matrix.length < 2) throw new Error('ફાઈલમાં વિદ્યાર્થી records મળ્યા નથી.');

  const headers = matrix[0].map(normalizeHeader);
  const indexes = Object.fromEntries(
    Object.entries(COLUMN_ALIASES).map(([field, aliases]) => [
      field,
      headers.findIndex((header) => aliases.includes(header)),
    ])
  );
  const required = ['schoolCode', 'studentName', 'dhoran', 'grNo'];
  const missing = required.filter((field) => indexes[field] < 0);
  if (missing.length) {
    throw new Error('ફાઈલમાં જરૂરી SchoolId, StudentName, StudyingClass અથવા GRNo કૉલમ મળ્યો નથી.');
  }

  const records = matrix.slice(1).map((cells, index) => {
    const read = (field) => {
      const index = indexes[field];
      return index < 0 ? '' : cells[index] ?? '';
    };
    const schoolCode = normalizeSchoolCode(read('schoolCode'));
    const grNo = normalizeGrNo(read('grNo'));
    const studentName = String(read('studentName') ?? '').trim();
    const fatherName = String(read('fatherName') ?? '').trim();
    const surname = String(read('surname') ?? '').trim();
    const classValue = String(read('dhoran') ?? '').trim();
    const name = [studentName, fatherName, surname].filter(Boolean).join(' ');

    return {
      rowNumber: index + 2,
      schoolCode,
      schoolName: String(read('schoolName') ?? '').trim(),
      district: String(read('district') ?? '').trim(),
      block: String(read('block') ?? '').trim(),
      cluster: String(read('cluster') ?? '').trim(),
      studentName,
      dhoran: normDhoran(classValue),
      hasClassValue: Boolean(classValue),
      grNo,
      name,
      gender: String(read('gender') ?? '').trim(),
      section: String(read('section') ?? '').trim(),
    };
  });

  return records;
}

export async function loadExistingStudentKeys(supabase, schoolIds) {
  if (!schoolIds.length) return new Set();
  const keys = new Set();
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('students')
      .select('id, school_id, reg, student_id')
      .in('school_id', schoolIds)
      .order('school_id')
      .order('id')
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    for (const student of data || []) {
      for (const value of [student.reg, student.student_id]) {
        const grNo = normalizeGrNo(value);
        if (grNo) keys.add(`${student.school_id}|${grNo}`);
      }
    }
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  return keys;
}

export function buildAdminStudentPreview(records, schools, existingKeys) {
  const schoolsByCode = new Map();
  const ambiguousCodes = new Set();
  for (const school of schools.filter((row) => row.active)) {
    const code = normalizeSchoolCode(school.code);
    if (schoolsByCode.has(code)) {
      schoolsByCode.delete(code);
      ambiguousCodes.add(code);
    } else if (!ambiguousCodes.has(code)) {
      schoolsByCode.set(code, school);
    }
  }
  const unmatchedByCode = new Map();
  const seenInFile = new Set();
  const preview = {
    totalRows: records.length,
    validRows: [],
    duplicateRecords: 0,
    unmatchedRecords: 0,
    unmatchedSchools: [],
    invalidRecords: 0,
    unsupportedClassRecords: 0,
    matchedSchoolCounts: {},
  };

  for (const record of records) {
    const hasRequiredValues = Boolean(record.schoolCode && record.grNo && record.studentName);
    if (!hasRequiredValues || !record.hasClassValue) {
      preview.invalidRecords += 1;
    }

    const school = schoolsByCode.get(record.schoolCode);
    if (record.schoolCode && !school) {
      preview.unmatchedRecords += 1;
      const current = unmatchedByCode.get(record.schoolCode) || {
        code: record.schoolCode,
        name: record.schoolName,
        reason: ambiguousCodes.has(record.schoolCode) ? 'database-ambiguous' : 'database-code-not-found',
        rows: 0,
      };
      current.rows += 1;
      unmatchedByCode.set(record.schoolCode, current);
    }

    if (record.hasClassValue && !record.dhoran) {
      preview.unsupportedClassRecords += 1;
    }

    const fileKey = record.schoolCode && record.grNo
      ? `${record.schoolCode}|${record.grNo}`
      : '';
    const schoolStudentKey = school && record.grNo ? `${school.id}|${record.grNo}` : '';
    const duplicate = Boolean(
      (fileKey && seenInFile.has(fileKey))
      || (schoolStudentKey && existingKeys.has(schoolStudentKey))
    );
    if (fileKey) seenInFile.add(fileKey);
    if (duplicate) preview.duplicateRecords += 1;

    if (!school || !hasRequiredValues || !record.dhoran || duplicate) {
      continue;
    }
    preview.validRows.push({
      rowNumber: record.rowNumber,
      schoolId: school.id,
      schoolCode: normalizeSchoolCode(school.code),
      schoolName: school.name,
      district: school.district,
      block: school.block,
      cluster: school.cluster,
      grNo: record.grNo,
      dhoran: record.dhoran,
      name: record.name,
      gender: record.gender,
      section: record.section,
    });
    preview.matchedSchoolCounts[school.id] = {
      id: school.id,
      code: normalizeSchoolCode(school.code),
      name: school.name,
      district: school.district,
      block: school.block,
      rows: (preview.matchedSchoolCounts[school.id]?.rows || 0) + 1,
    };
  }

  preview.unmatchedSchools = [...unmatchedByCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  preview.matchedSchools = Object.values(preview.matchedSchoolCounts)
    .sort((a, b) => a.code.localeCompare(b.code));
  delete preview.matchedSchoolCounts;
  return preview;
}
