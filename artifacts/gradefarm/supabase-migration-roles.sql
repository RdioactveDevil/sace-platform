-- ── Roles Migration: Admin / Tutor / Student ─────────────────────────────────
-- Run in Supabase SQL editor for project pslpxawrfpcuwnupdfbs
-- Dashboard: https://supabase.com/dashboard/project/pslpxawrfpcuwnupdfbs/sql/new
--
-- Depends on supabase-migration.sql (tutor dashboard) being applied first.

-- 1. Add admin flag and tutor application status to profiles ─────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tutor_application_status TEXT NOT NULL DEFAULT 'none'
    CHECK (tutor_application_status IN ('none','pending','approved','rejected'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tutor_application_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_tutor_app_idx
  ON profiles (tutor_application_status, tutor_application_at DESC)
  WHERE tutor_application_status = 'pending';

-- 2. SECURITY DEFINER admin check (avoids recursive RLS on profiles) ─────────
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = auth.uid()), false);
$$;

GRANT EXECUTE ON FUNCTION is_current_user_admin() TO authenticated;

-- 3. RLS: admins can read every profile ──────────────────────────────────────
DROP POLICY IF EXISTS "admins_read_all_profiles" ON profiles;
CREATE POLICY "admins_read_all_profiles"
  ON profiles
  FOR SELECT
  USING (is_current_user_admin());

-- Direct profile updates for admins are NOT enabled — admins must use the
-- SECURITY DEFINER RPCs below so we can audit and constrain the surface.

-- 4. Self-service: a user can submit/withdraw their own tutor application ────
-- Allowed transitions for the calling user themselves:
--   none|rejected -> pending
--   pending       -> none   (withdraw)
-- Approving / rejecting / setting is_tutor / is_admin must use admin RPCs.
CREATE OR REPLACE FUNCTION apply_for_tutor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tutor_application_status INTO current_status
  FROM profiles WHERE id = auth.uid();

  IF current_status = 'pending' THEN
    RETURN;
  END IF;
  IF current_status = 'approved' THEN
    RAISE EXCEPTION 'You are already an approved tutor';
  END IF;

  UPDATE profiles
  SET tutor_application_status = 'pending',
      tutor_application_at     = NOW()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION apply_for_tutor() TO authenticated;

CREATE OR REPLACE FUNCTION withdraw_tutor_application()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE profiles
  SET tutor_application_status = 'none',
      tutor_application_at     = NULL
  WHERE id = auth.uid()
    AND tutor_application_status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION withdraw_tutor_application() TO authenticated;

-- 5. Admin RPCs: approve / reject tutor application, set is_tutor, set is_admin
CREATE OR REPLACE FUNCTION admin_approve_tutor(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  UPDATE profiles
  SET is_tutor                 = true,
      tutor_application_status = 'approved'
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_reject_tutor(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  UPDATE profiles
  SET tutor_application_status = 'rejected'
  WHERE id = p_user_id
    AND tutor_application_status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending application for this user';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_tutor(p_user_id UUID, p_value BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  UPDATE profiles
  SET is_tutor = p_value,
      tutor_application_status = CASE
        WHEN p_value THEN 'approved'
        ELSE tutor_application_status
      END
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_admin(p_user_id UUID, p_value BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  -- Prevent removing the last admin
  IF p_value = false THEN
    IF (SELECT COUNT(*) FROM profiles WHERE is_admin = true AND id <> p_user_id) = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last remaining admin';
    END IF;
  END IF;
  UPDATE profiles SET is_admin = p_value WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_approve_tutor(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION admin_reject_tutor(UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_tutor(UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_admin(UUID,BOOLEAN) TO authenticated;

-- 6. Tighten previous tutor reads ────────────────────────────────────────────
-- The prior is_current_user_tutor() already keys off is_tutor. Pending
-- applicants have is_tutor = false, so they automatically get NO tutor
-- access — they remain students until admin_approve_tutor() is called.

-- ── BOOTSTRAP THE FIRST ADMIN ────────────────────────────────────────────────
-- Replace 'you@example.com' with your account email, then run JUST this line:
--
--   UPDATE profiles SET is_admin = true
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'you@example.com');
--
-- After this, you can promote other admins from the Admin dashboard.
