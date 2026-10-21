-- Assignment goals: the tutor chooses how many questions finish an assignment
-- and at what difficulty they are served.
--
-- question_count  Questions the student must answer to complete it. NULL on
--                 assignments created before this migration: those keep the
--                 old rule (complete when a session with ≥1 answer ends).
-- difficulty      'adaptive' (default: the engine follows the student's level)
--                 or a fixed band: 'easy' (1–2★), 'medium' (3★), 'hard' (4–5★).
-- progress_count  Questions answered so far, across sessions, so a student
--                 can stop half way and pick up where they left off.

alter table public.assignments
  add column if not exists question_count integer
    check (question_count is null or question_count between 1 and 100),
  add column if not exists difficulty text not null default 'adaptive'
    check (difficulty in ('adaptive', 'easy', 'medium', 'hard')),
  add column if not exists progress_count integer not null default 0
    check (progress_count >= 0);

-- Students record progress through this RPC (direct UPDATE on assignments is
-- revoked). Progress only moves forward and is capped at question_count; the
-- assignment is completed once the count is reached.
create or replace function public.record_assignment_progress(p_assignment_id uuid, p_progress integer)
returns table (progress_count integer, question_count integer, completed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.assignments a
  set    progress_count = greatest(a.progress_count, least(greatest(p_progress, 0), a.question_count)),
         completed_at   = case
                            when greatest(a.progress_count, least(greatest(p_progress, 0), a.question_count)) >= a.question_count
                            then coalesce(a.completed_at, now())
                            else a.completed_at
                          end
  where  a.id = p_assignment_id
    and  a.student_id = auth.uid()
    and  a.question_count is not null
    and  a.completed_at is null
  returning a.progress_count, a.question_count, a.completed_at;
end;
$$;

revoke all on function public.record_assignment_progress(uuid, integer) from public;
revoke all on function public.record_assignment_progress(uuid, integer) from anon;
grant execute on function public.record_assignment_progress(uuid, integer) to authenticated;
