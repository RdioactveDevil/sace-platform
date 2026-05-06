-- ── Revoke anon EXECUTE on is_current_user_* + RLS short-circuit ──────────────
-- Run AFTER supabase-security-definer-hardening.sql (or run both in order in one session).
-- SQL editor: https://supabase.com/dashboard/project/pslpxawrfpcuwnupdfbs/sql/new
--
-- Fixes Supabase linter: "Public can execute SECURITY DEFINER" on is_current_user_admin /
-- is_current_user_tutor by revoking anon EXECUTE after policies no longer need it.
--
-- Remaining items you may still see:
--   • "Signed-in users can execute" on admin_* / apply_for_tutor / complete_assignment —
--     normal while the app calls supabase.rpc() with the user's JWT; removing it means
--     doing those actions only from your API with the service role key.
--   • Leaked password protection — enable in Dashboard → Authentication (not SQL).

-- ── profiles ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admins_read_all_profiles" ON public.profiles;
CREATE POLICY "admins_read_all_profiles"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.is_current_user_admin());

DROP POLICY IF EXISTS "tutors_read_rostered_student_profiles" ON public.profiles;
CREATE POLICY "tutors_read_rostered_student_profiles"
  ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR (
      auth.uid() IS NOT NULL
      AND public.is_current_user_tutor()
      AND EXISTS (
        SELECT 1 FROM public.tutor_students
        WHERE tutor_id = auth.uid() AND student_id = profiles.id
      )
    )
  );

-- ── tutor_students ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tutors_manage_own_roster" ON public.tutor_students;
CREATE POLICY "tutors_manage_own_roster"
  ON public.tutor_students
  USING (
    auth.uid() IS NOT NULL
    AND tutor_id = auth.uid()
    AND public.is_current_user_tutor()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND tutor_id = auth.uid()
    AND public.is_current_user_tutor()
  );

-- ── assignments ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tutors_manage_own_assignments" ON public.assignments;
CREATE POLICY "tutors_manage_own_assignments"
  ON public.assignments
  USING (
    auth.uid() IS NOT NULL
    AND tutor_id = auth.uid()
    AND public.is_current_user_tutor()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND tutor_id = auth.uid()
    AND public.is_current_user_tutor()
    AND EXISTS (
      SELECT 1 FROM public.tutor_students
      WHERE tutor_id = auth.uid() AND student_id = assignments.student_id
    )
  );

-- ── struggle_profiles ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tutors_read_rostered_student_struggles" ON public.struggle_profiles;
CREATE POLICY "tutors_read_rostered_student_struggles"
  ON public.struggle_profiles
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      auth.uid() IS NOT NULL
      AND public.is_current_user_tutor()
      AND EXISTS (
        SELECT 1 FROM public.tutor_students
        WHERE tutor_id = auth.uid() AND student_id = struggle_profiles.user_id
      )
    )
  );

-- ── answer_log ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tutors_read_rostered_student_answer_log" ON public.answer_log;
CREATE POLICY "tutors_read_rostered_student_answer_log"
  ON public.answer_log
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      auth.uid() IS NOT NULL
      AND public.is_current_user_tutor()
      AND EXISTS (
        SELECT 1 FROM public.tutor_students
        WHERE tutor_id = auth.uid() AND student_id = answer_log.user_id
      )
    )
  );

-- ── tutor_classes ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tutors_manage_own_classes" ON public.tutor_classes;
CREATE POLICY "tutors_manage_own_classes"
  ON public.tutor_classes
  USING (
    auth.uid() IS NOT NULL
    AND tutor_id = auth.uid()
    AND public.is_current_user_tutor()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND tutor_id = auth.uid()
    AND public.is_current_user_tutor()
  );

-- ── tutor_class_members ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tutors_manage_own_class_members" ON public.tutor_class_members;
CREATE POLICY "tutors_manage_own_class_members"
  ON public.tutor_class_members
  USING (
    auth.uid() IS NOT NULL
    AND public.is_current_user_tutor()
    AND EXISTS (
      SELECT 1 FROM public.tutor_classes c
      WHERE c.id = tutor_class_members.class_id
        AND c.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.is_current_user_tutor()
    AND EXISTS (
      SELECT 1 FROM public.tutor_classes c
      WHERE c.id = tutor_class_members.class_id
        AND c.tutor_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.tutor_students ts
      WHERE ts.tutor_id = auth.uid()
        AND ts.student_id = tutor_class_members.student_id
    )
  );

-- ── writing_attempts (only when table exists) ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'writing_attempts'
  ) THEN
    DROP POLICY IF EXISTS "Tutors read roster writing attempts" ON public.writing_attempts;
    CREATE POLICY "Tutors read roster writing attempts"
      ON public.writing_attempts
      FOR SELECT
      USING (
        auth.uid() IS NOT NULL
        AND public.is_current_user_tutor()
        AND EXISTS (
          SELECT 1 FROM public.tutor_students ts
          WHERE ts.tutor_id = auth.uid()
            AND ts.student_id = writing_attempts.user_id
        )
      );

    DROP POLICY IF EXISTS "Admins read all writing attempts" ON public.writing_attempts;
    CREATE POLICY "Admins read all writing attempts"
      ON public.writing_attempts
      FOR SELECT
      USING (auth.uid() IS NOT NULL AND public.is_current_user_admin());

    DROP POLICY IF EXISTS "Admins delete writing attempts" ON public.writing_attempts;
    CREATE POLICY "Admins delete writing attempts"
      ON public.writing_attempts
      FOR DELETE
      USING (auth.uid() IS NOT NULL AND public.is_current_user_admin());
  END IF;
END $$;

-- ── anon cannot invoke helpers via RPC; authenticated still can (for RLS + RPC if any) ─
REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_current_user_tutor() FROM anon;
