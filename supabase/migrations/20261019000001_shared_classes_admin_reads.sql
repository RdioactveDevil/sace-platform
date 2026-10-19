-- Manager tools: classes taught by several tutors, and an admin view of every
-- tutor's students.
--
-- 1. tutor_class_tutors lists extra tutors on a class (the owner stays in
--    tutor_classes.tutor_id). Classes are read and written only through the
--    API with the service role, so RLS is enabled with no client policies.
--    The API keeps each class tutor's roster (tutor_students) in step with the
--    class's members, so co-tutors see those students through the existing
--    tutor policies.
--
-- 2. Admins could read every profile but not the data the Tutor portal shows
--    (rosters, assignments, answers), so the portal's "All tutors" view came
--    back empty. Add admin read policies for those tables. Additive: student,
--    tutor and write policies are unchanged.

create table if not exists public.tutor_class_tutors (
  class_id  uuid not null references public.tutor_classes(id) on delete cascade,
  tutor_id  uuid not null references public.profiles(id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (class_id, tutor_id)
);
create index if not exists tutor_class_tutors_tutor_idx on public.tutor_class_tutors (tutor_id);
alter table public.tutor_class_tutors enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'tutor_students', 'assignments', 'struggle_profiles', 'answer_log',
    'off_topic_attempts', 'exam_attempts', 'study_plan_items', 'user_subscriptions'
  ] loop
    -- Skip tables an older database doesn't have yet.
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_current_user_admin())',
      t || '_admin_read', t
    );
  end loop;
end $$;
