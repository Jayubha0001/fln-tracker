export function schoolAuthEmail(schoolId, supabaseUrl) {
  const normalizedId = String(schoolId ?? '').trim();
  if (!/^\d{11}$/.test(normalizedId)) {
    throw new Error('School ID 11 અંકનો હોવો જોઈએ.');
  }

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  if (!projectRef) throw new Error('Supabase project URL માન્ય નથી.');

  return `school-${normalizedId}@${projectRef}.supabase.co`;
}

export function scopedAuthEmail(loginId, supabaseUrl) {
  const normalizedId = String(loginId ?? '').trim();
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  if (!projectRef) throw new Error('Supabase project URL માન્ય નથી.');
  if (/^\d{4}$/.test(normalizedId)) return `district-${normalizedId}@${projectRef}.supabase.co`;
  if (/^\d{6}$/.test(normalizedId)) return `block-${normalizedId}@${projectRef}.supabase.co`;
  throw new Error('District Login ID 4 અંકનો અથવા Block Login ID 6 અંકનો હોવો જોઈએ.');
}
