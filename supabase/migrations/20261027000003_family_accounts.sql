-- Family accounts: one parent email for several children.
--
-- A parent-held account (account_holder = 'parent') signs in with the
-- parent's email and is one child's account. A parent with another child adds
-- them from the app: the API creates that child their own account, with a
-- hidden sign-in address on the family domain that nobody uses, and the parent
-- switches between children without signing in again (routes/family.ts).
-- Every child keeps their own progress, subjects, tutor and billing.
--
--   family_members  one row per account in a family
--     user_id       the child's account
--     family_id     the account the parent signs in to (its own row has
--                   user_id = family_id)
--     login_email   the hidden sign-in address of an added child; null for
--                   the parent's own account. Mail for it goes to the parent.
--
-- Read and written only by the API (service role): RLS on, no policies.
--
-- Tutor invites: a parent can now have two children invited by the same tutor
-- at once, so the one-pending-invite rule is per email and child.

set local lock_timeout = '10s';

create table if not exists public.family_members (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  family_id   uuid not null references public.profiles (id) on delete cascade,
  login_email text unique,
  created_at  timestamptz not null default now()
);

create index if not exists family_members_family on public.family_members (family_id);

alter table public.family_members enable row level security;
revoke all on public.family_members from anon, authenticated;

drop index if exists public.tutor_invites_one_pending;
create unique index if not exists tutor_invites_one_pending
  on public.tutor_invites (tutor_id, email, coalesce(lower(child_name), '')) where status = 'pending';
