-- question_reports: tracks student-flagged wrong answers and AI auto-resolution audit trail
CREATE TABLE IF NOT EXISTS question_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   TEXT        NOT NULL,
  reported_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ai_status     TEXT        NOT NULL DEFAULT 'pending',
  ai_verdict    JSONB,
  resolved_at   TIMESTAMPTZ,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS question_reports_question_id_idx ON question_reports(question_id);
CREATE INDEX IF NOT EXISTS question_reports_ai_status_idx   ON question_reports(ai_status);

-- Row-level security: allow anyone to insert (students report), only service role reads/updates
ALTER TABLE question_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert a report"
  ON question_reports FOR INSERT
  WITH CHECK (true);

-- Reads are restricted to admins via the API (service role bypasses RLS)
