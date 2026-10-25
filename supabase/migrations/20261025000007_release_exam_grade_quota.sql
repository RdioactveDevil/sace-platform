-- Give back exam-grade allowance that didn't produce questions.
--
-- A student's exam-grade top-up claims its questions from today's allowance
-- (use_exam_grade_quota) before generating, because generation is what costs.
-- The strict answer check can then drop questions, or the request can fail,
-- and those claimed questions were lost from the allowance. The API now hands
-- back the unused part with release_exam_grade_quota, so the allowance counts
-- only exam-grade questions that reached the bank.

create or replace function public.release_exam_grade_quota(p_user uuid, p_count integer)
returns void
language sql volatile security definer set search_path = public as $$
  -- Today's row, never below zero. (A claim made just before midnight and
  -- released after it comes off the new day's count, which stays >= 0.)
  update ai_usage
     set exam_questions = greatest(0, exam_questions - greatest(coalesce(p_count, 0), 0))
   where user_id = p_user
     and day = (now() at time zone 'Australia/Adelaide')::date
$$;

revoke all on function public.release_exam_grade_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.release_exam_grade_quota(uuid, integer) to service_role;
