-- Per-subject feature switches and archiving.
--
-- Feature switches, set in Admin → Curricula → (subject) → Features.
--
-- Optional tools (Exam Mode, Essay Marker, Writing) are off unless a subject
-- turns them on:
--   { "exam_mode": true,  "exam_questions": 20, "exam_minutes": 30,
--     "essay_marker": true, "writing": "writing_y56" }
-- Missing keys mean "off" / defaults.

alter table public.curricula
  add column if not exists features jsonb not null default '{}'::jsonb;

comment on column public.curricula.features is
  'Per-subject feature switches: exam_mode (bool), exam_questions (int), exam_minutes (int), essay_marker (bool), writing (level id e.g. writing_y56).';

-- Archived subjects are hidden from students (picker, onboarding, assignments)
-- but keep their topics, questions and student history. NULL = active.
alter table public.curricula
  add column if not exists archived_at timestamptz;
