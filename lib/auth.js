

/**
 * Client-side helper to get current user profile
 * Returns the user's profile data including role and name
 */
export async function getCurrentUserProfile(supabaseClient = null) {
  const client = supabaseClient || (await import('./supabase')).supabase;
  const { data: { user } } = await client.auth.getUser();

  if (!user) return null;

  const { data: profile } = await client
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile;
}
