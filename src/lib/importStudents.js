// Portal ni Excel na column: SchoolId, StudentId, StudentName, FatherName, SurName, GENDER, GRNo, StudyingClass, Section ...

// StudyingClass ni kimat -> 'B' (Balvatika) | '1' | '2' | null (biju dhoran)
export function normDhoran(v) {
  let s = String(v ?? '').toLowerCase().trim();
  if (!s) return null;
  if (/બાલ|bal|\bbv\b|\bkg\b|pre|nurs/.test(s)) return 'B';
  if (s === '103') return 'B';
  s = s.replace(/[૧૨]/g, (c) => ({ '૧': '1', '૨': '2' }[c]));
  const m = s.match(/\d+/);
  if (m) return m[0] === '1' ? '1' : m[0] === '2' ? '2' : null;
  if (/^(i|one|first)$/.test(s)) return '1';
  if (/^(ii|two|second)$/.test(s)) return '2';
  return null;
}

// Header ma StudentName ane StudyingClass hoy to "portal format"
export function detectStandard(headers) {
  const h = {};
  for (const x of headers) h[String(x).toLowerCase().replace(/[\s_]/g, '')] = x;
  return h.studentname && h.studyingclass ? h : null;
}

const str = (x) => String(x ?? '').trim();

export function parseStandard(rows, h, schoolId) {
  const out = { list: [], other: 0, skipped: 0, noName: 0 };
  for (const r of rows) {
    if (h.schoolid && str(r[h.schoolid]) !== str(schoolId)) { out.other++; continue; }
    const d = normDhoran(r[h.studyingclass]);
    if (!d) { out.skipped++; continue; }
    // Gujarati rit: potanu naam + pitanu naam + atak
    const name = [r[h.studentname], r[h.fathername], r[h.surname]].map(str).filter(Boolean).join(' ');
    if (!name) { out.noName++; continue; }
    out.list.push({
      dhoran: d,
      name,
      reg: str(r[h.grno]) || str(r[h.studentid]),
      studentId: str(r[h.studentid]),
      gender: str(r[h.gender]),
      section: str(r[h.section]),
      schoolId: str(schoolId),
    });
  }
  return out;
}
