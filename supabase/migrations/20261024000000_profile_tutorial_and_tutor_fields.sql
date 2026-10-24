-- Profile columns the app already reads and writes but that were never added
-- to this database (they lived in the hand-run
-- artifacts/gradefarm/supabase-migration-tutor-signup-tutorial.sql).
--
-- Without them:
--   * marking the in-app tour as seen fails, so it is only remembered per
--     browser and replays on every new device;
--   * tutor sign-up fails after the account is created ("Could not find the
--     'tutor_bio' column"), so the tutor application is never submitted.

alter table public.profiles add column if not exists app_tutorial_completed_at timestamptz;
alter table public.profiles add column if not exists tutor_organization text;
alter table public.profiles add column if not exists tutor_phone text;
alter table public.profiles add column if not exists tutor_subjects_offered text;
alter table public.profiles add column if not exists tutor_qualifications text;
alter table public.profiles add column if not exists tutor_experience_years integer;
alter table public.profiles add column if not exists tutor_bio text;

-- People who have already been through onboarding have used the app; don't
-- send them through the first-run tour again.
update public.profiles
   set app_tutorial_completed_at = now()
 where onboarding_completed = true
   and app_tutorial_completed_at is null;
