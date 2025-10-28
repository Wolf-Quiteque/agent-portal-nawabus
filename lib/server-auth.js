import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from './supabase';

async function getServerSupabase() {
  const cookieStore = await cookies();

  if (!cookieStore) {
    return null;
  }

  return createSupabaseServerClient(cookieStore);
}

/**
 * Ensures a session exists. Redirects to /login if not authenticated.
 * Returns the server supabase client and user if authenticated.
 */
export async function requireSession() {
  const supabase = await getServerSupabase();
  if (!supabase) {
    redirect('/login');
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  return { supabase, user };
}

/**
 * Ensures the current user has role=agent or admin. Redirects if unauthorized.
 * Returns { supabase, user, role } on success.
 */
export async function requireAgentRole() {
  const { supabase, user } = await requireSession();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error || !['agent', 'admin'].includes(profile?.role)) {
    redirect('/login?error=unauthorized');
  }

  return { supabase, user, role: profile.role };
}
