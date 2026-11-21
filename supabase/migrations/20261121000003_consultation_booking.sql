-- Consultation-call booking: prospects and parents book a call with a tutor.
--
--   tutor_booking_settings         a tutor's hours, call length, gap, notice,
--                                  window, reminders and optional busy calendar
--                                  (server-only: RLS on, no policies)
--   tutoring_sessions              a consultation is a session_type
--                                  'consultation' row with guest_* fields and
--                                  a guest_token (the guest has no account)
--   consultation_reminders_sent    which reminder went to whom, once
--   diagnostic_assessments         parent_email, booking_reminded_at
--   book_consultation()            atomic, gap-aware insert (per-tutor lock)
--   reschedule_consultation()      same check, bumps the invite sequence

set local lock_timeout = '10s';

create table if not exists public.tutor_booking_settings (
  tutor_id             uuid primary key references public.profiles (id) on delete cascade,
  time_zone            text not null default 'Australia/Adelaide',
  weekly_hours         jsonb not null default '{}',
  call_minutes         int not null default 45,
  gap_minutes          int not null default 15,
  min_notice_hours     int not null default 12,
  max_days_ahead       int not null default 14,
  reminder_minutes     int[] not null default '{1440,60}',
  busy_ical_url        text,
  busy_ical_checked_at timestamptz,
  busy_ical_error      text,
  invite_email         text,
  updated_at           timestamptz default now()
);
alter table public.tutor_booking_settings enable row level security;

alter table public.tutoring_sessions
  add column if not exists diagnostic_id      uuid references public.diagnostic_assessments (id) on delete set null,
  add column if not exists guest_email        text,
  add column if not exists guest_name         text,
  add column if not exists guest_parent_email text,
  add column if not exists guest_time_zone    text,
  add column if not exists guest_token        text unique,
  add column if not exists reminder_minutes   int[],
  add column if not exists ics_sequence       int not null default 0;

alter table public.tutoring_sessions drop constraint if exists tutoring_sessions_session_type_check;
alter table public.tutoring_sessions add constraint tutoring_sessions_session_type_check
  check (session_type = any (array['individual', 'group', 'consultation']));

-- One live consultation per tutor and prospect email.
create unique index if not exists tutoring_sessions_one_live_consultation
  on public.tutoring_sessions (tutor_id, lower(guest_email))
  where session_type = 'consultation' and status = 'scheduled';

create table if not exists public.consultation_reminders_sent (
  session_id uuid not null references public.tutoring_sessions (id) on delete cascade,
  minutes    int  not null,
  recipient  text not null check (recipient in ('guest', 'parent', 'tutor')),
  sent_at    timestamptz default now(),
  primary key (session_id, minutes, recipient)
);
alter table public.consultation_reminders_sent enable row level security;

alter table public.diagnostic_assessments
  add column if not exists parent_email         text,
  add column if not exists booking_reminded_at  timestamptz;

create or replace function public.book_consultation(
  p_tutor_id uuid, p_start timestamptz, p_minutes int, p_gap int, p_room text,
  p_title text, p_diagnostic_id uuid, p_guest_email text, p_guest_name text,
  p_guest_parent_email text, p_guest_time_zone text, p_guest_token text,
  p_reminders int[], p_exclude_session uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('consultation:' || p_tutor_id));

  if exists (
    select 1 from tutoring_sessions s
     where s.tutor_id = p_tutor_id
       and s.status in ('scheduled', 'active')
       and (p_exclude_session is null or s.id <> p_exclude_session)
       and s.scheduled_at < p_start + make_interval(mins => p_minutes + p_gap)
       and s.scheduled_at + make_interval(mins => s.duration_minutes) > p_start - make_interval(mins => p_gap)
  ) then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;

  insert into tutoring_sessions (
    tutor_id, scheduled_at, duration_minutes, livekit_room_name, title,
    session_type, status, record_session, diagnostic_id, guest_email,
    guest_name, guest_parent_email, guest_time_zone, guest_token, reminder_minutes
  ) values (
    p_tutor_id, p_start, p_minutes, p_room, p_title,
    'consultation', 'scheduled', false, p_diagnostic_id, p_guest_email,
    p_guest_name, p_guest_parent_email, p_guest_time_zone, p_guest_token, p_reminders
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.reschedule_consultation(
  p_session uuid, p_start timestamptz, p_minutes int, p_gap int, p_reminders int[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tutor uuid;
begin
  select tutor_id into v_tutor from tutoring_sessions where id = p_session;
  if v_tutor is null then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('consultation:' || v_tutor));

  if exists (
    select 1 from tutoring_sessions s
     where s.tutor_id = v_tutor
       and s.status in ('scheduled', 'active')
       and s.id <> p_session
       and s.scheduled_at < p_start + make_interval(mins => p_minutes + p_gap)
       and s.scheduled_at + make_interval(mins => s.duration_minutes) > p_start - make_interval(mins => p_gap)
  ) then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;

  update tutoring_sessions
     set scheduled_at = p_start,
         duration_minutes = p_minutes,
         reminder_minutes = p_reminders,
         ics_sequence = ics_sequence + 1,
         updated_at = now()
   where id = p_session;

  delete from consultation_reminders_sent where session_id = p_session;
end;
$$;

revoke execute on function public.book_consultation(uuid, timestamptz, int, int, text, text, uuid, text, text, text, text, text, int[], uuid)
  from public, anon, authenticated;
revoke execute on function public.reschedule_consultation(uuid, timestamptz, int, int, int[])
  from public, anon, authenticated;
