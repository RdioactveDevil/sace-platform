-- Titan AI's off-topic checker: where redirected messages are recorded.
--
-- /api/chat checks each message a student types to Titan AI, and when it is
-- clearly about a different subject replies with a redirect and records the
-- attempt here (with the service role). Tutors see the counts per subject and
-- topic on a student's Progress tab ("Topics where Titan AI redirected this
-- student"). The table was referenced by the app and an earlier migration but
-- never created, so nothing was recorded.
--
-- Rows are written only by the API. A student can read their own; tutors read
-- their rostered students' (same rule as answer_log); admins read all.

create table if not exists public.off_topic_attempts (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  subject      text not null,
  topic        text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists off_topic_attempts_student_idx
  on public.off_topic_attempts (student_id, attempted_at desc);

alter table public.off_topic_attempts enable row level security;

drop policy if exists off_topic_attempts_read_own_or_rostered on public.off_topic_attempts;
create policy off_topic_attempts_read_own_or_rostered on public.off_topic_attempts
  for select to authenticated
  using (
    student_id = auth.uid()
    or (
      public.is_current_user_tutor()
      and exists (
        select 1 from public.tutor_students ts
         where ts.tutor_id = auth.uid() and ts.student_id = off_topic_attempts.student_id
      )
    )
  );

drop policy if exists off_topic_attempts_admin_read on public.off_topic_attempts;
create policy off_topic_attempts_admin_read on public.off_topic_attempts
  for select to authenticated
  using (public.is_current_user_admin());

revoke all on public.off_topic_attempts from anon;
grant select on public.off_topic_attempts to authenticated;
