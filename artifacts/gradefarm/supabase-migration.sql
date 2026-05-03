-- ── Tutor Dashboard Migration ─────────────────────────────────────────────────
-- Run this in the Supabase SQL editor for project pslpxawrfpcuwnupdfbs
-- Dashboard: https://supabase.com/dashboard/project/pslpxawrfpcuwnupdfbs/sql/new

-- 1. Add is_tutor flag to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_tutor BOOLEAN NOT NULL DEFAULT false;

-- 2. Tutor–student roster
CREATE TABLE IF NOT EXISTS tutor_students (
  tutor_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  student_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tutor_id, student_id)
);

-- 3. Assignments
CREATE TABLE IF NOT EXISTS assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('Quiz','Test','Worksheet','Homework')),
  subject      TEXT NOT NULL,
  topics       TEXT[] NOT NULL DEFAULT '{}',
  due_date     DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS assignments_student_idx ON assignments (student_id, completed_at, due_date);
CREATE INDEX IF NOT EXISTS assignments_tutor_idx   ON assignments (tutor_id, created_at DESC);

-- ── Security-definer helper to check tutor status without recursive RLS ───────
-- Using a SECURITY DEFINER function avoids "infinite recursion detected in
-- policy for relation profiles" when policies on `profiles` need to check
-- whether the caller is a tutor.
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

-- ── RLS: tutor_students ───────────────────────────────────────────────────────

ALTER TABLE tutor_students ENABLE ROW LEVEL SECURITY;

-- Tutors can manage their own roster rows; caller must have is_tutor = true
DROP POLICY IF EXISTS "tutors_manage_own_roster" ON tutor_students;
CREATE POLICY "tutors_manage_own_roster"
  ON tutor_students
  USING  (tutor_id = auth.uid() AND is_current_user_tutor())
  WITH CHECK (tutor_id = auth.uid() AND is_current_user_tutor());

-- Students can read their own roster entries
DROP POLICY IF EXISTS "students_see_own_roster_entry" ON tutor_students;
CREATE POLICY "students_see_own_roster_entry"
  ON tutor_students
  FOR SELECT
  USING (student_id = auth.uid());

-- ── RLS: assignments ──────────────────────────────────────────────────────────

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- Tutors can SELECT / INSERT / UPDATE / DELETE their own assignments.
-- Caller must have is_tutor = true AND the target student must be on their roster.
DROP POLICY IF EXISTS "tutors_manage_own_assignments" ON assignments;
CREATE POLICY "tutors_manage_own_assignments"
  ON assignments
  USING  (tutor_id = auth.uid() AND is_current_user_tutor())
  WITH CHECK (
    tutor_id = auth.uid()
    AND is_current_user_tutor()
    AND EXISTS (
      SELECT 1 FROM tutor_students
      WHERE tutor_id = auth.uid() AND student_id = assignments.student_id
    )
  );

-- Students can read their own assignments
DROP POLICY IF EXISTS "students_see_own_assignments" ON assignments;
CREATE POLICY "students_see_own_assignments"
  ON assignments
  FOR SELECT
  USING (student_id = auth.uid());

-- ── Security-definer function for student assignment completion ────────────────
-- Students call this RPC to mark only completed_at; all other columns are frozen.
-- Using SECURITY DEFINER avoids ambiguous self-referencing RLS WITH CHECK.

CREATE OR REPLACE FUNCTION complete_assignment(p_assignment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE assignments
  SET    completed_at = NOW()
  WHERE  id          = p_assignment_id
    AND  student_id  = auth.uid()
    AND  completed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or already completed';
  END IF;
END;
$$;

-- Revoke direct table UPDATE from authenticated users for assignments
-- (students must use the complete_assignment() RPC instead)
REVOKE UPDATE ON assignments FROM authenticated;

-- ── RLS: tutor progress reads ─────────────────────────────────────────────────
-- Allow tutors to read profile stats, struggle_profiles, and answer_log
-- for students who are on their roster.

-- profiles: tutors can read stats for their own students.
-- IMPORTANT: this policy must NOT query `profiles` directly (would cause
-- "infinite recursion detected in policy for relation profiles").
-- Use is_current_user_tutor() (SECURITY DEFINER) to check tutor status.
DROP POLICY IF EXISTS "tutors_read_rostered_student_profiles" ON profiles;
CREATE POLICY "tutors_read_rostered_student_profiles"
  ON profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR (
      is_current_user_tutor()
      AND EXISTS (
        SELECT 1 FROM tutor_students
        WHERE tutor_id = auth.uid() AND student_id = profiles.id
      )
    )
  );

-- struggle_profiles: tutors can read for rostered students
DROP POLICY IF EXISTS "tutors_read_rostered_student_struggles" ON struggle_profiles;
CREATE POLICY "tutors_read_rostered_student_struggles"
  ON struggle_profiles
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      is_current_user_tutor()
      AND EXISTS (
        SELECT 1 FROM tutor_students
        WHERE tutor_id = auth.uid() AND student_id = struggle_profiles.user_id
      )
    )
  );

-- answer_log: tutors can read for rostered students
DROP POLICY IF EXISTS "tutors_read_rostered_student_answer_log" ON answer_log;
CREATE POLICY "tutors_read_rostered_student_answer_log"
  ON answer_log
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      is_current_user_tutor()
      AND EXISTS (
        SELECT 1 FROM tutor_students
        WHERE tutor_id = auth.uid() AND student_id = answer_log.user_id
      )
    )
  );

-- ── Utility ───────────────────────────────────────────────────────────────────
-- To make a user a tutor, run:
--   UPDATE profiles SET is_tutor = true WHERE id = '<user-uuid>';
-- Or by email:
--   UPDATE profiles SET is_tutor = true
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'tutor@example.com');
