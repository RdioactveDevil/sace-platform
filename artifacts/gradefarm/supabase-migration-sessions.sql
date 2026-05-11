-- Migration: Video tutoring sessions
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS tutoring_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id          UUID        REFERENCES tutor_classes(id) ON DELETE SET NULL,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER     NOT NULL DEFAULT 60,
  livekit_room_name TEXT        NOT NULL UNIQUE,
  title             TEXT,
  notes             TEXT,
  status            TEXT        NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tutoring_sessions_tutor   ON tutoring_sessions(tutor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_tutoring_sessions_student ON tutoring_sessions(student_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_tutoring_sessions_status  ON tutoring_sessions(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_tutoring_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_tutoring_sessions_updated_at ON tutoring_sessions;
CREATE TRIGGER trg_tutoring_sessions_updated_at
  BEFORE UPDATE ON tutoring_sessions
  FOR EACH ROW EXECUTE FUNCTION update_tutoring_sessions_updated_at();

-- RLS
ALTER TABLE tutoring_sessions ENABLE ROW LEVEL SECURITY;

-- Tutors can manage their own sessions
CREATE POLICY "tutors_manage_own_sessions" ON tutoring_sessions
  FOR ALL USING (
    is_current_user_tutor() AND tutor_id = auth.uid()
  );

-- Students can view their own sessions
CREATE POLICY "students_view_own_sessions" ON tutoring_sessions
  FOR SELECT USING (student_id = auth.uid());

-- Admins can see everything
CREATE POLICY "admins_all_sessions" ON tutoring_sessions
  FOR ALL USING (is_current_user_admin());
