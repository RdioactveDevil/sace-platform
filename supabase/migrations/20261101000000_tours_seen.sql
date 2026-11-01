-- Page tips: which pages' tips each user has seen, as { "<page>": "<when>" }.
-- The app shows a page's tips the first time someone opens it, and records it
-- here so they don't come back on another device. Users update their own row
-- (existing profiles policies).
alter table public.profiles
  add column if not exists tours_seen jsonb not null default '{}'::jsonb;
