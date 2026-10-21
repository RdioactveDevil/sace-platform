-- Assignment goals: the tutor chooses how many questions finish an assignment,
-- at what difficulty they are served, and optionally a pass mark.
--
-- question_count  Questions the student must answer to complete it. NULL on
--                 assignments created before this migration: those keep the
--                 old rule (complete when a session with ≥1 answer ends).
-- difficulty      'adaptive' (default: the engine follows the student's level)
--                 or a fixed band: 'easy' (1–2★), 'medium' (3★), 'hard' (4–5★).
-- min_accuracy    Optional pass mark (%). When set, the assignment completes
--                 only once the student's most recent question_count answers
--                 reach it, so they keep practising until they do. A rolling
--                 window (not all-time accuracy) keeps a poor start from making
--                 the mark unreachable.
-- progress_count  Questions answered so far (capped at question_count), across
--                 sessions, so a student can stop half way and pick up later.
-- recent_results  Correctness of the most recent question_count answers,
--                 oldest first.

alter table public.assignments
  add column if not exists question_count integer
    check (question_count is null or question_count between 1 and 100),
  add column if not exists difficulty text not null default 'adaptive'
    check (difficulty in ('adaptive', 'easy', 'medium', 'hard')),
  add column if not exists min_accuracy integer
    check (min_accuracy is null or min_accuracy between 1 and 100),
  add column if not exists progress_count integer not null default 0
    check (progress_count >= 0),
  add column if not exists recent_results boolean[] not null default '{}';

-- Students record each answer through this RPC (direct UPDATE on assignments
-- is revoked). It completes the assignment once the count — and the pass mark,
-- if any — is met, and returns the new state.
create or replace function public.record_assignment_answer(p_assignment_id uuid, p_correct boolean)
returns table (
  progress_count integer,
  question_count integer,
  min_accuracy   integer,
  recent_results boolean[],
  completed_at   timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count    integer;
  v_min      integer;
  v_progress integer;
  v_recent   boolean[];
  v_correct  integer;
begin
  select a.question_count, a.min_accuracy, a.progress_count, a.recent_results
  into   v_count, v_min, v_progress, v_recent
  from   public.assignments a
  where  a.id = p_assignment_id
    and  a.student_id = auth.uid()
    and  a.question_count is not null
    and  a.completed_at is null
  for update;
  if not found then
    return;
  end if;

  v_progress := least(v_progress + 1, v_count);
  v_recent   := v_recent || coalesce(p_correct, false);
  if cardinality(v_recent) > v_count then
    v_recent := v_recent[cardinality(v_recent) - v_count + 1 : cardinality(v_recent)];
  end if;
  select count(*) filter (where r) into v_correct from unnest(v_recent) as r;

  return query
  update public.assignments a
  set    progress_count = v_progress,
         recent_results = v_recent,
         completed_at   = case
                            when v_progress >= v_count
                             and (v_min is null or v_correct * 100 >= v_min * cardinality(v_recent))
                            then now()
                          end
  where  a.id = p_assignment_id
  returning a.progress_count, a.question_count, a.min_accuracy, a.recent_results, a.completed_at;
end;
$$;

revoke all on function public.record_assignment_answer(uuid, boolean) from public;
revoke all on function public.record_assignment_answer(uuid, boolean) from anon;
grant execute on function public.record_assignment_answer(uuid, boolean) to authenticated;
