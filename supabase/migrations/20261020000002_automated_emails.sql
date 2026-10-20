-- Automated emails: welcome, session reminders and assignment due reminders.
--
-- The API's /api/cron/emails job (run every 15 minutes by the
-- "Automated emails" GitHub Action) sends them. Each email is recorded in
-- email_log, one row per (kind, ref_id, recipient), so a message goes out at
-- most once however often or concurrently the job runs.
--
-- profiles.emails_unsubscribed_at is set by the unsubscribe link in every
-- automated email (or the toggle on My Account). Emails a tutor sends by hand
-- (assignment, message, session booked, resource shared) are not affected.

alter table public.profiles
  add column if not exists emails_unsubscribed_at timestamptz;

create table if not exists public.email_log (
  id          uuid primary key default gen_random_uuid(),
  -- 'welcome' | 'session_reminder_24h' | 'session_reminder_1h'
  -- | 'assignment_due' | 'assignment_overdue'
  kind        text not null,
  -- The session, assignment or profile the email is about.
  ref_id      text not null,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  -- 'pending' while being sent, then 'sent' or 'failed'.
  status      text not null default 'pending',
  attempts    integer not null default 1,
  provider_id text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (kind, ref_id, recipient_id)
);

create index if not exists email_log_recipient_idx on public.email_log (recipient_id, created_at desc);

-- Server-only: RLS on with no policies, so only the service role can read or
-- write it.
alter table public.email_log enable row level security;

-- Claim an email before sending it. Returns true when the caller now owns the
-- send: no row existed, or an earlier attempt failed (up to 3 attempts) or
-- was left 'pending' for over 10 minutes by a run that died mid-send.
create or replace function public.claim_email(p_kind text, p_ref_id text, p_recipient_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  insert into public.email_log as l (kind, ref_id, recipient_id)
  values (p_kind, p_ref_id, p_recipient_id)
  on conflict (kind, ref_id, recipient_id) do update
    set status = 'pending', attempts = l.attempts + 1, error = null, updated_at = now()
    where l.attempts < 3
      and (l.status = 'failed' or (l.status = 'pending' and l.updated_at < now() - interval '10 minutes'))
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_email(text, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_email(text, text, uuid) to service_role;
