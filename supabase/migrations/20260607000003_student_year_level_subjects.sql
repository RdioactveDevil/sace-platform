-- ============================================================================
-- Students tab redesign — tutor year-level override + tutored-subject selection
-- ============================================================================
-- A student's Year level is collected at onboarding (profiles.year_level) and a
-- student's subjects/stages at onboarding too (user_subscriptions). This
-- migration only adds the tutor-relationship layer on top:
--   • an OPTIONAL year-level override the tutor can set per student, and
--   • the tutor's SELECTION of which of the student's subjects they tutor
--     (so a tutor only sees the subject(s) they actually tutor).
-- Neither duplicates onboarding data — they reference/override it.
-- ============================================================================

-- Optional tutor override; falls back to profiles.year_level when null.
alter table public.tutor_students
  add column if not exists year_level text;

-- The tutor's selection — one row per (tutor, student, subject, stage) they tutor.
-- Populated by picking from the student's own onboarding subscriptions.
create table if not exists public.tutor_student_subjects (
  id           uuid primary key default gen_random_uuid(),
  tutor_id     uuid not null references public.profiles (id) on delete cascade,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  subject_name text not null,
  stage        text,
  created_at   timestamptz not null default now(),
  unique (tutor_id, student_id, subject_name, stage)
);

create index if not exists tutor_student_subjects_idx
  on public.tutor_student_subjects (tutor_id, student_id);

alter table public.tutor_student_subjects enable row level security;

drop policy if exists "Tutors manage own tutored subjects" on public.tutor_student_subjects;
create policy "Tutors manage own tutored subjects" on public.tutor_student_subjects
  for all to authenticated
  using (tutor_id = auth.uid())
  with check (tutor_id = auth.uid());
