-- Assignment reports and pass/fail assignments.
--
-- 1. pass_mode: what a pass mark (min_accuracy) means.
--      'until_pass'  — the student keeps practising until their most recent
--                      question_count answers reach the mark (the original
--                      behaviour; `passed` is true once complete).
--      'one_attempt' — the assignment ends at question_count whatever the
--                      score; `passed` records whether they reached the mark.
--    Ignored when there is no pass mark.
-- 2. assignment_answers: every answer given toward an assignment, so the
--    tutor's report can show each question, the student's response and time.
--    Written only by record_assignment_answer(); read through the API.
-- 3. report_summary: the AI write-up shown on the tutor's report, cached so it
--    is generated once. tutor_notified_at: when the tutor was emailed that the
--    assignment finished.
-- 4. remediation: whether a wrong answer gives the student similar practice
--    questions (the default) or the assignment runs as a straight quiz, so the
--    tutor sees what the student can do unaided.

alter table public.assignments
  add column if not exists pass_mode text not null default 'until_pass'
    check (pass_mode in ('until_pass', 'one_attempt')),
  add column if not exists passed boolean,
  add column if not exists report_summary jsonb,
  add column if not exists tutor_notified_at timestamptz,
  add column if not exists remediation boolean not null default true;

create table if not exists public.assignment_answers (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments(id) on delete cascade,
  student_id     uuid not null references public.profiles(id) on delete cascade,
  question_id    text,
  correct        boolean not null,
  -- What the student answered: an option index for MCQs, otherwise the
  -- response the question renderer produced.
  response       jsonb,
  time_taken_ms  integer,
  answered_at    timestamptz not null default now()
);
create index if not exists assignment_answers_assignment_idx
  on public.assignment_answers (assignment_id, answered_at);
alter table public.assignment_answers enable row level security;

-- Replaces the two-argument version. The new arguments have defaults, so a
-- client still calling it with (p_assignment_id, p_correct) keeps working.
drop function if exists public.record_assignment_answer(uuid, boolean);

create or replace function public.record_assignment_answer(
  p_assignment_id uuid,
  p_correct       boolean,
  p_question_id   text    default null,
  p_response      jsonb   default null,
  p_time_ms       integer default null
)
returns table (
  progress_count integer,
  question_count integer,
  min_accuracy   integer,
  pass_mode      text,
  recent_results boolean[],
  passed         boolean,
  completed_at   timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count    integer;
  v_min      integer;
  v_mode     text;
  v_progress integer;
  v_recent   boolean[];
  v_correct  integer;
  v_meets    boolean;
  v_done     boolean;
begin
  select a.question_count, a.min_accuracy, a.pass_mode, a.progress_count, a.recent_results
  into   v_count, v_min, v_mode, v_progress, v_recent
  from   public.assignments a
  where  a.id = p_assignment_id
    and  a.student_id = auth.uid()
    and  a.question_count is not null
    and  a.completed_at is null
  for update;
  if not found then
    return;
  end if;

  insert into public.assignment_answers (assignment_id, student_id, question_id, correct, response, time_taken_ms)
  values (p_assignment_id, auth.uid(), p_question_id, coalesce(p_correct, false), p_response,
          case when p_time_ms between 0 and 86400000 then p_time_ms end);

  v_progress := least(v_progress + 1, v_count);
  v_recent   := v_recent || coalesce(p_correct, false);
  if cardinality(v_recent) > v_count then
    v_recent := v_recent[cardinality(v_recent) - v_count + 1 : cardinality(v_recent)];
  end if;
  select count(*) filter (where r) into v_correct from unnest(v_recent) as r;
  v_meets := v_min is null or v_correct * 100 >= v_min * cardinality(v_recent);
  v_done  := v_progress >= v_count and (v_meets or v_mode = 'one_attempt');

  return query
  update public.assignments a
  set    progress_count = v_progress,
         recent_results = v_recent,
         completed_at   = case when v_done then now() end,
         passed         = case when v_done and v_min is not null then v_meets end
  where  a.id = p_assignment_id
  returning a.progress_count, a.question_count, a.min_accuracy, a.pass_mode, a.recent_results, a.passed, a.completed_at;
end;
$$;

revoke all on function public.record_assignment_answer(uuid, boolean, text, jsonb, integer) from public;
revoke all on function public.record_assignment_answer(uuid, boolean, text, jsonb, integer) from anon;
grant execute on function public.record_assignment_answer(uuid, boolean, text, jsonb, integer) to authenticated;
