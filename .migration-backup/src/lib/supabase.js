import { createClient } from '@supabase/supabase-js'

// ─── PASTE YOUR VALUES HERE ───────────────────────────────────────────────────
// From: supabase.com → your project → Settings → API
const SUPABASE_URL  = 'https://pslpxawrfpcuwnupdfbs.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzbHB4YXdyZnBjdXdudXBkZmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxOTg5MzAsImV4cCI6MjA5MDc3NDkzMH0.RSEb8zdvTJhb9vArqDBcEyA8gBJ4Rg0qDobrOFAD_Us'
// ─────────────────────────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
