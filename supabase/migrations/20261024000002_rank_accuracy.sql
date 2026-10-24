-- Ranks need accuracy as well as XP.
--
-- Until now rank came from XP alone, and XP grew at almost any accuracy (a
-- wrong answer cost little and its remediation questions paid it back), so a
-- student answering half their questions right still reached the top rank.
-- The higher ranks now also need a minimum recent accuracy (see RANK_TIERS in
-- the app's engine), and this migration stores what that accuracy is read from.
--
--   • profiles.recent_correct / recent_answers: decayed counts of the user's
--     answers. Each answer multiplies both by 0.995, then adds 1 to
--     recent_answers (and to recent_correct if it was right), so the last ~200
--     answers carry most of the weight. Recent accuracy = recent_correct /
--     recent_answers. Backfilled from answer_log.
--   • award_xp() takes p_correct: true/false for a graded answer (updates the
--     counts), null for a bonus (leaves them alone). It also allows a bigger
--     penalty, since a wrong answer now costs up to 5 * 12 = 60.
--   • Both columns are protected like xp, and exposed on the leaderboard view.

-- ── 1. Columns ───────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists recent_correct real not null default 0;
alter table public.profiles add column if not exists recent_answers real not null default 0;

-- ── 2. Backfill from answer_log ──────────────────────────────────────────────
-- The n-th most recent answer weighs 0.995^(n-1). Past 2000 answers the weight
-- is under 0.0001, so older rows are skipped.
with ranked as (
  select user_id,
         correct,
         row_number() over (partition by user_id order by answered_at desc) as n
    from public.answer_log
),
weighted as (
  select user_id,
         sum(power(0.995, n - 1))                                  as answers,
         sum(case when correct then power(0.995, n - 1) else 0 end) as correct
    from ranked
   where n <= 2000
   group by user_id
)
update public.profiles p
   set recent_answers = w.answers,
       recent_correct = w.correct
  from weighted w
 where w.user_id = p.id;

-- ── 3. Guard trigger: the counts are server-written only ─────────────────────
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  -- SECURITY DEFINER functions run as their owner and the API uses
  -- service_role, so only direct PostgREST calls from end users are guarded.
  if current_user in ('authenticated', 'anon') then
    new.is_admin                 := old.is_admin;
    new.is_tutor                 := old.is_tutor;
    new.deactivated_at           := old.deactivated_at;
    new.tutor_application_status := old.tutor_application_status;
    new.xp                       := old.xp;
    new.level                    := old.level;
    new.streak                   := old.streak;
    new.best_streak              := old.best_streak;
    new.recent_correct           := old.recent_correct;
    new.recent_answers           := old.recent_answers;
  end if;
  return new;
end;
$$;

-- ── 4. award_xp with p_correct ───────────────────────────────────────────────
-- The return type changes, so the old function is dropped rather than
-- replaced. Callers that still pass only (p_xp_earned, p_new_streak) keep
-- working: p_correct defaults to null.
drop function if exists public.award_xp(integer, integer);

-- p_xp_earned is clamped to what one answer (or session bonus) can be worth:
-- calcXP tops out at 5 * 12 * 2 = 120 and a wrong answer costs at most 60.
-- The streak can only grow by one per call, and resets to 1 if the user wasn't
-- active today or yesterday (same rule the client used to apply).
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
  v_streak integer;
  v_active_recently boolean;
  v_decay real := case when p_correct is null then 1 else 0.995 end;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  select * into v_prof from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'profile not found';
  end if;

  v_active_recently := v_prof.last_active is not null
    and v_prof.last_active::date >= (now() - interval '1 day')::date;

  v_streak := greatest(0, least(coalesce(p_new_streak, 0), coalesce(v_prof.streak, 0) + 1));
  if not v_active_recently and v_streak > 0 then
    v_streak := 1;
  end if;

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

-- ── 5. Leaderboard view exposes the counts (ranks are drawn from them) ───────
drop view if exists public.leaderboard;
create view public.leaderboard
with (security_invoker = false)
as
select
  id,
  display_name,
  school,
  xp,
  level,
  streak,
  recent_correct,
  recent_answers,
  rank() over (order by xp desc) as position
from public.profiles
where deactivated_at is null
order by xp desc;

revoke all on public.leaderboard from anon;
grant select on public.leaderboard to authenticated;
