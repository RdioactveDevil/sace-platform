-- Saved practice exams from the exam builder (ExamBuilderScreen.jsx), so a
-- student or tutor can come back to one, and a tutor can share one with a
-- class. `questions` is { "A": [question ids], "B": [question ids] } in paper
-- order; `settings` holds the builder's choices and the cover fields.
--
-- Who sees a row: its owner (read and write); students in the class it is
-- shared with, and that class's tutors (read); admins (read). Only a tutor of
-- the class can share an exam with it.

create table if not exists public.built_exams (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  subject    text not null,
  title      text not null,
  questions  jsonb not null default '{"A": [], "B": []}'::jsonb,
  settings   jsonb not null default '{}'::jsonb,
  class_id   uuid references public.tutor_classes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists built_exams_owner_idx on public.built_exams (owner_id, subject, updated_at desc);
create index if not exists built_exams_class_idx on public.built_exams (class_id) where class_id is not null;

-- Class membership checks for the policies below. Security definer so they
-- can read class rosters that the caller's own policies may not show.
create or replace function public.is_class_member(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tutor_class_members where class_id = p_class and student_id = auth.uid())
$$;

create or replace function public.is_class_tutor(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tutor_classes where id = p_class and tutor_id = auth.uid())
      or exists (select 1 from public.tutor_class_tutors where class_id = p_class and tutor_id = auth.uid())
$$;

revoke all on function public.is_class_member(uuid) from public;
revoke all on function public.is_class_tutor(uuid) from public;
grant execute on function public.is_class_member(uuid) to authenticated;
grant execute on function public.is_class_tutor(uuid) to authenticated;

alter table public.built_exams enable row level security;

drop policy if exists built_exams_own on public.built_exams;
create policy built_exams_own on public.built_exams
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and (class_id is null or public.is_class_tutor(class_id)));

drop policy if exists built_exams_class_read on public.built_exams;
create policy built_exams_class_read on public.built_exams
  for select to authenticated
  using (class_id is not null and (public.is_class_member(class_id) or public.is_class_tutor(class_id)));

drop policy if exists built_exams_admin_read on public.built_exams;
create policy built_exams_admin_read on public.built_exams
  for select to authenticated
  using (public.is_current_user_admin());
