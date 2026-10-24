-- Diagnostics for tutor-included subjects.
--
-- When a tutor includes a subject for a student (on the invite or from the
-- roster), the student does a 20-question diagnostic on it before they can
-- practise it. It reuses diagnostic_assessments (the tutor's Diagnostic tab
-- lists it and shows the marked report) with:
--   student_id / curriculum_id  whose diagnostic, on which subject: one per
--                               student and subject
--   subtopic_ids                the curriculum subtopics it covers; empty =
--                               the whole curriculum
--   generation_started_at       claimed while the questions are being written
--   questions_ready_at          set once they're written
--   waived_at                   the tutor let the student skip it
--
-- tutor_invites.diagnostic_subtopics: the subtopics the tutor picked per
-- subject on the invite ({ "<curriculum id>": ["<subtopic id>", …] }).
--
-- Leaving the tutor's roster drops the diagnostics they set that weren't done.

set local lock_timeout = '10s';

alter table public.diagnostic_assessments
  add column if not exists student_id            uuid references public.profiles (id) on delete cascade,
  add column if not exists curriculum_id         uuid references public.curricula (id) on delete cascade,
  add column if not exists subtopic_ids          uuid[] not null default '{}',
  add column if not exists generation_started_at timestamptz,
  add column if not exists questions_ready_at    timestamptz,
  add column if not exists waived_at             timestamptz;

create unique index if not exists diagnostic_assessments_one_per_student_subject
  on public.diagnostic_assessments (student_id, curriculum_id) where student_id is not null;

alter table public.tutor_invites
  add column if not exists diagnostic_subtopics jsonb not null default '{}';

-- Leaving the roster also drops that tutor's unfinished diagnostics.
create or replace function public.end_tutor_included_subject()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_subscriptions
   where user_id = old.student_id
     and source = 'tutor'
     and sponsor_tutor_id = old.tutor_id;
  delete from public.diagnostic_assessments
   where student_id = old.student_id
     and tutor_id = old.tutor_id
     and status = 'pending';
  return old;
end;
$$;
