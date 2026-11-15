-- Written-answer top-ups for students.
--
-- In a subject with written answers switched on (features.written_answers),
-- a student who has used up the written-answer questions in a subtopic gets
-- more written for them in the background (POST /api/marked/top-up). Each one
-- is written by the stronger model and checked twice, so it costs far more
-- than a multiple-choice question. Each student has a daily allowance
-- (features.marked_topup_daily_limit, default 6 questions), counted here
-- alongside their other AI use, and only students with a paid, granted or
-- beta subscription to that subject qualify (not the free subject).

alter table public.ai_usage
  add column if not exists marked_questions integer not null default 0;

-- Claim up to p_count of p_user's written-answer top-ups for today, if they
-- qualify for p_curriculum. Returns how many were claimed: p_count, fewer when
-- only that many are left of p_limit, or 0. Called by the API (service role)
-- before generating; it gives back what didn't reach the bank with
-- release_marked_topup_quota.
create or replace function public.use_marked_topup_quota(p_user uuid, p_curriculum uuid, p_count integer, p_limit integer)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Australia/Adelaide')::date;
  used integer;
  claimed integer;
begin
  if coalesce(p_count, 0) < 1 or coalesce(p_limit, 0) < 1 then return 0; end if;
  -- Same subject/stage matching as use_exam_grade_quota(), minus free rows.
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
    return 0;
  end if;
  insert into ai_usage (user_id, day) values (p_user, today)
    on conflict (user_id, day) do nothing;
  -- Locked, so two top-ups at once can't both take the last of the allowance.
  select marked_questions into used from ai_usage
    where user_id = p_user and day = today
    for update;
  claimed := greatest(0, least(p_count, p_limit - coalesce(used, 0)));
  if claimed > 0 then
    update ai_usage set marked_questions = marked_questions + claimed
      where user_id = p_user and day = today;
  end if;
  return claimed;
end
$$;

-- Give back claimed top-ups that didn't produce questions (the checks dropped
-- them, or the request failed), so the allowance counts only questions saved.
create or replace function public.release_marked_topup_quota(p_user uuid, p_count integer)
returns void
language sql volatile security definer set search_path = public as $$
  update ai_usage
     set marked_questions = greatest(0, marked_questions - greatest(coalesce(p_count, 0), 0))
   where user_id = p_user
     and day = (now() at time zone 'Australia/Adelaide')::date
$$;

revoke all on function public.use_marked_topup_quota(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.use_marked_topup_quota(uuid, uuid, integer, integer) to service_role;
revoke all on function public.release_marked_topup_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.release_marked_topup_quota(uuid, integer) to service_role;
