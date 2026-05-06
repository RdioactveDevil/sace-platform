-- ── Writing attempts: tutors read roster students; admins read all ──────────
-- Run in Supabase SQL editor after `writing_attempts` table exists.
-- Reference: artifacts/gradefarm/supabase-migration-roles.sql (is_current_user_admin)

CREATE OR REPLACE FUNCTION is_current_user_tutor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_tutor FROM profiles WHERE id = auth.uid()), false);
$$;

GRANT EXECUTE ON FUNCTION is_current_user_tutor() TO authenticated;

DROP POLICY IF EXISTS "Tutors read roster writing attempts" ON writing_attempts;
CREATE POLICY "Tutors read roster writing attempts"
  ON writing_attempts
  FOR SELECT
  USING (
    is_current_user_tutor()
    AND EXISTS (
      SELECT 1 FROM tutor_students ts
      WHERE ts.tutor_id = auth.uid()
        AND ts.student_id = writing_attempts.user_id
    )
  );

DROP POLICY IF EXISTS "Admins read all writing attempts" ON writing_attempts;
CREATE POLICY "Admins read all writing attempts"
  ON writing_attempts
  FOR SELECT
  USING (is_current_user_admin());

-- Optional: allow admins to delete writing attempts (students cannot)
DROP POLICY IF EXISTS "Admins delete writing attempts" ON writing_attempts;
CREATE POLICY "Admins delete writing attempts"
  ON writing_attempts
  FOR DELETE
  USING (is_current_user_admin());
