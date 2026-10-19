-- Paid student access: $5/week per subject through Stripe.
--
-- user_subscriptions rows now record where access came from:
--   beta   – unlocked free during the beta (kept free forever)
--   admin  – granted by an admin
--   stripe – a Stripe subscription; `active` follows its status
-- Students can no longer write their own rows: access is granted only by the
-- API (admin grant, Stripe checkout/webhook) with the service role.

alter table public.user_subscriptions
  add column if not exists source text not null default 'beta',
  add column if not exists status text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists current_period_end timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- Every existing row predates payments, so it stays free.
update public.user_subscriptions set source = 'beta' where source is distinct from 'beta';
alter table public.user_subscriptions alter column source set default 'admin';

do $$ begin
  alter table public.user_subscriptions
    add constraint user_subscriptions_source_check check (source in ('beta', 'admin', 'stripe'));
exception when duplicate_object then null; end $$;

create unique index if not exists user_subscriptions_stripe_subscription_id_key
  on public.user_subscriptions (stripe_subscription_id) where stripe_subscription_id is not null;

drop policy if exists "Users can insert own subscriptions" on public.user_subscriptions;
drop policy if exists "Users can delete own subscriptions" on public.user_subscriptions;

-- Stripe customer per user. Server-only (no policies): a client must never be
-- able to point its account at someone else's customer.
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);
alter table public.billing_customers enable row level security;

-- Pricing shown in the app and charged at checkout.
update public.platform_settings
  set value = value || '{"student_weekly": 5, "trial_days": 7}'::jsonb
  where key = 'pricing';
