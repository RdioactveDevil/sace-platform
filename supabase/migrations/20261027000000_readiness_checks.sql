-- Free readiness check (/readiness-check).
--
-- A parent without an account enters their email, their child's first name
-- and year, and picks Maths or English. Their child answers 20 questions from
-- the Year 6 bank; the API marks them and emails the parent the report.
--
--   parent_email     stored lower-case
--   token            secret in the report link; the only way to read a check
--   question_ids     the 20 questions, in the order they were shown
--   answers          { "<question id>": <option index> } once submitted
--   report           the marked report (lib/readiness.ts in the API)
--   requester_hash   HMAC of the requester's IP, for rate limits only
--   updates_opt_in   the parent ticked "send me tips" (marketing consent)
--
-- Only the API (service role) reads or writes it: RLS on, no policies.

set local lock_timeout = '10s';

create table if not exists public.readiness_checks (
  id                uuid primary key default gen_random_uuid(),
  token             text not null unique,
  parent_email      text not null,
  child_name        text not null,
  year_level        text not null,
  subject           text not null,
  question_ids      text[] not null,
  answers           jsonb,
  score             integer,
  max_score         integer,
  report            jsonb,
  requester_hash    text,
  updates_opt_in    boolean not null default false,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,
  report_emailed_at timestamptz
);

create index if not exists readiness_checks_email_created
  on public.readiness_checks (parent_email, created_at desc);
create index if not exists readiness_checks_requester_created
  on public.readiness_checks (requester_hash, created_at desc);

alter table public.readiness_checks enable row level security;
revoke all on public.readiness_checks from anon, authenticated;
