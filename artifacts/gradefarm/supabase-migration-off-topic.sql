-- Migration: off_topic_attempts
-- Track when a student sends a message that Titan AI classified as off-topic.
-- Only subject, topic, and timestamp are stored — no message body.
-- Apply in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS off_topic_attempts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject       TEXT        NOT NULL,
  topic         TEXT        NOT NULL,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS off_topic_attempts_student_idx ON off_topic_attempts (student_id);
CREATE INDEX IF NOT EXISTS off_topic_attempts_at_idx     ON off_topic_attempts (attempted_at DESC);

ALTER TABLE off_topic_attempts ENABLE ROW LEVEL SECURITY;

-- Students can read their own attempts.
CREATE POLICY "students_read_own_off_topic" ON off_topic_attempts
  FOR SELECT USING (auth.uid() = student_id);

-- Tutors can read off-topic attempts for students on their roster.
CREATE POLICY "tutors_read_student_off_topic" ON off_topic_attempts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tutor_students
      WHERE tutor_students.tutor_id  = auth.uid()
        AND tutor_students.student_id = off_topic_attempts.student_id
    )
  );

-- INSERT is service-role only (no policy for anon/authenticated INSERT —
-- the API server uses the service key which bypasses RLS).
