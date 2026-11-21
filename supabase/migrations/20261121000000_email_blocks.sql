-- Addresses we stop emailing because an email to them hard-bounced or was
-- reported as spam. Resend tells the API through its webhook
-- (POST /api/email/resend-webhook, lib/email-blocks.ts). Resend itself then
-- refuses every later email to the address without saying so when we send,
-- so without this table those sends were logged as 'sent'.
--
-- sendEmail skips a blocked address and the cron job logs the send as
-- 'blocked' in email_log (not retried). The webhook also sets the original
-- email's email_log row to 'bounced', 'complained' or 'suppressed'.
-- Admin → People shows a person's blocked addresses and can clear one, which
-- only helps once it's also off Resend's suppression list.

create table if not exists public.email_blocks (
  -- Lower-cased.
  email       text primary key,
  -- 'bounced' | 'complained' | 'suppressed' (Resend refused it, cause not given).
  reason      text not null check (reason in ('bounced', 'complained', 'suppressed')),
  -- The bounce message, when there is one.
  detail      text,
  -- The email that bounced or was reported.
  subject     text,
  provider_id text,
  occurred_at timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Server-only: RLS on with no policies, so only the service role can read or
-- write it.
alter table public.email_blocks enable row level security;

create index if not exists email_log_provider_idx on public.email_log (provider_id) where provider_id is not null;
