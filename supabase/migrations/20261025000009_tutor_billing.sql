-- Tutor plans: tutors pay for the tutor portal.
--
-- A tutor subscribes to one of platform_settings.pricing.tutor_plans
-- ({ name, price: $/month, students }) through Stripe, monthly or annually
-- (annual_discount off). The API records the subscription here, with the
-- student limit it was bought with, and needs a live plan before a tutor can
-- use the tutor portal or invite more students than the plan allows
-- (lib/tutor-plan.ts). Admins need no plan, and an admin can mark a tutor
-- exempt (no plan, no limit) in Admin → Tutors.
--
-- Server-only writes; a tutor can read their own row.

-- Fail fast rather than queue behind live queries.
set local lock_timeout = '10s';

create table if not exists public.tutor_billing (
  tutor_id uuid primary key references auth.users (id) on delete cascade,
  exempt boolean not null default false,
  plan text,
  student_limit integer,             -- null = unlimited
  interval text check (interval in ('month', 'year')),
  status text,                       -- the Stripe subscription status
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.tutor_billing enable row level security;

drop policy if exists "Tutors read own billing" on public.tutor_billing;
create policy "Tutors read own billing" on public.tutor_billing
  for select using (auth.uid() = tutor_id);

-- Everyone who's a tutor before plans existed keeps the portal for free until
-- an admin switches their exemption off.
insert into public.tutor_billing (tutor_id, exempt)
  select id, true from public.profiles where is_tutor
  on conflict (tutor_id) do update set exempt = true, updated_at = now();
