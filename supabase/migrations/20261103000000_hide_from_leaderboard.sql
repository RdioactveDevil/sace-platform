-- Leaderboard opt-out: some students don't want their name and XP shown to
-- others. When hide_from_leaderboard is on, the student is left off every
-- class leaderboard (API) and off the all-users leaderboard view. Users set it
-- on their own row from Account → Preferences (existing profiles policies;
-- it isn't a protected column).
alter table public.profiles
  add column if not exists hide_from_leaderboard boolean not null default false;

-- Same view as 20261025000012_parent_consent, plus the opt-out.
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
  and not hide_from_leaderboard
  and not public.needs_parent_consent(dob, year_level)
order by xp desc;

revoke all on public.leaderboard from anon;
grant select on public.leaderboard to authenticated;
