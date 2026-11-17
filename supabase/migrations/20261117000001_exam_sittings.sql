-- Timed sittings of built exams (Exams → Start this exam). The timer is kept
-- on the attempt as timestamps, so it survives a refresh or another device:
-- { reading_ms, writing_ms, started_at, pauses: [{ from, to }], ended_at, ended }
-- (lib/examSitting.js). Null until the student starts a timed sitting.
-- Existing row-level security on built_exam_attempts already limits this to
-- the student's own attempts.
alter table public.built_exam_attempts add column if not exists sitting jsonb;
