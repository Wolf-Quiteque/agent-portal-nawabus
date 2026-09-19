import { createBrowserClient } from '@supabase/ssr';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Browser client (uses anon key, respects RLS)
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// Data client for server routes.
//
// createSupabaseServerClient below is built with the service key but also
// carries the signed-in agent's cookies, and @supabase/ssr sends that session
// as the bearer token — so its table reads and writes run as the agent, not as
// the service key. That is fine for auth.getUser and the auth admin API, but
// once row-level security is on, agents may not write tickets or payments.
// Use this client for table access instead; it has no session attached.
export function createSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Server client function (session-scoped: use for auth, not for table access)
export function createSupabaseServerClient(cookieStore) {
  return createServerClient(supabaseUrl, supabaseServiceKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        )
      },
    },
  })
}
