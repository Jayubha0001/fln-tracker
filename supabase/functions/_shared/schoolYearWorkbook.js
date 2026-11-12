import { GRADE_RULES } from './assessmentRules.js';
import { SCHOOL_YEAR_MONTHS } from './schoolYearReport.js';

// Central team mate: darek header Gujarati + English.
export const GRADES = ['B', '1', '2'];
export const GRADE_NAMES = { B: ['બાલવાટિકા', 'Balvatika'], '1': ['ધોરણ 1', 'Std 1'], '2': ['ધોરણ 2', 'Std 2'] };
const MONTH_EN = {
  '2026-06': 'Jun-26', '2026-07': 'Jul-26', '2026-08': 'Aug-26', '2026-09': 'Sep-26', '2026-10': 'Oct-26',
  '2026-11': 'Nov-26', '2026-12': 'Dec-26', '2027-01': 'Jan-27', '2027-02': 'Feb-27', '2027-03': 'Mar-27',
};
export const LABELS = {
  sr: ['ક્રમ', 'Sr. No.'],
  month: ['માસ', 'Month'],
  grade: ['ધોરણ', 'Class'],
  enrolled: ['નોંધાયેલા વિદ્યાર્થી', 'Enrolled Students'],
  saved: ['સાચવેલી એન્ટ્રી', 'Entries Saved'],
  complete: ['પૂર્ણ મૂલ્યાંકન', 'Assessment Completed'],
  incomplete: ['અપૂર્ણ એન્ટ્રી', 'Incomplete Entry'],
  absent: ['ગેરહાજર', 'Absent'],
  pending: ['બાકી (એન્ટ્રી નથી)', 'Pending (No Entry)'],
  uday: ['ઉદયમાન', 'Udayman (Emerging)'],
  pragati: ['પ્રગતિશીલ', 'Pragatishil (Progressing)'],
  nipun: ['નિપુણ', 'Nipun (Proficient)'],
  count: ['સંખ્યા', 'Count'],
  percent: ['ટકાવારી', '%'],
  total: ['કુલ', 'Total'],
};
export const bi = (pair, separator = '\n') => `${pair[0]}${separator}${pair[1]}`;
export const monthLabel = (month) => `${month.label} · ${MONTH_EN[month.key] || month.key}`;
export const pctOf = (count, total) => (total ? count / total : null);

export function gradeRanges(grade) {
  const rule = GRADE_RULES[grade];
  const total = rule.statementIds.length;
  return {
    total,
    uday: `0–${rule.udayMax}`,
    pragati: `${rule.udayMax + 1}–${rule.nipunMin - 1}`,
    nipun: `${rule.nipunMin}–${total}`,
  };
}

export function latestMonthIndex(gradeRows) {
  let latest = -1;
  SCHOOL_YEAR_MONTHS.forEach((_, index) => {
    if (GRADES.some((grade) => (gradeRows[grade]?.[index]?.saved || 0) > 0)) latest = index;
  });
  return latest;
}

function sumRows(rows) {
  return rows.reduce((total, row) => {
    for (const key of ['enrolled', 'saved', 'complete', 'incomplete', 'absent', 'pending', 'U', 'P', 'N']) total[key] += row[key] || 0;
    return total;
  }, { enrolled: 0, saved: 0, complete: 0, incomplete: 0, absent: 0, pending: 0, U: 0, P: 0, N: 0 });
}

const generatedText = (generatedAt) => {
  try {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(generatedAt);
  } catch {
    return String(generatedAt);
  }
};

// ---------- Plain fallback (SheetJS): same data, bilingual single-line headers ----------
export function schoolYearPlainTables({ school, gradeRows }) {
  const header = (pair) => bi(pair, ' / ');
  const tables = [{
    name: 'Info',
    rows: [
      [header(['માહિતી', 'Particular']), header(['વિગત', 'Details'])],
      [header(['શાળા', 'School']), `${school.name} (${school.code})`],
      [header(['જિલ્લો / તાલુકો', 'District / Block']), `${school.district} / ${school.block}`],
      [header(['ટકાવારીનો આધાર', 'Percentage basis']), 'ટકાવારી = સંખ્યા ÷ નોંધાયેલા વિદ્યાર્થી / % = count ÷ enrolled students'],
    ],
  }];
  for (const grade of GRADES) {
    const ranges = gradeRanges(grade);
    const head = [
      header(LABELS.month), header(LABELS.enrolled), header(LABELS.saved), header(LABELS.complete),
      header(LABELS.incomplete), header(LABELS.absent), header(LABELS.pending),
      `${header(LABELS.uday)} (${ranges.uday}) – ${header(LABELS.count)}`, `${header(LABELS.uday)} – ${header(LABELS.percent)}`,
      `${header(LABELS.pragati)} (${ranges.pragati}) – ${header(LABELS.count)}`, `${header(LABELS.pragati)} – ${header(LABELS.percent)}`,
      `${header(LABELS.nipun)} (${ranges.nipun}) – ${header(LABELS.count)}`, `${header(LABELS.nipun)} – ${header(LABELS.percent)}`,
    ];
    const pct = (count, total) => { const value = pctOf(count, total); return value === null ? '—' : `${Math.round(value * 1000) / 10}%`; };
    tables.push({
      name: `${GRADE_NAMES[grade][1]}`,
      rows: [head, ...gradeRows[grade].map((month) => [
        monthLabel(month), month.enrolled, month.saved, month.complete, month.incomplete, month.absent || 0, month.pending,
        month.U, pct(month.U, month.enrolled), month.P, pct(month.P, month.enrolled), month.N, pct(month.N, month.enrolled),
      ])],
    });
  }
  return tables;
}

// ---------- Styled report (ExcelJS) ----------
const FONT = 'Nirmala UI';
const NAVY = 'FF17306B';
const BLUE = 'FF2B66B4';
const PALE = 'FFEAF1FB';
const GREY = 'FF6B7B8C';
const TONES = {
  uday: { head: 'FFF5A024', fill: 'FFFFF1DC' },
  pragati: { head: 'FFE8509B', fill: 'FFFFE4F0' },
  nipun: { head: 'FF1EA45C', fill: 'FFE1F5E9' },
};
const thin = { style: 'thin', color: { argb: 'FFB8C6D8' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

function paint(cell, { value, bold = false, size = 10, color = 'FF14243A', fill, align = 'center', wrap = true, border = true, italic = false, numFmt } = {}) {
  if (value !== undefined) cell.value = value;
  cell.font = { name: FONT, size, bold, italic, color: { argb: color } };
  cell.alignment = { horizontal: align, vertical: 'middle', wrapText: wrap };
  if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  if (border) cell.border = BORDER;
  if (numFmt) cell.numFmt = numFmt;
}

function mergePaint(ws, range, options) {
  ws.mergeCells(range);
  const first = range.split(':')[0];
  paint(ws.getCell(first), options);
  // merged border / fill must be applied to every cell of the range
  const [start, end] = range.split(':');
  const decode = (ref) => ({ col: ref.replace(/\d+/g, ''), row: Number(ref.replace(/\D+/g, '')) });
  const colNum = (letters) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const a = decode(start);
  const b = decode(end);
  for (let row = a.row; row <= b.row; row += 1) {
    for (let col = colNum(a.col); col <= colNum(b.col); col += 1) {
      const cell = ws.getCell(row, col);
      if (options?.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: options.fill } };
      if (options?.border !== false) cell.border = BORDER;
    }
  }
}

function pageSetup(ws, { titleRows, landscape = true, fitHeight = 0 } = {}) {
  ws.pageSetup = {
    paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: fitHeight,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    horizontalCentered: true,
    ...(titleRows ? { printTitlesRow: titleRows } : {}),
  };
  ws.headerFooter = { oddFooter: '&L&8Nipun Gujarat – FLN Tracker&C&8Page &P of &N&R&8Printed &D' };
  ws.views = [{ ...ws.views?.[0], showGridLines: false }];
}

function titleBlock(ws, lastCol, titleGu, titleEn, school) {
  mergePaint(ws, `A1:${lastCol}1`, { value: titleGu, bold: true, size: 17, color: 'FFFFFFFF', fill: NAVY, border: false });
  mergePaint(ws, `A2:${lastCol}2`, { value: titleEn, bold: true, size: 11, color: 'FFFFFFFF', fill: BLUE, border: false });
  mergePaint(ws, `A3:${lastCol}3`, {
    value: `શાળા / School: ${school.name} (${school.code})   ·   જિલ્લો / District: ${school.district}   ·   તાલુકો / Block: ${school.block}`,
    size: 10, fill: PALE, color: 'FF14243A', align: 'left', border: false,
  });
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 20;
}

function headerCell(cell, pair, fill = NAVY, color = 'FFFFFFFF') {
  paint(cell, { value: bi(pair), bold: true, size: 10, color, fill });
}

function gradeSheet(workbook, grade, report) {
  const { school, gradeRows } = report;
  const ranges = gradeRanges(grade);
  const names = GRADE_NAMES[grade];
  const ws = workbook.addWorksheet(`${names[0]} - ${names[1]}`);
  pageSetup(ws, { titleRows: '5:6' });
  const widths = [6, 21, 14, 13, 14, 13, 12, 17, 12, 11, 13, 11, 11, 11];
  widths.forEach((width, index) => { ws.getColumn(index + 1).width = width; });
  titleBlock(ws, 'N', `${names[0]} – માસવાર FLN પરિણામ`, `${names[1]} – Month-wise FLN Result · 2026-27`, school);
  ws.getRow(4).height = 6;

  // two-level header (rows 5-6)
  const single = [['A', LABELS.sr], ['B', LABELS.month], ['C', LABELS.enrolled], ['D', LABELS.saved], ['E', LABELS.complete], ['F', LABELS.incomplete], ['G', LABELS.absent], ['H', LABELS.pending]];
  for (const [col, pair] of single) {
    ws.mergeCells(`${col}5:${col}6`);
    headerCell(ws.getCell(`${col}5`), pair);
    ws.getCell(`${col}6`).border = BORDER;
  }
  const groups = [['I', 'J', 'uday', LABELS.uday, ranges.uday], ['K', 'L', 'pragati', LABELS.pragati, ranges.pragati], ['M', 'N', 'nipun', LABELS.nipun, ranges.nipun]];
  for (const [a, b, tone, pair, range] of groups) {
    mergePaint(ws, `${a}5:${b}5`, { value: `${bi(pair)}\n(${range} / ${ranges.total})`, bold: true, fill: TONES[tone].head, color: 'FFFFFFFF' });
    paint(ws.getCell(`${a}6`), { value: bi(LABELS.count, ' / '), bold: true, fill: TONES[tone].fill });
    paint(ws.getCell(`${b}6`), { value: bi(LABELS.percent, ' / '), bold: true, fill: TONES[tone].fill });
  }
  ws.getRow(5).height = 56;
  ws.getRow(6).height = 30;

  gradeRows[grade].forEach((month, index) => {
    const row = 7 + index;
    const empty = month.saved === 0;
    const color = empty ? GREY : 'FF14243A';
    const zebra = index % 2 ? 'FFF7FAFE' : undefined;
    const values = [
      index + 1, monthLabel(month), month.enrolled, month.saved, month.complete, month.incomplete, month.absent || 0, month.pending,
      month.U, pctOf(month.U, month.enrolled), month.P, pctOf(month.P, month.enrolled), month.N, pctOf(month.N, month.enrolled),
    ];
    values.forEach((value, columnIndex) => {
      const isPercent = [9, 11, 13].includes(columnIndex);
      const tone = columnIndex >= 8 ? (columnIndex < 10 ? 'uday' : columnIndex < 12 ? 'pragati' : 'nipun') : null;
      paint(ws.getCell(row, columnIndex + 1), {
        value: isPercent && (value === null || empty) ? '—' : value,
        color: empty && columnIndex > 1 ? GREY : color,
        italic: empty && columnIndex > 1,
        bold: !empty && (columnIndex === 12 || columnIndex === 13),
        fill: tone && !empty ? TONES[tone].fill : zebra,
        align: columnIndex === 1 ? 'left' : 'center',
        numFmt: isPercent ? '0.0%' : undefined,
      });
    });
    ws.getRow(row).height = 20;
  });
  const lastDataRow = 6 + SCHOOL_YEAR_MONTHS.length;
  mergePaint(ws, `A${lastDataRow + 2}:N${lastDataRow + 2}`, {
    value: 'નોંધ / Note: ટકાવારી = સંખ્યા ÷ નોંધાયેલા વિદ્યાર્થી. અપૂર્ણ અને બાકી વિદ્યાર્થી ઉદયમાન/પ્રગતિશીલ/નિપુણમાં ગણાતા નથી; ગેરહાજર વિદ્યાર્થી “સાચવેલી એન્ટ્રી”માં ગણાય છે. '
      + '/ % = count ÷ enrolled students. Incomplete and pending students are not counted in the three levels; absent students are counted in “Entries Saved”.',
    size: 9, italic: true, color: GREY, align: 'left', border: false,
  });
  ws.getRow(lastDataRow + 2).height = 38;
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 6, showGridLines: false }];
}

function summarySheet(workbook, report, generatedAt) {
  const { school, gradeRows } = report;
  const ws = workbook.addWorksheet('સારાંશ - Summary');
  pageSetup(ws, { fitHeight: 1 });
  const widths = [26, 14, 13, 14, 13, 12, 17, 12, 11, 13, 11, 12, 11];
  widths.forEach((width, index) => { ws.getColumn(index + 1).width = width; });
  titleBlock(ws, 'M', 'ગણિત ટ્રેકર – વાર્ષિક શાળા FLN રિપોર્ટ 2026-27', 'Annual School FLN Report 2026-27 · Nipun Gujarat – FLN Action Plan', school);
  ws.getRow(4).height = 8;

  const info = [
    [['શાળાનું નામ', 'School Name'], school.name],
    [['શાળા કોડ', 'School Code'], school.code],
    [['જિલ્લો', 'District'], school.district],
    [['તાલુકો', 'Block (Taluka)'], school.block],
    [['રિપોર્ટ તારીખ', 'Report Generated On'], generatedText(generatedAt)],
  ];
  info.forEach(([pair, value], index) => {
    const row = 5 + index;
    mergePaint(ws, `A${row}:C${row}`, { value: bi(pair, ' / '), bold: true, fill: PALE, align: 'left' });
    mergePaint(ws, `D${row}:M${row}`, { value: String(value ?? ''), align: 'left' });
    ws.getRow(row).height = 20;
  });

  const latest = latestMonthIndex(gradeRows);
  const startRow = 12;
  mergePaint(ws, `A${startRow}:M${startRow}`, {
    value: latest >= 0
      ? `તાજેતરની સ્થિતિ / Latest Status – ${monthLabel(SCHOOL_YEAR_MONTHS[latest])}`
      : 'હજી કોઈ એન્ટ્રી નથી / No entries saved yet',
    bold: true, size: 12, color: 'FFFFFFFF', fill: NAVY, align: 'left',
  });
  ws.getRow(startRow).height = 24;

  // table header (2 rows)
  const headRow = startRow + 1;
  const singles = [['A', LABELS.grade], ['B', LABELS.enrolled], ['C', LABELS.saved], ['D', LABELS.complete], ['E', LABELS.incomplete], ['F', LABELS.absent], ['G', LABELS.pending]];
  for (const [col, pair] of singles) {
    ws.mergeCells(`${col}${headRow}:${col}${headRow + 1}`);
    headerCell(ws.getCell(`${col}${headRow}`), pair);
    ws.getCell(`${col}${headRow + 1}`).border = BORDER;
  }
  [['H', 'I', 'uday', LABELS.uday], ['J', 'K', 'pragati', LABELS.pragati], ['L', 'M', 'nipun', LABELS.nipun]].forEach(([a, b, tone, pair]) => {
    mergePaint(ws, `${a}${headRow}:${b}${headRow}`, { value: bi(pair), bold: true, fill: TONES[tone].head, color: 'FFFFFFFF' });
    paint(ws.getCell(`${a}${headRow + 1}`), { value: bi(LABELS.count, ' / '), bold: true, fill: TONES[tone].fill });
    paint(ws.getCell(`${b}${headRow + 1}`), { value: bi(LABELS.percent, ' / '), bold: true, fill: TONES[tone].fill });
  });
  ws.getRow(headRow).height = 56;
  ws.getRow(headRow + 1).height = 30;

  const rowsForTotal = [];
  GRADES.forEach((grade, index) => {
    const month = latest >= 0 ? gradeRows[grade][latest] : { enrolled: gradeRows[grade][0]?.enrolled || 0, saved: 0, complete: 0, incomplete: 0, absent: 0, pending: gradeRows[grade][0]?.enrolled || 0, U: 0, P: 0, N: 0 };
    rowsForTotal.push(month);
    const row = headRow + 2 + index;
    const values = [bi(GRADE_NAMES[grade], ' / '), month.enrolled, month.saved, month.complete, month.incomplete, month.absent || 0, month.pending,
      month.U, pctOf(month.U, month.enrolled), month.P, pctOf(month.P, month.enrolled), month.N, pctOf(month.N, month.enrolled)];
    values.forEach((value, columnIndex) => {
      const isPercent = [8, 10, 12].includes(columnIndex);
      const tone = columnIndex >= 7 ? (columnIndex < 9 ? 'uday' : columnIndex < 11 ? 'pragati' : 'nipun') : null;
      paint(ws.getCell(row, columnIndex + 1), {
        value: isPercent && value === null ? '—' : value, bold: columnIndex === 0 || columnIndex === 11 || columnIndex === 12,
        align: columnIndex === 0 ? 'left' : 'center', fill: tone ? TONES[tone].fill : undefined, numFmt: isPercent ? '0.0%' : undefined,
      });
    });
    ws.getRow(row).height = 22;
  });
  const total = sumRows(rowsForTotal);
  const totalRow = headRow + 2 + GRADES.length;
  [bi(LABELS.total, ' / '), total.enrolled, total.saved, total.complete, total.incomplete, total.absent, total.pending,
    total.U, pctOf(total.U, total.enrolled), total.P, pctOf(total.P, total.enrolled), total.N, pctOf(total.N, total.enrolled)].forEach((value, columnIndex) => {
    const isPercent = [8, 10, 12].includes(columnIndex);
    paint(ws.getCell(totalRow, columnIndex + 1), {
      value: isPercent && value === null ? '—' : value, bold: true, fill: 'FFDCE6F4', align: columnIndex === 0 ? 'left' : 'center', numFmt: isPercent ? '0.0%' : undefined,
    });
  });
  ws.getRow(totalRow).height = 24;

  // Month-wise Nipun %
  const trendStart = totalRow + 2;
  mergePaint(ws, `A${trendStart}:M${trendStart}`, {
    value: 'માસવાર નિપુણ ટકાવારી / Month-wise Nipun % (નોંધાયેલા વિદ્યાર્થીના આધારે / of enrolled students)',
    bold: true, size: 12, color: 'FFFFFFFF', fill: NAVY, align: 'left',
  });
  ws.getRow(trendStart).height = 24;
  const trendHead = trendStart + 1;
  headerCell(ws.getCell(`A${trendHead}`), LABELS.month);
  GRADES.forEach((grade, index) => {
    ws.mergeCells(`${['B', 'D', 'F'][index]}${trendHead}:${['C', 'E', 'G'][index]}${trendHead}`);
    headerCell(ws.getCell(`${['B', 'D', 'F'][index]}${trendHead}`), GRADE_NAMES[grade], TONES.nipun.head);
    ws.getCell(`${['C', 'E', 'G'][index]}${trendHead}`).border = BORDER;
  });
  mergePaint(ws, `H${trendHead}:I${trendHead}`, { value: bi(['બધા ધોરણ', 'All Classes']), bold: true, fill: NAVY, color: 'FFFFFFFF' });
  ws.getRow(trendHead).height = 34;
  SCHOOL_YEAR_MONTHS.forEach((month, index) => {
    const row = trendHead + 1 + index;
    paint(ws.getCell(`A${row}`), { value: monthLabel(month), align: 'left', bold: true });
    GRADES.forEach((grade, gradeIndex) => {
      const first = ['B', 'D', 'F'][gradeIndex];
      const last = ['C', 'E', 'G'][gradeIndex];
      const entry = gradeRows[grade][index];
      ws.mergeCells(`${first}${row}:${last}${row}`);
      const value = entry.saved ? pctOf(entry.N, entry.enrolled) : null;
      paint(ws.getCell(`${first}${row}`), { value: value === null ? '—' : value, numFmt: '0.0%', color: value === null ? GREY : 'FF14243A' });
      ws.getCell(`${last}${row}`).border = BORDER;
    });
    const all = sumRows(GRADES.map((grade) => gradeRows[grade][index]));
    ws.mergeCells(`H${row}:I${row}`);
    const allValue = all.saved ? pctOf(all.N, all.enrolled) : null;
    paint(ws.getCell(`H${row}`), { value: allValue === null ? '—' : allValue, numFmt: '0.0%', bold: true, color: allValue === null ? GREY : 'FF14243A' });
    ws.getCell(`I${row}`).border = BORDER;
    ws.getRow(row).height = 20;
  });
  ws.addConditionalFormatting({
    ref: `B${trendHead + 1}:I${trendHead + SCHOOL_YEAR_MONTHS.length}`,
    rules: [{ type: 'colorScale', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: [{ argb: 'FFFFFFFF' }, { argb: 'FF7DD3A0' }] }],
  });
}

function actionPlanSheet(workbook, report) {
  const { school, gradeRows } = report;
  const ws = workbook.addWorksheet('FLN Action Plan');
  pageSetup(ws, { titleRows: '5:6' });
  const perGrade = 9;
  const lastCol = (index) => {
    let n = index; let s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };
  const totalCols = 1 + perGrade * GRADES.length;
  ws.getColumn(1).width = 23;
  for (let col = 2; col <= totalCols; col += 1) ws.getColumn(col).width = 10.5;
  titleBlock(ws, lastCol(totalCols), 'FLN એક્શન પ્લાન – માસ × ધોરણ', 'FLN Action Plan – Month × Class Matrix · 2026-27', school);
  ws.getRow(4).height = 6;
  ws.mergeCells('A5:A6');
  headerCell(ws.getCell('A5'), LABELS.month);
  ws.getCell('A6').border = BORDER;
  const sub = [LABELS.enrolled, LABELS.saved, LABELS.absent, [`${LABELS.uday[0]} સંખ્યા`, `${LABELS.uday[1].split(' ')[0]} Count`], [`${LABELS.uday[0]} %`, `${LABELS.uday[1].split(' ')[0]} %`],
    [`${LABELS.pragati[0]} સંખ્યા`, `${LABELS.pragati[1].split(' ')[0]} Count`], [`${LABELS.pragati[0]} %`, `${LABELS.pragati[1].split(' ')[0]} %`],
    [`${LABELS.nipun[0]} સંખ્યા`, `${LABELS.nipun[1].split(' ')[0]} Count`], [`${LABELS.nipun[0]} %`, `${LABELS.nipun[1].split(' ')[0]} %`]];
  GRADES.forEach((grade, gradeIndex) => {
    const startCol = 2 + gradeIndex * perGrade;
    mergePaint(ws, `${lastCol(startCol)}5:${lastCol(startCol + perGrade - 1)}5`, { value: bi(GRADE_NAMES[grade], ' / '), bold: true, size: 11, color: 'FFFFFFFF', fill: [NAVY, BLUE, 'FF3A7CC4'][gradeIndex] });
    sub.forEach((pair, offset) => {
      const tone = offset >= 7 ? 'nipun' : offset >= 5 ? 'pragati' : offset >= 3 ? 'uday' : null;
      paint(ws.getCell(6, startCol + offset), { value: bi(pair), bold: true, size: 9, fill: tone ? TONES[tone].fill : PALE });
    });
  });
  ws.getRow(5).height = 24;
  ws.getRow(6).height = 44;
  SCHOOL_YEAR_MONTHS.forEach((month, index) => {
    const row = 7 + index;
    paint(ws.getCell(row, 1), { value: monthLabel(month), align: 'left', bold: true });
    GRADES.forEach((grade, gradeIndex) => {
      const startCol = 2 + gradeIndex * perGrade;
      const entry = gradeRows[grade][index];
      const empty = entry.saved === 0;
      [entry.enrolled, entry.saved, entry.absent || 0, entry.U, pctOf(entry.U, entry.enrolled), entry.P, pctOf(entry.P, entry.enrolled), entry.N, pctOf(entry.N, entry.enrolled)].forEach((value, offset) => {
        const isPercent = [4, 6, 8].includes(offset);
        paint(ws.getCell(row, startCol + offset), { value: isPercent && (value === null || empty) ? '—' : value, numFmt: isPercent ? '0.0%' : undefined, color: empty && offset > 1 ? GREY : 'FF14243A' });
      });
    });
    ws.getRow(row).height = 20;
  });
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 6, showGridLines: false }];
}

function criteriaSheet(workbook, report) {
  const ws = workbook.addWorksheet('માપદંડ - Criteria');
  pageSetup(ws, { landscape: false });
  [24, 16, 22, 22, 22].forEach((width, index) => { ws.getColumn(index + 1).width = width; });
  titleBlock(ws, 'E', 'FLN માપદંડ અને સમજૂતી', 'FLN Criteria & Definitions', report.school);
  ws.getRow(4).height = 6;
  [['A', LABELS.grade], ['B', ['કુલ વિધાન', 'Total Statements']], ['C', ['ઉદયમાન (✓ વિધાન)', 'Udayman (✓ statements)']], ['D', ['પ્રગતિશીલ (✓ વિધાન)', 'Pragatishil (✓ statements)']], ['E', ['નિપુણ (✓ વિધાન)', 'Nipun (✓ statements)']]]
    .forEach(([col, pair], index) => headerCell(ws.getCell(`${col}5`), pair, [NAVY, NAVY, TONES.uday.head, TONES.pragati.head, TONES.nipun.head][index]));
  ws.getRow(5).height = 40;
  GRADES.forEach((grade, index) => {
    const ranges = gradeRanges(grade);
    const row = 6 + index;
    [bi(GRADE_NAMES[grade], ' / '), ranges.total, ranges.uday, ranges.pragati, ranges.nipun].forEach((value, columnIndex) => {
      paint(ws.getCell(row, columnIndex + 1), { value, bold: columnIndex === 0, align: columnIndex === 0 ? 'left' : 'center', fill: columnIndex >= 2 ? TONES[['uday', 'pragati', 'nipun'][columnIndex - 2]].fill : undefined });
    });
    ws.getRow(row).height = 22;
  });
  const definitions = [
    [['નોંધાયેલા વિદ્યાર્થી', 'Enrolled Students'], 'શાળામાં તે ધોરણમાં નોંધાયેલા કુલ વિદ્યાર્થી. / Total students registered in that class.'],
    [['સાચવેલી એન્ટ્રી', 'Entries Saved'], 'તે માસ માટે જેની એન્ટ્રી સેવ થઈ (ગેરહાજર સહિત). / Students whose entry for the month is saved (including absent).'],
    [['પૂર્ણ મૂલ્યાંકન', 'Assessment Completed'], 'બધા વિધાનોના હા/ના જવાબ ભરેલા હોય. / Yes/No filled for every statement.'],
    [['અપૂર્ણ એન્ટ્રી', 'Incomplete Entry'], 'એન્ટ્રી છે પણ બધા વિધાનોના જવાબ નથી. / Entry exists but some statements are unanswered.'],
    [['ગેરહાજર', 'Absent'], 'વિદ્યાર્થી શાળામાં નોંધાયેલ છે પણ તે માસની પરીક્ષામાં હાજર ન હતો. / Student is on roll but did not appear for that month’s assessment.'],
    [['બાકી (એન્ટ્રી નથી)', 'Pending (No Entry)'], 'તે માસની કોઈ એન્ટ્રી થઈ નથી. / No entry saved for the month.'],
    [['ટકાવારી', 'Percentage'], 'સંખ્યા ÷ નોંધાયેલા વિદ્યાર્થી. અપૂર્ણ, ગેરહાજર અને બાકી વિદ્યાર્થી ત્રણ સ્તરમાં ગણાતા નથી. / Count ÷ enrolled students. Incomplete, absent and pending students are not counted in the three levels.'],
  ];
  const defStart = 6 + GRADES.length + 1;
  mergePaint(ws, `A${defStart}:E${defStart}`, { value: 'વ્યાખ્યાઓ / Definitions', bold: true, size: 12, color: 'FFFFFFFF', fill: NAVY, align: 'left' });
  ws.getRow(defStart).height = 24;
  definitions.forEach(([pair, text], index) => {
    const row = defStart + 1 + index;
    paint(ws.getCell(`A${row}`), { value: bi(pair, ' / '), bold: true, fill: PALE, align: 'left' });
    mergePaint(ws, `B${row}:E${row}`, { value: text, align: 'left' });
    ws.getRow(row).height = 44;
  });
}

export function buildSchoolYearWorkbook(ExcelJS, report, { generatedAt = new Date() } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FLN Tracker – Nipun Gujarat';
  workbook.title = `Annual School FLN Report 2026-27 – ${report.school.code}`;
  workbook.created = generatedAt;
  summarySheet(workbook, report, generatedAt);
  for (const grade of GRADES) gradeSheet(workbook, grade, report);
  actionPlanSheet(workbook, report);
  criteriaSheet(workbook, report);
  return workbook;
}
