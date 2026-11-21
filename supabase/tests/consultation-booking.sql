-- Consultation booking: atomic, gap-aware booking and rescheduling.
--
-- Runs against a scratch Postgres with just the tables involved:
--   psql -v ON_ERROR_STOP=1 -f <this file> -v migration=<path to the migration>
-- Fails (raises) on the first broken rule; prints PASS at the end.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

create table public.profiles (id uuid primary key);
create table public.diagnostic_assessments (id uuid primary key);
create table public.tutoring_sessions (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles (id),
  student_id uuid references public.profiles (id),
  scheduled_at timestamptz not null,
  duration_minutes int not null default 60,
  livekit_room_name text not null unique,
  title text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'completed', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  session_type text not null default 'individual',
  record_session boolean not null default false,
  constraint tutoring_sessions_session_type_check
    check (session_type = any (array['individual', 'group']))
);

insert into public.profiles values ('00000000-0000-0000-0000-0000000000a1');

\i :migration

do $$
declare
  t constant uuid := '00000000-0000-0000-0000-0000000000a1';
  d constant date := date '2030-01-07';
  s1 uuid; s2 uuid;
begin
  -- 10:00-10:45 succeeds
  s1 := public.book_consultation(t, d + time '10:00', 45, 15, 'room-1', 'c1', null, 'a@x.com', 'A', null, 'Australia/Adelaide', 'tok-1', '{1440,60}');
  if s1 is null then raise exception 'FAIL: first booking returned null'; end if;

  -- 10:30 overlaps
  begin
    perform public.book_consultation(t, d + time '10:30', 45, 15, 'room-2', 'c2', null, 'b@x.com', 'B', null, 'UTC', 'tok-2', '{1440,60}');
    raise exception 'FAIL: 10:30 should have been slot_taken';
  exception when others then
    if sqlerrm <> 'slot_taken' then raise exception 'FAIL: 10:30 raised % instead of slot_taken', sqlerrm; end if;
  end;

  -- 11:00 is exactly the gap after 10:45 + 15
  s2 := public.book_consultation(t, d + time '11:00', 45, 15, 'room-3', 'c3', null, 'c@x.com', 'C', null, 'UTC', 'tok-3', '{1440,60}');

  -- 10:50 overlaps
  begin
    perform public.book_consultation(t, d + time '12:30', 45, 15, 'room-4', 'c4', null, 'd@x.com', 'D', null, 'UTC', 'tok-4', '{1440,60}');
    -- 12:30 is free; now 10:50 must fail
    perform public.book_consultation(t, d + time '10:50', 45, 15, 'room-5', 'c5', null, 'e@x.com', 'E', null, 'UTC', 'tok-5', '{1440,60}');
    raise exception 'FAIL: 10:50 should have been slot_taken';
  exception when others then
    if sqlerrm <> 'slot_taken' then raise exception 'FAIL: 10:50 raised % instead of slot_taken', sqlerrm; end if;
  end;
end $$;

-- the 12:30 booking inside the block above was rolled back with its subtransaction
do $$
declare
  t constant uuid := '00000000-0000-0000-0000-0000000000a1';
  d constant date := date '2030-01-07';
  s uuid;
begin
  -- an individual lesson 14:00-15:00 blocks a consultation at 15:05
  insert into public.tutoring_sessions (tutor_id, scheduled_at, duration_minutes, livekit_room_name, session_type)
  values (t, d + time '14:00', 60, 'lesson-1', 'individual');
  begin
    perform public.book_consultation(t, d + time '15:05', 45, 15, 'room-6', 'c6', null, 'f@x.com', 'F', null, 'UTC', 'tok-6', '{1440,60}');
    raise exception 'FAIL: 15:05 should be blocked by the 14:00-15:00 lesson';
  exception when others then
    if sqlerrm <> 'slot_taken' then raise exception 'FAIL: 15:05 raised % instead of slot_taken', sqlerrm; end if;
  end;
  -- 15:15 is clear
  perform public.book_consultation(t, d + time '15:15', 45, 15, 'room-7', 'c7', null, 'g@x.com', 'G', null, 'UTC', 'tok-7', '{1440,60}');
end $$;

do $$
declare
  t constant uuid := '00000000-0000-0000-0000-0000000000a1';
  d constant date := date '2030-01-08';
  s uuid;
begin
  -- one live consultation per tutor + email (case-insensitive)
  s := public.book_consultation(t, d + time '09:00', 45, 15, 'room-8', 'c8', null, 'Same@x.com', 'S', null, 'UTC', 'tok-8', '{1440,60}');
  begin
    perform public.book_consultation(t, d + time '13:00', 45, 15, 'room-9', 'c9', null, 'same@X.com', 'S', null, 'UTC', 'tok-9', '{1440,60}');
    raise exception 'FAIL: second live booking for the same email should be rejected';
  exception
    when unique_violation then
      if sqlerrm not like '%tutoring_sessions_one_live_consultation%' then
        raise exception 'FAIL: wrong unique index violated: %', sqlerrm;
      end if;
  end;
  update public.tutoring_sessions set status = 'completed' where id = s;
  perform public.book_consultation(t, d + time '13:00', 45, 15, 'room-10', 'c10', null, 'same@x.com', 'S', null, 'UTC', 'tok-10', '{1440,60}');
end $$;

do $$
declare
  t constant uuid := '00000000-0000-0000-0000-0000000000a1';
  d constant date := date '2030-01-09';
  s uuid; seq int; n int;
begin
  s := public.book_consultation(t, d + time '09:00', 45, 15, 'room-11', 'c11', null, 'r@x.com', 'R', null, 'UTC', 'tok-11', '{1440,60}');
  perform public.book_consultation(t, d + time '11:00', 45, 15, 'room-12', 'c12', null, 'r2@x.com', 'R2', null, 'UTC', 'tok-12', '{1440,60}');
  insert into public.consultation_reminders_sent (session_id, minutes, recipient) values (s, 60, 'guest'), (s, 60, 'tutor');

  perform public.reschedule_consultation(s, d + time '15:00', 45, 15, '{30}');
  select ics_sequence into seq from public.tutoring_sessions where id = s;
  if seq <> 1 then raise exception 'FAIL: ics_sequence is %, expected 1', seq; end if;
  select count(*) into n from public.consultation_reminders_sent where session_id = s;
  if n <> 0 then raise exception 'FAIL: reminder rows not cleared (%)', n; end if;
  if not exists (select 1 from public.tutoring_sessions where id = s and scheduled_at = d + time '15:00' and reminder_minutes = '{30}') then
    raise exception 'FAIL: reschedule did not update scheduled_at / reminder_minutes';
  end if;

  -- overlapping the 11:00 booking
  begin
    perform public.reschedule_consultation(s, d + time '11:30', 45, 15, '{30}');
    raise exception 'FAIL: overlapping reschedule should be slot_taken';
  exception when others then
    if sqlerrm <> 'slot_taken' then raise exception 'FAIL: reschedule raised % instead of slot_taken', sqlerrm; end if;
  end;
  -- rescheduling onto its own slot is fine (excludes itself)
  perform public.reschedule_consultation(s, d + time '15:10', 45, 15, '{30}');
end $$;

-- applies twice
\i :migration

do $$ begin raise notice 'PASS'; end $$;
