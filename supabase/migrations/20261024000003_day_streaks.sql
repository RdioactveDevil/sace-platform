-- Streaks count days, not answers.
--
-- profiles.streak is shown everywhere as a day streak ("3 days"), but the app
-- sent its in-quiz run of correct answers as award_xp's p_new_streak, so it
-- actually held the current run of right answers: it dropped to 0 on any wrong
-- answer and best_streak was the longest run of right answers. The quiz also
-- started each session's XP streak bonus from that stored value.
--
-- After this migration:
--   • award_xp() works the day streak out itself, in Adelaide time (the same
--     zone the reminder emails use): the first answer of a day continues the
--     streak if the last one was yesterday, otherwise starts it again at 1.
--     p_new_streak is ignored and kept only so existing callers still work.
--   • streak / best_streak are rebuilt from answer_log: the run of consecutive
--     days ending on the user's latest active day, and the longest run.
--   • A streak whose last active day is before yesterday has lapsed. The
--     stored value only changes on the user's next answer, so readers show it
--     as 0 (the leaderboard view here; the app and API do the same).

-- ── 1. award_xp: day streak ─────────────────────────────────────────────────
create or replace function public.award_xp(
  p_xp_earned integer,
  p_new_streak integer,
  p_correct boolean default null
)
returns table (xp integer, streak integer, best_streak integer, recent_correct real, recent_answers real)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_prof  public.profiles%rowtype;
  v_delta integer := greatest(-60, least(coalesce(p_xp_earned, 0), 150));
  v_today date := (now() at time zone 'Australia/Adelaide')::date;
  v_last  date;
  v_streak integer;
  v_decay real := case when p_correct is null then 1 else 0.995 end;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  select * into v_prof from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'profile not found';
  end if;

  v_last := (v_prof.last_active at time zone 'Australia/Adelaide')::date;
  v_streak := case
    when v_last = v_today     then greatest(coalesce(v_prof.streak, 0), 1)
    when v_last = v_today - 1 then coalesce(v_prof.streak, 0) + 1
    else 1
  end;

  update public.profiles p
     set xp             = greatest(0, coalesce(p.xp, 0) + v_delta),
         streak         = v_streak,
         best_streak    = greatest(coalesce(p.best_streak, 0), v_streak),
         last_active    = now(),
         recent_correct = p.recent_correct * v_decay + (case when p_correct then 1 else 0 end),
         recent_answers = p.recent_answers * v_decay + (case when p_correct is null then 0 else 1 end)
   where p.id = v_uid
  returning p.xp, p.streak, p.best_streak, p.recent_correct, p.recent_answers
       into xp, streak, best_streak, recent_correct, recent_answers;

  return next;
end;
$$;

revoke all on function public.award_xp(integer, integer, boolean) from public, anon;
grant execute on function public.award_xp(integer, integer, boolean) to authenticated;

-- ── 2. Rebuild streaks from answer_log ───────────────────────────────────────
-- Consecutive days share (day - its position in the user's day list), so each
-- run of days is one group.
with days as (
  select distinct user_id, (answered_at at time zone 'Australia/Adelaide')::date as d
    from public.answer_log
),
grouped as (
  select user_id, d, d - (row_number() over (partition by user_id order by d))::integer as grp
    from days
),
runs as (
  select user_id, count(*)::integer as len, max(d) as last_day
    from grouped
   group by user_id, grp
),
per_user as (
  select user_id,
         max(len) as best,
         (array_agg(len order by last_day desc))[1] as latest
    from runs
   group by user_id
)
update public.profiles p
   set streak      = u.latest,
       best_streak = u.best
  from per_user u
 where u.user_id = p.id;

update public.profiles p
   set streak = 0, best_streak = 0
 where (coalesce(p.streak, 0) <> 0 or coalesce(p.best_streak, 0) <> 0)
   and not exists (select 1 from public.answer_log a where a.user_id = p.id);

-- ── 3. Leaderboard view: a lapsed streak shows as 0 ──────────────────────────
create or replace view public.leaderboard
with (security_invoker = false)
as
select
  id,
  display_name,
  school,
  xp,
  level,
  case
    when (last_active at time zone 'Australia/Adelaide')::date
         >= (now() at time zone 'Australia/Adelaide')::date - 1
    then streak
    else 0
  end as streak,
  recent_correct,
  recent_answers,
  rank() over (order by xp desc) as position
from public.profiles
where deactivated_at is null
order by xp desc;

revoke all on public.leaderboard from anon;
grant select on public.leaderboard to authenticated;
