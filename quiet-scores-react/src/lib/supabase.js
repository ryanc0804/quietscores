import { createClient } from '@supabase/supabase-js'

// Configure in .env.local (dev) and in Vercel → Project → Environment Variables:
//   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<public anon key>
// The anon key is meant to be public; row-level security protects the data.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isAuthConfigured = Boolean(url && anonKey)

export const supabase = isAuthConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // handles email-confirmation and password-reset links
        flowType: 'pkce',
      },
    })
  : null
