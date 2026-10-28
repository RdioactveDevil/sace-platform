-- Recurring assignments: a tutor sets work once and it is set again on a
-- schedule (e.g. 10 questions every Monday and Thursday).
--
-- assignment_schedules holds the template: everything an assignment has
-- (type, subject, topics, goal), who gets it and when it repeats. The
-- automated job (/api/cron/emails, lib/recurring-assignments.ts) creates an
-- ordinary assignments row for each student on each scheduled day, from 6am
-- Adelaide time, so the student side needs nothing new.
--
-- Targets are resolved at each issue, so a student who joins the class (or
-- roster, with all_roster) gets the next one, and one who leaves stops.
--
-- days_of_week  0 = Sunday … 6 = Saturday, Adelaide time.
-- every_weeks   1 = every week, 2 = every other week (counted from start_date's week).
-- due_days      Each assignment is due this many days after it is set (0 = same day).
-- last_issued_on  The last day the job set it, so a day is only set once.
--
-- Issued rows carry schedule_id and issued_on; the unique constraint means a
-- repeated or overlapping run can never give a student the same day twice.
-- Deleting a schedule keeps the work already set.
--
-- Read and written only through the API (service role), so no policies.

create table if not exists public.assignment_schedules (
  id             uuid primary key default gen_random_uuid(),
  tutor_id       uuid not null references public.profiles(id) on delete cascade,
  type           text not null check (type in ('Quiz', 'Test', 'Worksheet', 'Homework')),
  subject        text not null,
  topics         text[] not null default '{}',
  question_count integer not null check (question_count between 1 and 100),
  difficulty     text not null default 'adaptive'
    check (difficulty in ('adaptive', 'easy', 'medium', 'hard')),
  min_accuracy   integer check (min_accuracy is null or min_accuracy between 1 and 100),
  pass_mode      text not null default 'until_pass' check (pass_mode in ('until_pass', 'one_attempt')),
  remediation    boolean not null default true,
  student_ids    uuid[] not null default '{}',
  class_ids      uuid[] not null default '{}',
  all_roster     boolean not null default false,
  days_of_week   smallint[] not null
    check (cardinality(days_of_week) between 1 and 7 and days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]),
  every_weeks    smallint not null default 1 check (every_weeks in (1, 2)),
  due_days       smallint not null default 0 check (due_days between 0 and 13),
  start_date     date not null,
  end_date       date check (end_date is null or end_date >= start_date),
  notify         boolean not null default true,
  paused_at      timestamptz,
  last_issued_on date,
  created_at     timestamptz not null default now()
);
create index if not exists assignment_schedules_tutor_idx
  on public.assignment_schedules (tutor_id, created_at desc);
alter table public.assignment_schedules enable row level security;

alter table public.assignments
  add column if not exists schedule_id uuid references public.assignment_schedules(id) on delete set null,
  add column if not exists issued_on date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_schedule_day_key') then
    alter table public.assignments
      add constraint assignments_schedule_day_key unique (schedule_id, student_id, issued_on);
  end if;
end $$;
