-- ============================================================================
-- Students tab redesign — year level + tutor-scoped tutored subjects/stages
-- ============================================================================
-- A student's school Year level (e.g. "Year 11") is distinct from the SACE
-- Stage of a subject (e.g. "Stage 2 Mathematical Methods"): a Year 11 student
-- can take a Stage 2 subject. A tutor only ever sees the subject(s) they
-- personally tutor a given student in, so those are stored per (tutor, student)
-- rather than derived from the student's own subscriptions.
-- ============================================================================

-- Year level lives on the roster link so the tutor sets/owns it.
alter table public.tutor_students
  add column if not exists year_level text;

-- One row per (tutor, student, subject, stage) the tutor tutors them in.
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
