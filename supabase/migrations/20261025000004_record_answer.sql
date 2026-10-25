-- One round trip per answer, and answers to non-MCQ questions are logged.
--
-- The app recorded an answer with three requests: read the struggle row, then
-- update or insert it, plus an answer_log insert. Two answers to the same
-- question in quick succession could also read the same row and lose one.
--
-- answer_log.selected (the chosen option) was NOT NULL, but numeric, ordering
-- and other non-MCQ answers have no option index and were sent as null, so
-- their answer_log insert failed silently: those answers never counted towards
-- day streaks, history or tutor progress.
--
-- After this migration:
--   • answer_log.selected may be null (no option index for that question type).
--   • record_answer() logs the answer and updates the caller's struggle row in
--     one call, working out next_review the same way nextReviewTime() in
--     src/lib/engine.js does.

alter table public.answer_log alter column selected drop not null;

-- Mirrors nextReviewTime() in artifacts/gradefarm/src/lib/engine.js.
create or replace function public.struggle_next_review(p_attempts integer, p_wrong integer)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select now() + make_interval(hours => case
    when p_attempts - p_wrong = 0 or p_wrong * 2 >= p_attempts then 1
    when p_attempts - p_wrong = 1  then case when (p_attempts - p_wrong) * 4 >= p_attempts * 3 then 48   else 24  end
    when p_attempts - p_wrong = 2  then case when (p_attempts - p_wrong) * 4 >= p_attempts * 3 then 168  else 96  end
    when p_attempts - p_wrong <= 4 then case when (p_attempts - p_wrong) * 4 >= p_attempts * 3 then 504  else 336 end
    else                                case when (p_attempts - p_wrong) * 4 >= p_attempts * 3 then 1440 else 720 end
  end)
$$;

create or replace function public.record_answer(
  p_question_id text,
  p_correct     boolean,
  p_selected    integer default null,
  p_session_id  uuid    default null,
  p_time_ms     integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_wrong integer := case when p_correct then 0 else 1 end;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  insert into public.answer_log (user_id, session_id, question_id, selected, correct, time_taken_ms)
  values (v_uid, p_session_id, p_question_id, p_selected, coalesce(p_correct, false),
          case when p_time_ms between 0 and 86400000 then p_time_ms end);

  insert into public.struggle_profiles as s (user_id, question_id, attempts, wrong, last_seen, next_review)
  values (v_uid, p_question_id, 1, v_wrong, now(), public.struggle_next_review(1, v_wrong))
  on conflict (user_id, question_id) do update
     set attempts    = s.attempts + 1,
         wrong       = s.wrong + v_wrong,
         last_seen   = now(),
         next_review = public.struggle_next_review(s.attempts + 1, s.wrong + v_wrong);
end;
$$;

revoke all on function public.struggle_next_review(integer, integer) from public, anon;
revoke all on function public.record_answer(text, boolean, integer, uuid, integer) from public, anon;
grant execute on function public.record_answer(text, boolean, integer, uuid, integer) to authenticated;
