-- Tutor → student invites.
--
-- A tutor no longer adds a student to their roster directly. "Add student"
-- now emails the student an invite; the student accepts it (signed in with
-- that email address) and only then does the roster row exist. The roster row
-- is what gives the tutor access to the student's progress and gives the
-- student the Lessons section of the Student Portal, so it needs the
-- student's say-so.
--
-- 1. tutor_invites: one row per invite. Read and written only through the API
--    with the service role, so RLS is enabled with no client policies.
-- 2. tutor_students: tutors keep reading, updating and removing their own
--    roster rows, but can no longer insert them from the browser. Inserts now
--    come from the API when a student accepts (and from the admin and class
--    tools, which already use the service role).

create table if not exists public.tutor_invites (
  id            uuid primary key default gen_random_uuid(),
  tutor_id      uuid not null references public.profiles(id) on delete cascade,
  -- Lower-cased; the student must accept signed in with this address.
  email         text not null,
  -- Secret in the invite link.
  token         text not null unique,
  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  -- Who accepted or declined.
  student_id    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  -- Last time the email went out (resending refreshes it and the expiry).
  sent_at       timestamptz,
  responded_at  timestamptz
);

-- At most one open invite per tutor and address; re-inviting resends it.
create unique index if not exists tutor_invites_one_pending
  on public.tutor_invites (tutor_id, email) where status = 'pending';
create index if not exists tutor_invites_pending_email_idx
  on public.tutor_invites (email) where status = 'pending';

alter table public.tutor_invites enable row level security;

drop policy if exists "tutors_manage_own_roster" on public.tutor_students;

drop policy if exists "tutors_read_own_roster" on public.tutor_students;
create policy "tutors_read_own_roster"
  on public.tutor_students
  for select
  using (
    auth.uid() is not null
    and tutor_id = auth.uid()
    and public.is_current_user_tutor()
  );

drop policy if exists "tutors_update_own_roster" on public.tutor_students;
create policy "tutors_update_own_roster"
  on public.tutor_students
  for update
  using (
    auth.uid() is not null
    and tutor_id = auth.uid()
    and public.is_current_user_tutor()
  )
  with check (
    auth.uid() is not null
    and tutor_id = auth.uid()
    and public.is_current_user_tutor()
  );

drop policy if exists "tutors_remove_own_roster" on public.tutor_students;
create policy "tutors_remove_own_roster"
  on public.tutor_students
  for delete
  using (
    auth.uid() is not null
    and tutor_id = auth.uid()
    and public.is_current_user_tutor()
  );
