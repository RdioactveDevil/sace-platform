-- Student access and billing.
--
-- user_subscriptions rows now record where access came from:
--   beta   – unlocked free during the beta (kept free forever)
--   admin  – granted by an admin
--   stripe – a paid subject; `active` follows the student's Stripe subscription
--   free   – the student's one free subject (limited questions per day)
-- A student has at most one Stripe subscription; its quantity is their number
-- of paid subjects, on a graduated weekly price ($5, $4, then $3 each).
-- Students can no longer write their own rows: access changes go through the
-- API with the service role.

-- Fail fast rather than queue behind live queries on user_subscriptions.
set local lock_timeout = '10s';

alter table public.user_subscriptions
  add column if not exists source text not null default 'beta',
  add column if not exists status text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- Every existing row predates payments, so it stays free.
update public.user_subscriptions set source = 'beta' where source is distinct from 'beta';
alter table public.user_subscriptions alter column source set default 'admin';

do $$ begin
  alter table public.user_subscriptions
    add constraint user_subscriptions_source_check check (source in ('beta', 'admin', 'stripe', 'free'));
exception when duplicate_object then null; end $$;

-- One free subject per student.
create unique index if not exists user_subscriptions_one_free_subject
  on public.user_subscriptions (user_id) where source = 'free';
create index if not exists user_subscriptions_stripe_subscription_id_idx
  on public.user_subscriptions (stripe_subscription_id) where stripe_subscription_id is not null;

drop policy if exists "Users can insert own subscriptions" on public.user_subscriptions;
drop policy if exists "Users can delete own subscriptions" on public.user_subscriptions;

-- Stripe customer and current subscription per student. Server-only (no
-- policies): a client must never be able to point its account at someone
-- else's customer.
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);
alter table public.billing_customers enable row level security;

-- Questions answered in the free subject, per student per Adelaide day.
create table if not exists public.free_question_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  used integer not null default 0,
  primary key (user_id, day)
);
alter table public.free_question_usage enable row level security;
create policy "Users read own free usage" on public.free_question_usage
  for select using (auth.uid() = user_id);

create or replace function public.free_question_limit() returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> 'free_daily_questions')::integer from platform_settings where key = 'pricing'), 20)
$$;

-- { used, limit } for the caller today.
create or replace function public.free_questions_today() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'used', coalesce((select used from free_question_usage
                      where user_id = auth.uid() and day = (now() at time zone 'Australia/Adelaide')::date), 0),
    'limit', free_question_limit())
$$;

-- Count one free-subject question for the caller. Returns { used, limit, allowed }.
create or replace function public.use_free_question() returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  lim integer := free_question_limit();
  today date := (now() at time zone 'Australia/Adelaide')::date;
  n integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into free_question_usage as u (user_id, day, used) values (auth.uid(), today, 1)
    on conflict (user_id, day) do update set used = u.used + 1 where u.used < lim
    returning used into n;
  if n is null then
    return json_build_object('used', lim, 'limit', lim, 'allowed', false);
  end if;
  return json_build_object('used', n, 'limit', lim, 'allowed', true);
end
$$;

revoke all on function public.use_free_question() from public, anon;
grant execute on function public.use_free_question() to authenticated;
revoke all on function public.free_questions_today() from public, anon;
grant execute on function public.free_questions_today() to authenticated;

-- Prices shown in the app and charged at checkout ($/week for the 1st, 2nd,
-- and every further subject) and the free subject's daily question limit.
update public.platform_settings
  set value = (value - 'student_monthly') || '{"student_tiers": [5, 4, 3], "free_daily_questions": 20}'::jsonb
  where key = 'pricing';
