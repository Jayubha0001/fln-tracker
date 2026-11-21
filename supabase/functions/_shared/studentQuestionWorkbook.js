import { GRADE_RULES } from './assessmentRules.js';
import { ALL } from './statements.js';
import {
  BLUE, BORDER, FONT, GREY, GRADE_NAMES, LABELS, NAVY, PALE, TONES, bi, generatedText, headerCell, mergePaint, monthLabel, paint, pageSetup, pctOf, titleBlock,
} from './schoolYearWorkbook.js';
import { QUESTION_GRADES, questionStats, statusCounts } from './studentQuestionReport.js';
import { SCHOOL_YEAR_MONTHS } from './schoolYearReport.js';

const STATUS_TEXT = {
  U: ['ઉદયમાન', 'Udayman'], P: ['પ્રગતિશીલ', 'Pragatishil'], N: ['નિપુણ', 'Nipun'],
  incomplete: ['અપૂર્ણ', 'Incomplete'], absent: ['ગેરહાજર', 'Absent'], pending: ['બાકી', 'Pending'],
};
const statusKey = (row) => (row.status === 'complete' ? row.category : row.status);
const resultText = (row) => bi(STATUS_TEXT[statusKey(row)], ' / ');
const RESULT_FILL = { U: TONES.uday.fill, P: TONES.pragati.fill, N: TONES.nipun.fill, incomplete: 'FFF1F1F1', absent: 'FFECEFF3', pending: 'FFFFFFFF' };
const colLetter = (n) => { let s = ''; let x = n; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); } return s; };
const textOf = (id) => ALL.find((item) => item.n === id);

export function studentQuestionMeta({ level, district = '', block = '', school = null, month, generatedAt = new Date() }) {
  const month_ = SCHOOL_YEAR_MONTHS.find((item) => item.key === month);
  const monthText = month_ ? monthLabel(month_) : month;
  const place = level === 'school' ? `શાળા / School: ${school?.name} (${school?.code})   ·   જિલ્લો / District: ${school?.district}   ·   તાલુકો / Block: ${school?.block}`
    : level === 'state' ? 'ગુજરાત / Gujarat' : level === 'district' ? `જિલ્લો / District: ${district}` : `જિલ્લો / District: ${district}   ·   તાલુકો / Block: ${block}`;
  return { monthText, place, generatedAt };
}

export function studentQuestionPlainTables(data, meta) {
  const tables = [];
  for (const grade of QUESTION_GRADES) {
    const rows = data[grade] || [];
    if (!rows.length) continue;
    const ids = GRADE_RULES[grade].statementIds;
    const head = [bi(LABELS.sr, ' / '), 'જિલ્લો / District', 'તાલુકો / Block', 'શાળા કોડ / School Code', 'શાળા / School', 'વિદ્યાર્થી / Student', 'રજિસ્ટર નં. / Reg No.',
      ...ids.map((id) => `Q${id}`), 'હા / Yes', 'જવાબ / Answered', 'પરિણામ / Result', 'તારીખ / Date'];
    tables.push({
      name: GRADE_NAMES[grade][1],
      rows: [head, ...rows.map((row, index) => [index + 1, row.school.district, row.school.block, row.school.code, row.school.name, row.name, row.reg,
        ...ids.map((id) => (typeof row.answers[id] === 'boolean' ? (row.answers[id] ? '✓' : '✗') : '')), row.yes, row.answered, resultText(row), row.date])],
    });
  }
  tables.push({
    name: 'Question Key',
    rows: [['Q', 'વિધાન / Statement'], ...ALL.map((item) => [`Q${item.n}`, item.text])],
  });
  void meta;
  return tables;
}

function gradeSheet(workbook, grade, rows, meta) {
  const names = GRADE_NAMES[grade];
  const ids = GRADE_RULES[grade].statementIds;
  const ws = workbook.addWorksheet(`${names[0]} - ${names[1]}`);
  pageSetup(ws, { titleRows: '5:6' });
  const fixed = [
    ['sr', LABELS.sr, 6], ['district', ['જિલ્લો', 'District'], 12], ['block', ['તાલુકો', 'Block'], 13], ['code', ['શાળા કોડ', 'School Code'], 14],
    ['school', ['શાળા', 'School'], 38], ['student', ['વિદ્યાર્થી', 'Student'], 38], ['reg', ['રજિસ્ટર નં.', 'Reg. No.'], 11],
  ];
  const qStart = fixed.length + 1;
  const qEnd = qStart + ids.length - 1;
  const tail = [['yes', ['હા', 'Yes'], 7], ['answered', ['જવાબ', 'Answered'], 11], ['result', ['પરિણામ', 'Result'], 20], ['date', ['તારીખ', 'Date'], 12]];
  const lastCol = qEnd + tail.length;
  fixed.forEach(([, , width], index) => { ws.getColumn(index + 1).width = width; });
  ids.forEach((_, index) => { ws.getColumn(qStart + index).width = 6.5; });
  tail.forEach(([, , width], index) => { ws.getColumn(qEnd + 1 + index).width = width; });

  titleBlock(ws, colLetter(lastCol), `${names[0]} – વિદ્યાર્થી-વાર વિધાન રિપોર્ટ · ${meta.monthText}`, `${names[1]} – Student-wise Question Report · ${meta.monthText}`, meta.place);
  ws.getRow(4).height = 6;
  fixed.forEach(([, pair], index) => {
    ws.mergeCells(5, index + 1, 6, index + 1);
    headerCell(ws.getCell(5, index + 1), pair);
    ws.getCell(6, index + 1).border = BORDER;
  });
  ids.forEach((id, index) => {
    const area = textOf(id);
    headerCell(ws.getCell(5, qStart + index), [`Q${id}`, ''], BLUE);
    ws.getCell(5, qStart + index).value = `Q${id}`;
    const cell = ws.getCell(6, qStart + index);
    paint(cell, { value: area?.text || '', size: 8, fill: PALE, bold: false });
    cell.alignment = { textRotation: 90, vertical: 'bottom', horizontal: 'center', wrapText: true };
  });
  tail.forEach(([, pair], index) => {
    ws.mergeCells(5, qEnd + 1 + index, 6, qEnd + 1 + index);
    headerCell(ws.getCell(5, qEnd + 1 + index), pair);
    ws.getCell(6, qEnd + 1 + index).border = BORDER;
  });
  ws.getRow(5).height = 24;
  ws.getRow(6).height = 190;

  rows.forEach((row, index) => {
    const r = 7 + index;
    const away = row.status === 'absent';
    const idle = row.status === 'pending';
    const zebra = index % 2 ? 'FFF7FAFE' : undefined;
    const base = { fill: away ? 'FFECEFF3' : zebra, color: away || idle ? GREY : 'FF14243A', italic: away || idle };
    [index + 1, row.school.district, row.school.block, row.school.code, row.school.name, row.name, row.reg].forEach((value, columnIndex) => {
      paint(ws.getCell(r, columnIndex + 1), { ...base, value, align: [4, 5].includes(columnIndex) ? 'left' : columnIndex >= 1 && columnIndex <= 3 ? 'left' : 'center', wrap: false, size: 10 });
    });
    ws.getCell(r, 6).alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
    ids.forEach((id, qIndex) => {
      const value = row.answers[id];
      const cell = ws.getCell(r, qStart + qIndex);
      paint(cell, {
        value: value === true ? '✓' : value === false ? '✗' : '',
        bold: typeof value === 'boolean', size: 11,
        color: value === true ? 'FF14783F' : value === false ? 'FFB02A2A' : GREY,
        fill: away ? 'FFECEFF3' : value === true ? 'FFE1F5E9' : value === false ? 'FFFFE4E4' : zebra,
      });
    });
    paint(ws.getCell(r, qEnd + 1), { ...base, value: away || idle ? '' : row.yes, bold: true });
    paint(ws.getCell(r, qEnd + 2), { ...base, value: away || idle ? '' : `${row.answered}/${row.total}` });
    paint(ws.getCell(r, qEnd + 3), { ...base, value: resultText(row), bold: row.status === 'complete', fill: RESULT_FILL[statusKey(row)] || base.fill, wrap: false });
    paint(ws.getCell(r, qEnd + 4), { ...base, value: row.date });
    ws.getRow(r).height = 19;
  });

  // question-wise "Yes %" footer
  const footer = 7 + rows.length;
  mergePaint(ws, `A${footer}:${colLetter(qStart - 1)}${footer}`, { value: 'હા % (જવાબ આપેલામાંથી) / Yes % (of answered)', bold: true, fill: 'FFDCE6F4', align: 'right' });
  questionStats(rows, ids).forEach((stat, index) => {
    paint(ws.getCell(footer, qStart + index), { value: stat.percent === null ? '—' : stat.percent, numFmt: '0%', bold: true, fill: 'FFDCE6F4', size: 9 });
  });
  for (let c = qEnd + 1; c <= lastCol; c += 1) paint(ws.getCell(footer, c), { value: '', fill: 'FFDCE6F4' });
  ws.getRow(footer).height = 22;
  if (rows.length) ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: lastCol } };
  ws.views = [{ state: 'frozen', xSplit: 6, ySplit: 6, showGridLines: false }];
}

function summarySheet(workbook, data, meta) {
  const ws = workbook.addWorksheet('સારાંશ - Summary');
  pageSetup(ws, { fitHeight: 1 });
  [28, 14, 13, 13, 13, 12, 13, 13, 13].forEach((width, index) => { ws.getColumn(index + 1).width = width; });
  titleBlock(ws, 'I', `વિદ્યાર્થી-વાર વિધાન રિપોર્ટ – સારાંશ · ${meta.monthText}`, `Student-wise Question Report – Summary · ${meta.monthText} · Nipun Gujarat`, meta.place);
  ws.getRow(4).height = 6;
  const heads = [['ધોરણ', 'Class'], ['વિદ્યાર્થી', 'Students'], LABELS.complete, LABELS.incomplete, LABELS.absent, LABELS.pending, LABELS.uday, LABELS.pragati, LABELS.nipun];
  heads.forEach((pair, index) => headerCell(ws.getCell(5, index + 1), pair, index === 6 ? TONES.uday.head : index === 7 ? TONES.pragati.head : index === 8 ? TONES.nipun.head : NAVY));
  ws.getRow(5).height = 46;
  let total = { total: 0, complete: 0, incomplete: 0, absent: 0, pending: 0, U: 0, P: 0, N: 0 };
  QUESTION_GRADES.forEach((grade, index) => {
    const counts = statusCounts(data[grade] || []);
    total = Object.fromEntries(Object.keys(total).map((key) => [key, total[key] + counts[key]]));
    [bi(GRADE_NAMES[grade], ' / '), counts.total, counts.complete, counts.incomplete, counts.absent, counts.pending, counts.U, counts.P, counts.N].forEach((value, column) => {
      paint(ws.getCell(6 + index, column + 1), { value, bold: column === 0, align: column === 0 ? 'left' : 'center', fill: column >= 6 ? [TONES.uday.fill, TONES.pragati.fill, TONES.nipun.fill][column - 6] : undefined });
    });
    ws.getRow(6 + index).height = 22;
  });
  [bi(LABELS.total, ' / '), total.total, total.complete, total.incomplete, total.absent, total.pending, total.U, total.P, total.N].forEach((value, column) => {
    paint(ws.getCell(9, column + 1), { value, bold: true, fill: 'FFDCE6F4', align: column === 0 ? 'left' : 'center' });
  });
  mergePaint(ws, 'A11:I11', {
    value: 'નિપુણ % / Nipun %: ' + (total.total ? `${Math.round((pctOf(total.N, total.total) || 0) * 1000) / 10}%` : '—')
      + `   ·   રિપોર્ટ તારીખ / Generated: ${generatedText(meta.generatedAt)}`,
    size: 10, italic: true, color: GREY, align: 'left', border: false,
  });
}

function keySheet(workbook) {
  const ws = workbook.addWorksheet('વિધાન યાદી - Question Key');
  pageSetup(ws, { landscape: false });
  [8, 28, 90, 18].forEach((width, index) => { ws.getColumn(index + 1).width = width; });
  ws.mergeCells('A1:D1');
  paint(ws.getCell('A1'), { value: 'વિધાન યાદી / Question Key', bold: true, size: 15, color: 'FFFFFFFF', fill: NAVY, border: false });
  ws.getRow(1).height = 28;
  [['ક્રમ', 'Q No.'], ['ક્ષેત્ર', 'Area'], ['વિધાન', 'Statement'], ['લાગુ ધોરણ', 'Applies to']].forEach((pair, index) => headerCell(ws.getCell(3, index + 1), pair));
  ws.getRow(3).height = 34;
  const levelText = { B: 'બાલવાટિકા, 1, 2 / Balvatika, Std 1, 2', P: 'ધોરણ 1, 2 / Std 1, 2', G: 'ધોરણ 2 / Std 2' };
  ALL.forEach((item, index) => {
    const r = 4 + index;
    paint(ws.getCell(r, 1), { value: `Q${item.n}`, bold: true });
    paint(ws.getCell(r, 2), { value: item.area, align: 'left' });
    paint(ws.getCell(r, 3), { value: item.text, align: 'left' });
    paint(ws.getCell(r, 4), { value: levelText[item.level] || item.level, size: 9 });
    ws.getRow(r).height = 30;
  });
  void FONT;
}

export function buildStudentQuestionWorkbook(ExcelJS, data, meta) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FLN Tracker – Nipun Gujarat';
  workbook.title = `Student-wise Question Report – ${meta.monthText}`;
  workbook.created = meta.generatedAt;
  summarySheet(workbook, data, meta);
  for (const grade of QUESTION_GRADES) if ((data[grade] || []).length) gradeSheet(workbook, grade, data[grade], meta);
  keySheet(workbook);
  return workbook;
}
