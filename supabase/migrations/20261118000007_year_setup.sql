-- Set up your year: where a student's class is up to in a subject and their
-- test dates, for the weekly plan on
-- Practice (gradefarm components/YearSetupScreen.jsx, YearPlanCard.jsx,
-- lib/yearPlan.js).
--
-- year_setups        one row per student and subject.
--   current_subtopic_id   the subtopic their class is on now; everything before
--                         it in course order counts as done
--   skipped_subtopic_ids  earlier subtopics their class hasn't done
--   no_test_dates         they said "I don't know yet" (asked again later)
--   checked_in_at         the last weekly "Still on …?" answer
-- student_tests      a student's school tests, SATs, investigations and exams
--                    in a subject: name, kind, date and the subtopics in it;
--                    mark (0–100) once they say how it went.
-- The subject's external exam date is curricula.features.exam_date (Admin →
-- subject → Student features), which Home's countdown already uses.
--
-- Students read and write only their own rows.

set local lock_timeout = '10s';

create table if not exists public.year_setups (
  user_id              uuid not null references auth.users(id) on delete cascade,
  curriculum_id        uuid not null references public.curricula(id) on delete cascade,
  current_subtopic_id  uuid references public.curriculum_subtopics(id) on delete set null,
  skipped_subtopic_ids uuid[] not null default '{}',
  no_test_dates        boolean not null default false,
  checked_in_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (user_id, curriculum_id)
);

create table if not exists public.student_tests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  curriculum_id uuid not null references public.curricula(id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  kind          text not null default 'test' check (kind in ('test', 'sat', 'investigation', 'exam')),
  test_date     date not null,
  subtopic_ids  uuid[] not null default '{}',
  mark          smallint check (mark is null or mark between 0 and 100),
  created_at    timestamptz not null default now()
);
create index if not exists student_tests_user_subject_date on public.student_tests (user_id, curriculum_id, test_date);

alter table public.year_setups enable row level security;
alter table public.student_tests enable row level security;

drop policy if exists year_setups_own on public.year_setups;
create policy year_setups_own on public.year_setups
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists student_tests_own on public.student_tests;
create policy student_tests_own on public.student_tests
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
