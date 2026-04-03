import { createClient } from '@supabase/supabase-js'

// ─── PASTE YOUR VALUES HERE ───────────────────────────────────────────────────
// From: supabase.com → your project → Settings → API
const SUPABASE_URL  = 'PASTE_YOUR_PROJECT_URL_HERE'
const SUPABASE_ANON = 'PASTE_YOUR_ANON_KEY_HERE'
// ─────────────────────────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
