const NETWORK_PATTERN = /failed to fetch|networkerror|load failed|fetch failed|network request failed/i;

export function isNetworkFailure(message) {
  return NETWORK_PATTERN.test(String(message || ''));
}

// "Failed to fetch" = browser Supabase sudhi pahonchi shakyo nathi (code ni bhul nahi).
export function friendlyError(prefix, message, host = '') {
  if (!isNetworkFailure(message)) return `${prefix}: ${message}`;
  return `${prefix}: Supabase server sudhi pahonchai shakyu nathi${host ? ` (${host})` : ''}. `
    + '1) Internet / VPN / Ad-blocker tapaso. 2) Supabase project paused hoy to Dashboard ma “Restore project” karo (free project 1 athvadiya vaparash vagar pause thay chhe). '
    + '3) .env.local ma VITE_SUPABASE_URL sachu chhe te tapaso.';
}

// Server chalu chhe ke nahi (401/404 pan "chalu" gane chhe; fakt network error = nahi).
export async function checkSupabaseReachable(baseUrl, { timeoutMs = 6000, fetchImpl } = {}) {
  if (!baseUrl) return { ok: false, reason: 'Supabase URL ગોઠવેલ નથી.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await (fetchImpl ?? fetch)(`${String(baseUrl).replace(/\/$/, '')}/auth/v1/health`, { signal: controller.signal });
    return { ok: true };
  } catch (cause) {
    return { ok: false, reason: cause?.name === 'AbortError' ? 'Server જવાબ આપતો નથી (timeout).' : String(cause?.message || cause) };
  } finally {
    clearTimeout(timer);
  }
}
