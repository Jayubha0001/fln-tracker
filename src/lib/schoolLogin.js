export function schoolAuthEmail(schoolId, supabaseUrl) {
  const normalizedId = String(schoolId ?? '').trim();
  if (!/^\d{11}$/.test(normalizedId)) {
    throw new Error('School ID 11 અંકનો હોવો જોઈએ.');
  }

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  if (!projectRef) throw new Error('Supabase project URL માન્ય નથી.');

  return `school-${normalizedId}@${projectRef}.supabase.co`;
}
