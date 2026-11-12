-- Engagement: daily goal, streak freezes, personal bests, bonus questions and
-- weekly leagues.
--
--   • profiles.daily_goal: questions a day the student aims for (Home's ring).
--     day_answers / day_answers_date count today's answers (Adelaide days);
--     best_day_answers is the most in one day.
--   • Streak freezes: one is earned for every 10 right answers in a row in a
--     session (p_run), up to 2 held. A day missed is covered by a freeze, so
--     the streak carries on; freeze_days remembers which days were covered
--     (Home's week strip). Freezes are never sold.
--   • best_answer_run: the longest run of right answers in a row.
--   • Bonus questions (worth 2× XP, decided by the API) can earn more than the
--     old 150 XP cap for one answer, so the cap is now 300.
--   • Leagues: each week (Monday to Sunday, Adelaide) a student's first answer
--     puts them in a group of up to 20 at their league tier (league_members).
--     The top 5 of a group with any XP move up a tier when they next answer
--     (checked against last week's group). Nobody moves down. Students under
--     15, students hidden from leaderboards, tutors and admins aren't placed
--     in leagues: a league shows first names to students they don't know.
--     my_league() returns the caller's group.
--
-- award_xp_for() gains p_run (the run of right answers including this one)
-- and returns the new fields. Its old three-argument form is dropped so a
-- call by name can't be ambiguous; the API passes the same three names plus
-- p_run, and a call without p_run still works.

-- ── 1. Profile columns ──────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists daily_goal       smallint not null default 15,
  add column if not exists day_answers      integer  not null default 0,
  add column if not exists day_answers_date date,
  add column if not exists best_day_answers integer  not null default 0,
  add column if not exists best_answer_run  integer  not null default 0,
  add column if not exists streak_freezes   smallint not null default 0,
  add column if not exists freeze_days      date[]   not null default '{}',
  add column if not exists league_tier      smallint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_daily_goal_range') then
    alter table public.profiles add constraint profiles_daily_goal_range check (daily_goal between 5 and 200);
  end if;
end $$;

-- Students set their own daily goal (an ordinary column). Everything else
-- here is worked out by award_xp_for and guarded like xp and streak.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  -- SECURITY DEFINER functions run as their owner and the API uses
  -- service_role, so only direct PostgREST calls from end users are guarded.
  if current_user in ('authenticated', 'anon') then
    new.is_admin                    := old.is_admin;
    new.is_tutor                    := old.is_tutor;
    new.deactivated_at              := old.deactivated_at;
    new.tutor_application_status    := old.tutor_application_status;
    new.xp                          := old.xp;
    new.level                       := old.level;
    new.streak                      := old.streak;
    new.best_streak                 := old.best_streak;
    new.recent_correct              := old.recent_correct;
    new.recent_answers              := old.recent_answers;
    new.can_include_subject         := old.can_include_subject;
    new.account_holder              := old.account_holder;
    new.parent_name                 := old.parent_name;
    new.parent_email                := old.parent_email;
    new.parent_consent_at           := old.parent_consent_at;
    new.parent_consent_requested_at := old.parent_consent_requested_at;
    new.parent_report_week          := old.parent_report_week;
    new.parent_reports_stopped_at   := old.parent_reports_stopped_at;
    new.day_answers                 := old.day_answers;
    new.day_answers_date            := old.day_answers_date;
    new.best_day_answers            := old.best_day_answers;
    new.best_answer_run             := old.best_answer_run;
    new.streak_freezes              := old.streak_freezes;
    new.freeze_days                 := old.freeze_days;
    new.league_tier                 := old.league_tier;
    if coalesce(old.onboarding_completed, false)
       and old.parent_consent_at is null
       and public.needs_parent_consent(old.dob, old.year_level)
       and not public.needs_parent_consent(new.dob, new.year_level) then
      new.dob        := old.dob;
      new.year_level := old.year_level;
    end if;
  end if;
  return new;
end;
$$;

-- ── 2. League groups ────────────────────────────────────────────────────────
create table if not exists public.league_members (
  week      date        not null,  -- the Monday (Adelaide) the week starts
  user_id   uuid        not null references auth.users(id) on delete cascade,
  tier      smallint    not null,  -- 0 Bronze … 4 Diamond
  group_no  integer     not null,
  weekly_xp integer     not null default 0,
  joined_at timestamptz not null default now(),
  primary key (week, user_id)
);
create index if not exists league_members_group_idx on public.league_members (week, tier, group_no);
create index if not exists league_members_user_idx on public.league_members (user_id, week desc);

alter table public.league_members enable row level security;
drop policy if exists league_members_read_own on public.league_members;
create policy league_members_read_own on public.league_members
  for select using (auth.uid() = user_id);
-- Writes: award_xp_for only. Other students' rows: my_league() only.

-- The Monday of the Adelaide week containing p_day.
create or replace function public.league_week(p_day date)
returns date
language sql immutable
as $$ select p_day - (extract(isodow from p_day)::integer - 1) $$;

-- ── 3. award_xp_for ─────────────────────────────────────────────────────────
drop function if exists public.award_xp_for(uuid, integer, boolean);

create or replace function public.award_xp_for(
  p_user uuid,
  p_xp_earned integer,
  p_correct boolean default null,
  p_run integer default null
)
returns table (
  xp integer, streak integer, best_streak integer, recent_correct real, recent_answers real,
  streak_freezes smallint, freeze_used integer, freeze_earned boolean, best_answer_run integer,
  day_answers integer, best_day_answers integer, weekly_xp integer, league_tier smallint
)
language plpgsql security definer set search_path = public as $$
declare
  v_prof      public.profiles%rowtype;
  v_delta     integer := greatest(-60, least(coalesce(p_xp_earned, 0), 300));
  v_today     date := (now() at time zone 'Australia/Adelaide')::date;
  v_week      date := public.league_week((now() at time zone 'Australia/Adelaide')::date);
  v_last      date;
  v_gap       integer;
  v_streak    integer;
  v_freezes   integer;
  v_used      integer := 0;
  v_earned    boolean := false;
  v_days      date[];
  v_day_count integer;
  v_run       integer := case when p_correct then greatest(coalesce(p_run, 0), 0) else 0 end;
  v_decay     real := case when p_correct is null then 1 else 0.995 end;
  v_eligible  boolean;
  v_tier      integer;
  v_prev_tier integer;
  v_prev_xp   integer;
  v_prev_pos  integer;
  v_group     integer;
  v_weekly    integer;
begin
  select * into v_prof from public.profiles where id = p_user for update;
  if not found then raise exception 'profile not found'; end if;

  -- Day streak, with freezes covering missed days.
  v_freezes := coalesce(v_prof.streak_freezes, 0);
  v_days    := coalesce(v_prof.freeze_days, '{}');
  v_last    := (v_prof.last_active at time zone 'Australia/Adelaide')::date;
  v_gap     := v_today - v_last;
  if v_last is null or coalesce(v_prof.streak, 0) <= 0 then
    v_streak := 1;
  elsif v_gap <= 0 then
    v_streak := greatest(v_prof.streak, 1);
  elsif v_gap = 1 then
    v_streak := v_prof.streak + 1;
  elsif v_gap - 1 <= v_freezes then
    v_used    := v_gap - 1;
    v_freezes := v_freezes - v_used;
    v_streak  := v_prof.streak + 1;
    select coalesce(array_agg(d::date order by d), '{}') into v_days
      from (
        select unnest(v_days) as d
        union
        select generate_series(v_last + 1, v_today - 1, interval '1 day')::date
      ) s
     where d >= v_today - 60;
  else
    v_streak := 1;
  end if;

  -- A freeze for every 10 right in a row, up to 2 held.
  if p_correct and v_run > 0 and v_run % 10 = 0 and v_freezes < 2 then
    v_freezes := v_freezes + 1;
    v_earned  := true;
  end if;

  -- Today's answers (only real answers count, not bonus-only awards).
  v_day_count := case
    when p_correct is null then case when v_prof.day_answers_date = v_today then coalesce(v_prof.day_answers, 0) else 0 end
    when v_prof.day_answers_date = v_today then coalesce(v_prof.day_answers, 0) + 1
    else 1
  end;

  -- League: join this week's group on the first XP of the week.
  v_tier := coalesce(v_prof.league_tier, 0);
  v_eligible := v_prof.deactivated_at is null
    and not coalesce(v_prof.hide_from_leaderboard, false)
    and not coalesce(v_prof.is_admin, false)
    and not coalesce(v_prof.is_tutor, false)
    and not public.needs_parent_consent(v_prof.dob, v_prof.year_level);
  if v_eligible and not exists (select 1 from public.league_members m where m.week = v_week and m.user_id = p_user) then
    -- Top 5 of last week's group (with some XP) move up a tier.
    select lm.tier, lm.weekly_xp,
           1 + (select count(*) from public.league_members o
                 where o.week = lm.week and o.tier = lm.tier and o.group_no = lm.group_no
                   and (o.weekly_xp > lm.weekly_xp or (o.weekly_xp = lm.weekly_xp and o.joined_at < lm.joined_at)))
      into v_prev_tier, v_prev_xp, v_prev_pos
      from public.league_members lm
     where lm.week = v_week - 7 and lm.user_id = p_user;
    if v_prev_tier is not null and v_prev_pos <= 5 and v_prev_xp > 0 then
      v_tier := least(4, greatest(v_tier, v_prev_tier + 1));
    end if;

    perform pg_advisory_xact_lock(hashtext('league:' || v_week::text || ':' || v_tier::text));
    select g.group_no into v_group
      from (select m.group_no, count(*) as n from public.league_members m
             where m.week = v_week and m.tier = v_tier group by m.group_no) g
     where g.n < 20
     order by g.group_no
     limit 1;
    if v_group is null then
      select coalesce(max(m.group_no), 0) + 1 into v_group
        from public.league_members m where m.week = v_week and m.tier = v_tier;
    end if;
    insert into public.league_members (week, user_id, tier, group_no) values (v_week, p_user, v_tier, v_group);
  end if;
  update public.league_members m
     set weekly_xp = m.weekly_xp + v_delta
   where m.week = v_week and m.user_id = p_user
  returning m.weekly_xp into v_weekly;

  update public.profiles p
     set xp               = greatest(0, coalesce(p.xp, 0) + v_delta),
         streak           = v_streak,
         best_streak      = greatest(coalesce(p.best_streak, 0), v_streak),
         last_active      = now(),
         recent_correct   = p.recent_correct * v_decay + (case when p_correct then 1 else 0 end),
         recent_answers   = p.recent_answers * v_decay + (case when p_correct is null then 0 else 1 end),
         streak_freezes   = v_freezes,
         freeze_days      = v_days,
         best_answer_run  = greatest(coalesce(p.best_answer_run, 0), v_run),
         day_answers      = v_day_count,
         day_answers_date = v_today,
         best_day_answers = greatest(coalesce(p.best_day_answers, 0), v_day_count),
         league_tier      = v_tier
   where p.id = p_user
  returning p.xp, p.streak, p.best_streak, p.recent_correct, p.recent_answers,
            p.streak_freezes, p.best_answer_run, p.day_answers, p.best_day_answers, p.league_tier
       into xp, streak, best_streak, recent_correct, recent_answers,
            streak_freezes, best_answer_run, day_answers, best_day_answers, league_tier;

  freeze_used   := v_used;
  freeze_earned := v_earned;
  weekly_xp     := v_weekly;
  return next;
end;
$$;

revoke execute on function public.award_xp_for(uuid, integer, boolean, integer) from public, anon, authenticated;
grant execute on function public.award_xp_for(uuid, integer, boolean, integer) to service_role;

-- ── 4. The caller's league group ────────────────────────────────────────────
-- First name and last initial only. Students who have since hidden themselves
-- from leaderboards are left out of everyone else's list.
create or replace function public.my_league()
returns table (
  week date, ends_at timestamptz, tier smallint, place integer, name text,
  weekly_xp integer, is_me boolean
)
language sql stable security definer set search_path = public as $$
  with me as (
    select m.week, m.tier, m.group_no
      from public.league_members m
     where m.user_id = auth.uid()
       and m.week = public.league_week((now() at time zone 'Australia/Adelaide')::date)
  ),
  grp as (
    select m.user_id, m.weekly_xp, m.joined_at, p.display_name
      from public.league_members m
      join me on me.week = m.week and me.tier = m.tier and me.group_no = m.group_no
      join public.profiles p on p.id = m.user_id
     where m.user_id = auth.uid() or not coalesce(p.hide_from_leaderboard, false)
  )
  select me.week,
         ((me.week + 7)::timestamp at time zone 'Australia/Adelaide') as ends_at,
         me.tier,
         (row_number() over (order by g.weekly_xp desc, g.joined_at))::integer as place,
         trim(split_part(coalesce(nullif(trim(g.display_name), ''), 'Student'), ' ', 1)
              || case when split_part(trim(g.display_name), ' ', 2) <> ''
                      then ' ' || upper(left(split_part(trim(g.display_name), ' ', 2), 1)) || '.'
                      else '' end) as name,
         greatest(g.weekly_xp, 0) as weekly_xp,
         g.user_id = auth.uid() as is_me
    from grp g cross join me
   order by g.weekly_xp desc, g.joined_at
$$;

revoke all on function public.my_league() from public, anon;
grant execute on function public.my_league() to authenticated;

-- ── 5. Leaderboard view: a streak held by freezes still shows ───────────────
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
         >= (now() at time zone 'Australia/Adelaide')::date - 1 - coalesce(streak_freezes, 0)
    then streak
    else 0
  end as streak,
  recent_correct,
  recent_answers,
  rank() over (order by xp desc) as position
from public.profiles
where deactivated_at is null
  and not hide_from_leaderboard
  and not public.needs_parent_consent(dob, year_level)
order by xp desc;

revoke all on public.leaderboard from anon;
grant select on public.leaderboard to authenticated;

-- ── 6. Bests from what's already recorded ───────────────────────────────────
-- Most answers in one Adelaide day, from the answer log.
update public.profiles p
   set best_day_answers = b.n
  from (
    select user_id, max(n)::integer as n
      from (select user_id, (answered_at at time zone 'Australia/Adelaide')::date as d, count(*) as n
              from public.answer_log group by 1, 2) per_day
     group by user_id
  ) b
 where b.user_id = p.id and b.n > coalesce(p.best_day_answers, 0);
