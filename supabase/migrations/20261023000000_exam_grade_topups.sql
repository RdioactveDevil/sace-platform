-- Exam-grade top-ups for strong students.
--
-- When a subject switches on features.exam_grade_topups (Admin → Curricula →
-- Student features), a student working at difficulty 4+ gets their background
-- bank top-ups written by the exam-grade generator (stronger model, strict
-- answer check) instead of the everyday one. That costs far more per question,
-- so each student has a daily allowance (features.exam_grade_daily_limit,
-- default 9 questions), counted here alongside their other AI use, and only
-- students with a paid, granted or beta subscription to that subject qualify
-- (not the free subject).

alter table public.ai_usage
  add column if not exists exam_questions integer not null default 0;

-- Claim p_count exam-grade questions of p_user's allowance for today if they
-- qualify for p_curriculum and it fits p_limit. Returns whether it was claimed.
-- Called by the API (service role) before generating.
create or replace function public.use_exam_grade_quota(p_user uuid, p_curriculum uuid, p_count integer, p_limit integer)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Australia/Adelaide')::date;
  claimed boolean;
begin
  if p_count < 1 or p_limit < 1 then return false; end if;
  -- Same subject/stage matching as readable_curriculum_ids(), minus free rows.
  if not exists (
    select 1
    from curricula c
    join user_subscriptions s
      on s.user_id = p_user
     and s.active
     and s.source <> 'free'
     and s.subject_name = c.name
     and (coalesce(s.stage, '') = '' or coalesce(trim(c.level_label), '') in ('', s.stage))
    where c.id = p_curriculum
  ) then
    return false;
  end if;
  insert into ai_usage (user_id, day) values (p_user, today)
    on conflict (user_id, day) do nothing;
  update ai_usage set exam_questions = exam_questions + p_count
    where user_id = p_user and day = today and exam_questions + p_count <= p_limit
    returning true into claimed;
  return coalesce(claimed, false);
end
$$;

revoke all on function public.use_exam_grade_quota(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.use_exam_grade_quota(uuid, uuid, integer, integer) to service_role;
