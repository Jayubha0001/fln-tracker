export async function invokeAuthenticatedFunction(supabase, functionName, options = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('લૉગિન session સમાપ્ત છે. ફરી sign in કરો.');

  return supabase.functions.invoke(functionName, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
