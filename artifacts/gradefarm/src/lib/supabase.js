import { createClient } from '@supabase/supabase-js'

// Configuration resolves from Vite env vars first so dev / staging / prod can
// point at different Supabase projects without code changes. Set these in a
// .env file or the deploy environment:
//   VITE_SUPABASE_URL=https://<project>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<anon public key>
// The hardcoded values remain as a fallback so existing setups keep working.
const FALLBACK_URL  = 'https://pslpxawrfpcuwnupdfbs.supabase.co'
const FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzbHB4YXdyZnBjdXdudXBkZmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxOTg5MzAsImV4cCI6MjA5MDc3NDkzMH0.RSEb8zdvTJhb9vArqDBcEyA8gBJ4Rg0qDobrOFAD_Us'

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
const SUPABASE_URL  = env.VITE_SUPABASE_URL  || FALLBACK_URL
const SUPABASE_ANON = env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
