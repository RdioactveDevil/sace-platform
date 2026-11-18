-- Renaming a topic or subtopic carries the new name onto its questions.
--
-- Questions link to their subtopic by ID (questions.subtopic_id), but they also
-- keep the topic and subtopic names as text (questions.topic / .subtopic), and
-- parts of the app go by that text: practice and assignments match questions on
-- the subtopic name, and the exam builder groups them by the topic name. Until
-- now, renaming "Topic 1: Monitoring the environment" in Admin left every
-- question saying the old name, so the exam builder showed both names with the
-- questions split between them; renaming a subtopic left its questions out of
-- practice until an admin remapped them.
--
-- From now on, in questions and draft_questions:
--   * renaming a topic sets `topic` on the questions of all its subtopics;
--   * renaming a subtopic, or moving it to another topic, sets `subtopic` and
--     `topic` on its questions.
-- Only questions linked by subtopic_id change; unlinked ones are left alone.
--
-- fill_question_curriculum_ids looks a question's subtopic up again by name
-- whenever its subtopic text changes. That lookup gives up (sets NULL) when two
-- subtopics in the curriculum briefly share a name, which can happen part way
-- through saving a renamed tree, so it now keeps the current link when the
-- linked subtopic already has the question's new name.
--
-- concept_tag is left as it is: it is an identifier that question_variants
-- rows are filed under, not a label.

set local lock_timeout = '10s';

-- ── 1. Keep a link that already agrees with the new subtopic name ───────────
create or replace function public.fill_question_curriculum_ids()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.subject is distinct from old.subject then
    if tg_op = 'INSERT' and new.curriculum_id is not null then
      null; -- caller set it explicitly
    else
      -- An unrecognised spelling keeps the existing link rather than orphaning.
      new.curriculum_id := coalesce(
        public.resolve_curriculum_id(new.subject, new.subtopic),
        case when tg_op = 'UPDATE' then old.curriculum_id end);
    end if;
  end if;
  if new.curriculum_id is not null
     and (tg_op = 'INSERT'
          or new.subtopic is distinct from old.subtopic
          or new.curriculum_id is distinct from old.curriculum_id)
     and (tg_op = 'UPDATE' or new.subtopic_id is null)
     -- Already linked to a subtopic of this curriculum with this name: keep it.
     and not exists (
           select 1
             from public.curriculum_subtopics s
             join public.curriculum_topics t on t.id = s.topic_id
            where s.id = new.subtopic_id
              and t.curriculum_id = new.curriculum_id
              and lower(btrim(s.name)) = lower(btrim(coalesce(new.subtopic, ''))))
  then
    new.subtopic_id := public.resolve_subtopic_id(new.curriculum_id, new.subtopic);
  end if;
  return new;
end;
$$;

-- ── 2. Subtopic renamed or moved to another topic ───────────────────────────
create or replace function public.sync_question_names_for_subtopic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic text;
begin
  if new.name is not distinct from old.name and new.topic_id is not distinct from old.topic_id then
    return null;
  end if;
  select t.name into v_topic from public.curriculum_topics t where t.id = new.topic_id;

  update public.questions q
     set subtopic = new.name,
         topic    = coalesce(v_topic, q.topic)
   where q.subtopic_id = new.id
     and (q.subtopic is distinct from new.name or q.topic is distinct from coalesce(v_topic, q.topic));

  update public.draft_questions q
     set subtopic = new.name,
         topic    = coalesce(v_topic, q.topic)
   where q.subtopic_id = new.id
     and (q.subtopic is distinct from new.name or q.topic is distinct from coalesce(v_topic, q.topic));
  return null;
end;
$$;

drop trigger if exists sync_question_names_for_subtopic on public.curriculum_subtopics;
create trigger sync_question_names_for_subtopic
  after update of name, topic_id on public.curriculum_subtopics
  for each row execute function public.sync_question_names_for_subtopic();

-- ── 3. Topic renamed ────────────────────────────────────────────────────────
create or replace function public.sync_question_names_for_topic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is not distinct from old.name then
    return null;
  end if;

  update public.questions q
     set topic = new.name
    from public.curriculum_subtopics s
   where s.topic_id = new.id
     and q.subtopic_id = s.id
     and q.topic is distinct from new.name;

  update public.draft_questions q
     set topic = new.name
    from public.curriculum_subtopics s
   where s.topic_id = new.id
     and q.subtopic_id = s.id
     and q.topic is distinct from new.name;
  return null;
end;
$$;

drop trigger if exists sync_question_names_for_topic on public.curriculum_topics;
create trigger sync_question_names_for_topic
  after update of name on public.curriculum_topics
  for each row execute function public.sync_question_names_for_topic();

-- The editors call these through the tables' triggers only.
revoke all on function public.sync_question_names_for_subtopic() from public, anon, authenticated;
revoke all on function public.sync_question_names_for_topic() from public, anon, authenticated;

-- ── 4. Bring existing questions into line ───────────────────────────────────
-- A few linked questions still carry an older topic name (their subtopic was
-- moved to another topic before this sync existed).
update public.questions q
   set topic = t.name
  from public.curriculum_subtopics s
  join public.curriculum_topics t on t.id = s.topic_id
 where q.subtopic_id = s.id
   and q.topic is distinct from t.name;

update public.draft_questions q
   set topic = t.name
  from public.curriculum_subtopics s
  join public.curriculum_topics t on t.id = s.topic_id
 where q.subtopic_id = s.id
   and q.topic is distinct from t.name;
