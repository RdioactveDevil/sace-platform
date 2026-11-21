-- Deleting a curriculum keeps tutors' link diagnostics.
--
-- Diagnostics a tutor sends as a link (the Diagnostic tab, often to a
-- prospective student) now record the curriculum they were written from
-- (curriculum_id, subtopic_ids). diagnostic_assessments.curriculum_id cascades
-- on delete, which is right for a student's own diagnostic on an included
-- subject but would silently wipe a tutor's link diagnostics and their marked
-- reports whenever an admin deletes the subject. Before a curriculum goes,
-- unlink those (student_id is null) so they stay; students' own diagnostics
-- still go by cascade.
--
-- Test: supabase/tests/link-diagnostics-survive-curriculum-delete.sql

set local lock_timeout = '10s';

create or replace function public.keep_link_diagnostics_on_curriculum_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.diagnostic_assessments
     set curriculum_id = null, subtopic_ids = '{}'
   where curriculum_id = old.id
     and student_id is null;
  return old;
end;
$$;

drop trigger if exists keep_link_diagnostics_on_curriculum_delete on public.curricula;
create trigger keep_link_diagnostics_on_curriculum_delete
  before delete on public.curricula
  for each row execute function public.keep_link_diagnostics_on_curriculum_delete();
