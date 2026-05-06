-- ── Security: question_flags RLS + leaderboard view (security invoker) ─────
-- Run in the Supabase SQL editor for project pslpxawrfpcuwnupdfbs
-- Dashboard: https://supabase.com/dashboard/project/pslpxawrfpcuwnupdfbs/sql/new
--
-- Addresses Supabase linter:
--   • RLS disabled in public (question_flags)
--   • SECURITY DEFINER view (leaderboard)
--
-- Requires Postgres 15+ for security_invoker on views (current Supabase projects).

-- ── 1. question_flags — users only touch their own rows (matches app: flagQuestion / getUserFlags)
ALTER TABLE public.question_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_flags_select_own" ON public.question_flags;
CREATE POLICY "question_flags_select_own"
  ON public.question_flags
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "question_flags_insert_own" ON public.question_flags;
CREATE POLICY "question_flags_insert_own"
  ON public.question_flags
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "question_flags_update_own" ON public.question_flags;
CREATE POLICY "question_flags_update_own"
  ON public.question_flags
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "question_flags_delete_own" ON public.question_flags;
CREATE POLICY "question_flags_delete_own"
  ON public.question_flags
  FOR DELETE
  USING (auth.uid() = user_id);

-- ── 2. leaderboard — run as querying user so underlying profiles RLS applies
DROP VIEW IF EXISTS public.leaderboard;

CREATE VIEW public.leaderboard
WITH (security_invoker = true)
AS
SELECT
  id,
  display_name,
  school,
  xp,
  level,
  streak,
  rank() OVER (ORDER BY xp DESC) AS position
FROM public.profiles
ORDER BY xp DESC
LIMIT 100;

GRANT SELECT ON public.leaderboard TO anon, authenticated;
