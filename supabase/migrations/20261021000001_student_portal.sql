-- Student Portal: tutor profiles and tutor ↔ student messages.
--
-- 1. tutor_profiles: what a tutor tells their students about themselves
--    (shown on the student's "My Tutor" page). One row per tutor, edited in
--    Tutor portal → My Profile.
-- 2. tutor_messages: a direct conversation between a tutor and one of their
--    students. A conversation exists only while the pair is on the roster
--    (tutor_students); the API checks that on every read and write.
--
-- Both are read and written only through the API with the service role, so
-- RLS is enabled with no client policies.

create table if not exists public.tutor_profiles (
  tutor_id        uuid primary key references public.profiles(id) on delete cascade,
  headline        text,
  bio             text,
  subjects        text,
  qualifications  text,
  updated_at      timestamptz not null default now()
);
alter table public.tutor_profiles enable row level security;

create table if not exists public.tutor_messages (
  id          uuid primary key default gen_random_uuid(),
  tutor_id    uuid not null references public.profiles(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now(),
  -- When the other person opened the conversation after this was sent.
  read_at     timestamptz
);
create index if not exists tutor_messages_pair_idx
  on public.tutor_messages (tutor_id, student_id, created_at desc);
create index if not exists tutor_messages_unread_idx
  on public.tutor_messages (tutor_id, student_id) where read_at is null;
alter table public.tutor_messages enable row level security;
