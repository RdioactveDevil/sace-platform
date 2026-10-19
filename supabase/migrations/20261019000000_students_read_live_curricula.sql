-- Students could not see any subjects: the curricula, curriculum_topics and
-- curriculum_subtopics read policies only admitted admins and tutors, so
-- onboarding's subject step and the subject picker came back empty for
-- students (even ones already subscribed to a subject).
--
-- Let any signed-in user read the subject catalogue a student can choose
-- from: live (or generating) subjects that aren't archived, and their topics
-- and subtopics. These policies are additive; admin/tutor access and all
-- write policies are unchanged.

drop policy if exists "curricula_read_live" on public.curricula;
create policy "curricula_read_live"
  on public.curricula
  for select
  to authenticated
  using (status in ('live', 'generating') and archived_at is null);

drop policy if exists "curriculum_topics_read_live" on public.curriculum_topics;
create policy "curriculum_topics_read_live"
  on public.curriculum_topics
  for select
  to authenticated
  using (exists (
    select 1 from public.curricula c
    where c.id = curriculum_topics.curriculum_id
      and c.status in ('live', 'generating')
      and c.archived_at is null
  ));

drop policy if exists "curriculum_subtopics_read_live" on public.curriculum_subtopics;
create policy "curriculum_subtopics_read_live"
  on public.curriculum_subtopics
  for select
  to authenticated
  using (exists (
    select 1
    from public.curriculum_topics t
    join public.curricula c on c.id = t.curriculum_id
    where t.id = curriculum_subtopics.topic_id
      and c.status in ('live', 'generating')
      and c.archived_at is null
  ));
