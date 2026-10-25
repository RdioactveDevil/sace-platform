-- Parents on a student's own account: consent for young students, and weekly
-- progress reports without a tutor.
--
--   • A parent can set up the account for their child (account_holder =
--     'parent'): they sign in with their own email, agree on the child's behalf
--     at onboarding, and that email gets the weekly report.
--   • A student under 15 who signs up themselves gives a parent's email; the
--     parent confirms from a signed link (POST /api/parent/consent). Until
--     then the API holds back the AI features (Titan AI, AI tips and feedback).
--     Under 15 follows the OAIC's guide for when someone can consent for
--     themselves; with no date of birth, Year 9 and below counts.
--   • A confirmed parent email gets the same Sunday report a tutor can send
--     (lib/parent-reports.ts), claimed per week in parent_report_week, until the
--     parent's unsubscribe link sets parent_reports_stopped_at.
--
-- Every parent column is written by the API (service role) only.

alter table public.profiles add column if not exists account_holder text
  check (account_holder in ('student', 'parent'));
alter table public.profiles add column if not exists parent_name text;
alter table public.profiles add column if not exists parent_email text;
alter table public.profiles add column if not exists parent_consent_at timestamptz;
alter table public.profiles add column if not exists parent_consent_requested_at timestamptz;
alter table public.profiles add column if not exists parent_report_week date;
alter table public.profiles add column if not exists parent_reports_stopped_at timestamptz;

-- Same rule as needsParentConsent() in api-server/src/lib/parent-consent.ts
-- and src/lib/parentConsent.js.
create or replace function public.needs_parent_consent(p_dob date, p_year_level integer)
returns boolean
language sql
stable
as $$
  select case
    when p_dob is not null
      then p_dob > ((now() at time zone 'Australia/Adelaide')::date - interval '15 years')::date
    else coalesce(p_year_level <= 9, false)
  end
$$;

-- Same guard as before, plus the parent columns, and a young student waiting
-- on their parent can't change their date of birth or year level to skip it.
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

-- Weekly reports pick up confirmed parent emails.
create index if not exists profiles_parent_reports_idx
  on public.profiles (parent_report_week)
  where parent_email is not null and parent_consent_at is not null and parent_reports_stopped_at is null;

-- The all-users leaderboard (read by the mobile app) leaves out students under
-- 15: it shows name and school to every signed-in user. Class leaderboards,
-- which only classmates see, are unchanged.
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
  and not public.needs_parent_consent(dob, year_level)
order by xp desc;

revoke all on public.leaderboard from anon;
grant select on public.leaderboard to authenticated;
