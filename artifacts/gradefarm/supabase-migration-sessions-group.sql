-- Migration: Group session support
-- Run AFTER supabase-migration-sessions.sql

-- 1. Add session_type and make student_id nullable (group sessions have no single student)
ALTER TABLE tutoring_sessions
  ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'individual'
    CHECK (session_type IN ('individual', 'group')),
  ALTER COLUMN student_id DROP NOT NULL;

-- 2. Participants junction table (covers both individual and group sessions)
CREATE TABLE IF NOT EXISTS session_participants (
  session_id  UUID NOT NULL REFERENCES tutoring_sessions(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_session_participants_student ON session_participants(student_id);

-- 3. Backfill existing individual sessions into participants table
INSERT INTO session_participants (session_id, student_id)
SELECT id, student_id FROM tutoring_sessions
WHERE student_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. RLS on participants table
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tutors_manage_participants" ON session_participants
  FOR ALL USING (
    is_current_user_tutor() AND EXISTS (
      SELECT 1 FROM tutoring_sessions ts
      WHERE ts.id = session_participants.session_id
        AND ts.tutor_id = auth.uid()
    )
  );

CREATE POLICY "students_view_own_participation" ON session_participants
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "admins_all_participants" ON session_participants
  FOR ALL USING (is_current_user_admin());

-- 5. Update the student RLS policy on tutoring_sessions to also cover group sessions
DROP POLICY IF EXISTS "students_view_own_sessions" ON tutoring_sessions;

CREATE POLICY "students_view_own_sessions" ON tutoring_sessions
  FOR SELECT USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM session_participants sp
      WHERE sp.session_id = tutoring_sessions.id
        AND sp.student_id = auth.uid()
    )
  );
