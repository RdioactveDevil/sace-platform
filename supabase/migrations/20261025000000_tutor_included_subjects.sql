-- Tutor-included subjects.
--
-- A Titanium Tutoring student doesn't pay for the subjects their tutor teaches
-- them. The tutor picks those subjects when inviting the student (or later,
-- from the roster) and they unlock as soon as the student is on their roster.
--
-- 1. profiles.can_include_subject: which tutors may do this. Set by an admin
--    (Admin → Tutors); admins can always include a subject.
-- 2. tutor_invites.curriculum_ids: the subjects an invite comes with.
--    Unlocked when the student accepts.
-- 3. user_subscriptions source 'tutor': unlimited access, like an admin grant,
--    tied to the tutor who gave it (sponsor_tutor_id). Doesn't use up the
--    student's own free subject.
-- 4. The access lasts while the student is on that tutor's roster: removing
--    them (tutor, admin, or account deletion) deletes the row.

set local lock_timeout = '10s';

-- ── 1. Who may include a subject ────────────────────────────────────────────
alter table public.profiles
  add column if not exists can_include_subject boolean not null default false;

-- Same guard as before, plus can_include_subject: users can't grant it to
-- themselves from the browser.
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
    new.can_include_subject      := old.can_include_subject;
  end if;
  return new;
end;
$$;

-- ── 2. The subjects an invite comes with ────────────────────────────────────
-- Curricula ids; checked against the live subjects when the student accepts.
alter table public.tutor_invites
  add column if not exists curriculum_ids uuid[] not null default '{}';

-- ── 3. 'tutor' access rows ──────────────────────────────────────────────────
alter table public.user_subscriptions
  add column if not exists sponsor_tutor_id uuid references public.profiles (id) on delete cascade;

alter table public.user_subscriptions drop constraint if exists user_subscriptions_source_check;
alter table public.user_subscriptions
  add constraint user_subscriptions_source_check check (source in ('beta', 'admin', 'stripe', 'free', 'tutor'));

do $$ begin
  alter table public.user_subscriptions
    add constraint user_subscriptions_tutor_has_sponsor check (source <> 'tutor' or sponsor_tutor_id is not null);
exception when duplicate_object then null; end $$;

create index if not exists user_subscriptions_sponsor_idx
  on public.user_subscriptions (sponsor_tutor_id, user_id) where source = 'tutor';

-- ── 4. Leaving the roster ends the access ───────────────────────────────────
-- SECURITY DEFINER: tutors remove roster rows from the browser, and students
-- can't write user_subscriptions.
create or replace function public.end_tutor_included_subject()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_subscriptions
   where user_id = old.student_id
     and source = 'tutor'
     and sponsor_tutor_id = old.tutor_id;
  return old;
end;
$$;

revoke all on function public.end_tutor_included_subject() from public, anon, authenticated;

drop trigger if exists end_tutor_included_subject on public.tutor_students;
create trigger end_tutor_included_subject
  after delete on public.tutor_students
  for each row execute function public.end_tutor_included_subject();
