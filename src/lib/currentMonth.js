// Aajno mahino (local time) tracker ni months list mathi; range bahar hoy to nazdiknu mahino.
export function pickCurrentMonth(months, now = new Date()) {
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (months.some((m) => m.key === key)) return key;
  return key < months[0].key ? months[0].key : months[months.length - 1].key;
}
