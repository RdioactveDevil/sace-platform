-- Learn: saved chats and guided lessons, so both follow a student across devices.
--
-- learn_sessions already holds Titan chats (messages as jsonb). It gains the
-- subject the chat belongs to and a short title (the topic, or the first
-- question when no topic was picked), so the Learn start screen can list a
-- subject's recent chats. Older rows have no subject and simply aren't listed.
--
-- learn_lessons holds one guided lesson per student, subject and topic: the
-- lesson Titan wrote (content) and how far the student has got, so it can be
-- resumed at the same step.
--   content      { title, ideas[], example { problem, steps[] }, checks[], summary[] }
--   step         0 key ideas, 1 worked example, 2 check questions, 3 wrap-up
--   revealed     worked-example steps shown so far
--   check_index  current check question; picked = the option chosen on it
--   answers      one boolean per check question answered (true = right)
--
-- Students read and write their own rows directly (RLS), like learn_sessions.

alter table public.learn_sessions
  add column if not exists subject text,
  add column if not exists title text;
create index if not exists learn_sessions_user_subject_idx
  on public.learn_sessions (user_id, subject, updated_at desc);

create table if not exists public.learn_lessons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  subject     text not null,
  topic       text not null,
  topic_key   text not null,
  content     jsonb not null,
  step        smallint not null default 0 check (step between 0 and 3),
  revealed    smallint not null default 1 check (revealed >= 0),
  check_index smallint not null default 0 check (check_index >= 0),
  picked      smallint,
  answers     jsonb not null default '[]'::jsonb,
  finished_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, subject, topic_key)
);
create index if not exists learn_lessons_user_subject_idx
  on public.learn_lessons (user_id, subject, updated_at desc);

alter table public.learn_lessons enable row level security;
drop policy if exists learn_lessons_own on public.learn_lessons;
create policy learn_lessons_own on public.learn_lessons
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
