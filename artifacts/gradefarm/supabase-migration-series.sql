-- Migration: Recurring session series
-- Run AFTER supabase-migration-sessions-group.sql

-- 1. Recurring series definition
CREATE TABLE IF NOT EXISTS session_series (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_type     TEXT        NOT NULL DEFAULT 'individual'
                               CHECK (session_type IN ('individual', 'group')),
  student_id       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  class_id         UUID        REFERENCES tutor_classes(id) ON DELETE SET NULL,
  recurrence_type  TEXT        NOT NULL CHECK (recurrence_type IN ('weekly', 'fortnightly', 'monthly')),
  day_of_week      INTEGER     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun, 1=Mon…
  time_of_day      TEXT        NOT NULL,  -- 'HH:MM' in tutor's local time (stored as-is)
  timezone         TEXT        NOT NULL DEFAULT 'Australia/Adelaide',
  duration_minutes INTEGER     NOT NULL DEFAULT 60,
  livekit_room_name TEXT       NOT NULL UNIQUE, -- fixed for entire series lifetime
  title            TEXT,
  notes            TEXT,
  starts_at        DATE        NOT NULL,
  ends_at          DATE,                  -- NULL = runs indefinitely
  status           TEXT        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'cancelled')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_series_tutor ON session_series(tutor_id);
CREATE INDEX IF NOT EXISTS idx_series_room  ON session_series(livekit_room_name);

-- 2. Link individual occurrences back to their series
ALTER TABLE tutoring_sessions
  ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES session_series(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_series ON tutoring_sessions(series_id);

-- 3. Participants for series (mirrors session_participants but at series level)
CREATE TABLE IF NOT EXISTS series_participants (
  series_id  UUID NOT NULL REFERENCES session_series(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (series_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_series_participants_student ON series_participants(student_id);

-- 4. RLS on session_series
ALTER TABLE session_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tutors_manage_own_series" ON session_series
  FOR ALL USING (is_current_user_tutor() AND tutor_id = auth.uid());

CREATE POLICY "students_view_series" ON session_series
  FOR SELECT USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM series_participants sp
      WHERE sp.series_id = session_series.id AND sp.student_id = auth.uid()
    )
  );

CREATE POLICY "admins_all_series" ON session_series
  FOR ALL USING (is_current_user_admin());

-- 5. RLS on series_participants
ALTER TABLE series_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tutors_manage_series_participants" ON series_participants
  FOR ALL USING (
    is_current_user_tutor() AND EXISTS (
      SELECT 1 FROM session_series s
      WHERE s.id = series_participants.series_id AND s.tutor_id = auth.uid()
    )
  );

CREATE POLICY "students_view_own_series_participation" ON series_participants
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "admins_all_series_participants" ON series_participants
  FOR ALL USING (is_current_user_admin());
