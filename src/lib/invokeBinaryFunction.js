// supabase-js `functions.invoke` Excel (xlsx) response ne text tarike vanche chhe, etle file bagdi jay chhe.
// Aa helper seedhu fetch kari ne Blob aape chhe; session token Authorization ma jay chhe (JWT verification chalu).
export async function invokeBinaryFunction(supabase, functionName, { body = {}, url, key, fetchImpl } = {}) {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('લૉગિન session સમાપ્ત છે. ફરી sign in કરો.');
    const baseUrl = url ?? supabase.supabaseUrl ?? import.meta.env?.VITE_SUPABASE_URL;
    const apiKey = key ?? supabase.supabaseKey ?? import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!baseUrl) throw new Error('Supabase URL ગોઠવેલ નથી.');
    const response = await (fetchImpl ?? fetch)(`${baseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      let message = text;
      try { message = JSON.parse(text).error || text; } catch { /* plain text */ }
      throw new Error(`HTTP ${response.status}: ${message || 'વિનંતી નિષ્ફળ.'}`);
    }
    const blob = await response.blob();
    if (!blob || blob.size === 0) throw new Error('ખાલી Excel response મળ્યો; Function logs તપાસો.');
    return { data: blob, error: null };
  } catch (cause) {
    return { data: null, error: cause instanceof Error ? cause : new Error(String(cause)) };
  }
}
