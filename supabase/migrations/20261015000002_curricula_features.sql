-- Per-subject feature switches, set in Admin → Curricula → (subject) → Features.
--
-- Optional tools that only make sense for some subjects are now off unless a
-- subject turns them on:
--   { "exam_mode": true,  "exam_questions": 20, "exam_minutes": 30,
--     "essay_marker": true }
-- Missing keys mean "off" / defaults.

alter table public.curricula
  add column if not exists features jsonb not null default '{}'::jsonb;

comment on column public.curricula.features is
  'Per-subject feature switches: exam_mode (bool), exam_questions (int), exam_minutes (int), essay_marker (bool).';
