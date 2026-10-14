export const GRADE_RULES = {
  B: {
    label: 'બાલવાટિકા',
    statementIds: [1, 3, 4, 5, 12, 13],
    udayMax: 1,
    nipunMin: 5,
  },
  '1': {
    label: 'ધોરણ 1',
    statementIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19, 20, 23, 24, 25, 29],
    udayMax: 6,
    nipunMin: 18,
  },
  '2': {
    label: 'ધોરણ 2',
    statementIds: Array.from({ length: 30 }, (_, index) => index + 1),
    udayMax: 9,
    nipunMin: 24,
  },
};

export function classifyAnswers(dhoran, answers = {}) {
  const rule = GRADE_RULES[dhoran];
  if (!rule) throw new Error(`Unknown grade: ${dhoran}`);
  if (!rule.statementIds.every((id) => typeof answers[id] === 'boolean')) {
    return { complete: false, yes: rule.statementIds.filter((id) => answers[id] === true).length, category: null };
  }
  const yes = rule.statementIds.filter((id) => answers[id] === true).length;
  const category = yes <= rule.udayMax ? 'U' : yes >= rule.nipunMin ? 'N' : 'P';
  return { complete: true, yes, category };
}
