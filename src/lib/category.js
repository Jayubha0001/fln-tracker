import { STATEMENTS } from '../data/statements';

// PDF mujab: Udayman = 0..udayMax, Nipun = nipunMin..total, vachche Pragatishil
export const CLASSES = {
  B: { label: 'બાલવાટિકા', total: 6, udayMax: 1, nipunMin: 5 },
  '1': { label: 'ધોરણ 1', total: 22, udayMax: 6, nipunMin: 18 },
  '2': { label: 'ધોરણ 2', total: 30, udayMax: 9, nipunMin: 24 },
};

export const CAT = {
  U: { label: 'ઉદયમાન', cls: 'u' },
  P: { label: 'પ્રગતિશીલ', cls: 'p' },
  N: { label: 'નિપુણ', cls: 'n' },
};

export function getCategory(dhoran, yesCount) {
  const c = CLASSES[dhoran];
  if (yesCount <= c.udayMax) return 'U';
  if (yesCount >= c.nipunMin) return 'N';
  return 'P';
}

export const MONTHS = [
  { key: '2026-07', label: 'જુલાઈ-26' },
  { key: '2026-08', label: 'ઓગસ્ટ-26' },
  { key: '2026-09', label: 'સપ્ટેમ્બર-26' },
  { key: '2026-10', label: 'ઓક્ટોબર-26' },
  { key: '2026-11', label: 'નવેમ્બર-26' },
  { key: '2026-12', label: 'ડિસેમ્બર-26' },
  { key: '2027-01', label: 'જાન્યુઆરી-27' },
  { key: '2027-02', label: 'ફેબ્રુઆરી-27' },
  { key: '2027-03', label: 'માર્ચ-27' },
];

// Eka vidyarthi na answers ({vidhan_no: true/false}) parthi result
export function calc(dhoran, answers = {}) {
  const ns = STATEMENTS[dhoran].map((q) => q.n);
  const done = ns.filter((n) => answers[n] !== undefined).length;
  const yes = ns.filter((n) => answers[n] === true).length;
  const total = ns.length;
  return { total, done, yes, cat: done === total ? getCategory(dhoran, yes) : null };
}
