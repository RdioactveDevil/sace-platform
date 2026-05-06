-- ── Supabase security linter: SECURITY DEFINER + mutable search_path ─────────
-- Run in SQL editor: https://supabase.com/dashboard/project/pslpxawrfpcuwnupdfbs/sql/new
--
-- Fixes advisory issues:
--   • function_search_path_mutable (increment_xp, increment_variant_usage, handle_new_user)
--   • auth_users_exposed (N/A here)
--   • SECURITY DEFINER callable by PUBLIC / anon (revoke execute from PUBLIC + anon)
--
-- Does NOT remove the "authenticated can invoke admin_* RPC" warning entirely: those
-- functions are intentionally GRANT EXECUTE TO authenticated; they enforce admin
-- inside with is_current_user_admin(). Revoking PUBLIC/anon closes the real hole.
--
-- Leaked password protection: Dashboard → Authentication → Providers → Email →
-- enable "Prevent use of leaked passwords" (HaveIBeenPwned). Not configurable via SQL.

-- ── 1. Pin search_path (stops search_path hijacking in SECURITY DEFINER) ─────
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_xp(uuid, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_variant_usage(uuid) SET search_path = public, pg_temp;

-- These may already have SET in CREATE; ALTER is idempotent for attribute.
ALTER FUNCTION public.is_current_user_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_current_user_tutor() SET search_path = public, pg_temp;
ALTER FUNCTION public.apply_for_tutor() SET search_path = public, pg_temp;
ALTER FUNCTION public.withdraw_tutor_application() SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_approve_tutor(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_reject_tutor(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_set_tutor(uuid, boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_set_admin(uuid, boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.complete_assignment(uuid) SET search_path = public, pg_temp;

-- ── 2. Revoke anon / PUBLIC execute (PostgREST exposes anon to unauthenticated clients)

-- Trigger-only: no direct RPC should call these
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

-- Legacy RPCs — not used by gradefarm web client (update profiles XP client-side).
-- Granted to service_role only so server-side jobs with the service key can still call them.
REVOKE ALL ON FUNCTION public.increment_xp(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_xp(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.increment_xp(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_xp(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.increment_variant_usage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_variant_usage(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.increment_variant_usage(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_variant_usage(uuid) TO service_role;

-- RLS policies reference these on authenticated sessions. Grant anon until you run
-- supabase-security-revoke-anon-helpers.sql (short-circuit policies + revoke anon).
REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO anon;

REVOKE ALL ON FUNCTION public.is_current_user_tutor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_tutor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_tutor() TO anon;

-- Student/tutor self-service + assignment completion
REVOKE ALL ON FUNCTION public.apply_for_tutor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_for_tutor() FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_for_tutor() TO authenticated;

REVOKE ALL ON FUNCTION public.withdraw_tutor_application() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_tutor_application() FROM anon;
GRANT EXECUTE ON FUNCTION public.withdraw_tutor_application() TO authenticated;

REVOKE ALL ON FUNCTION public.complete_assignment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_assignment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_assignment(uuid) TO authenticated;

-- Admin RPCs — only signed-in users may invoke; non-admins get EXCEPTION from function body
REVOKE ALL ON FUNCTION public.admin_approve_tutor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_approve_tutor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_tutor(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_reject_tutor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reject_tutor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_tutor(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_tutor(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_tutor(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_tutor(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_admin(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_admin(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_admin(uuid, boolean) TO authenticated;
