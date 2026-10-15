-- Link questions to their curriculum by ID instead of by subject spelling.
--
-- Until now `questions.subject` (free text) was the only link between a
-- question and its subject, so "Chemistry Stage 2", "Stage 2 Chemistry",
-- "SACE Stage 2 Chemistry :" … all had to be matched by alias-guessing code,
-- and a rename or typo silently orphaned questions.
--
-- This migration:
--   1. adds questions.curriculum_id / subtopic_id (and the same on
--      draft_questions), with foreign keys;
--   2. backfills them by matching each spelling to exactly one curriculum;
--   3. keeps them filled automatically on every insert/update via a trigger,
--      so the API, admin screens and scripts don't each need to set them.
--
-- `subject` / `topic` / `subtopic` text columns stay for display and as a
-- fallback; nothing is deleted.

-- ── 1. Spelling-insensitive key: "SACE Stage 2 Chemistry :" → "chemistry|stage2"
create or replace function public.subject_match_key(p_subject text, p_level text default '')
returns text
language plpgsql
immutable
as $$
declare
  raw   text := lower(btrim(coalesce(p_subject, '')));
  lvl   text := lower(btrim(coalesce(p_level, '')));
  level_re constant text := '(stage\s*[12]|year\s*\d{1,2}(\s*[–-]\s*\d{1,2})?)';
  level_tok text;
  title text;
begin
  raw := regexp_replace(raw, '[\s:;,.]+$', '');
  raw := regexp_replace(raw, '^sace\s+', '');
  if raw = '' then
    return null;
  end if;
  level_tok := substring(raw from level_re);
  if level_tok is null and lvl <> '' then
    level_tok := substring(lvl from level_re);
  end if;
  title := regexp_replace(raw, level_re, '', 'g');
  title := btrim(regexp_replace(title, '\s+', ' ', 'g'));
  if title = '' then
    return null;
  end if;
  return title || '|' || coalesce(regexp_replace(level_tok, '\s+', '', 'g'), '');
end;
$$;

-- ── 2. Resolve a subject spelling to one curriculum (NULL if none or ambiguous)
create or replace function public.resolve_curriculum_id(p_subject text)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  k     text := public.subject_match_key(p_subject);
  ids   uuid[];
begin
  if k is null then
    return null;
  end if;

  select array_agg(c.id) into ids
    from public.curricula c
   where public.subject_match_key(c.name, c.level_label) = k;
  if coalesce(array_length(ids, 1), 0) = 1 then
    return ids[1];
  end if;
  if coalesce(array_length(ids, 1), 0) > 1 then
    return null; -- two curricula share a spelling: leave for an admin to fix
  end if;

  -- Subject with no stage/year (e.g. "Chemistry"): link only if exactly one
  -- curriculum has that title.
  if k like '%|' then
    select array_agg(c.id) into ids
      from public.curricula c
     where split_part(public.subject_match_key(c.name, c.level_label), '|', 1) = split_part(k, '|', 1);
    if coalesce(array_length(ids, 1), 0) = 1 then
      return ids[1];
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.resolve_subtopic_id(p_curriculum_id uuid, p_subtopic text)
returns uuid
language sql
stable
set search_path = public
as $$
  select case when count(*) = 1 then min(s.id::text)::uuid end
    from public.curriculum_subtopics s
    join public.curriculum_topics t on t.id = s.topic_id
   where t.curriculum_id = p_curriculum_id
     and lower(btrim(s.name)) = lower(btrim(coalesce(p_subtopic, '')));
$$;

-- ── 3. Columns ───────────────────────────────────────────────────────────────
alter table public.questions
  add column if not exists curriculum_id uuid references public.curricula(id) on delete set null,
  add column if not exists subtopic_id   uuid references public.curriculum_subtopics(id) on delete set null;
alter table public.draft_questions
  add column if not exists curriculum_id uuid references public.curricula(id) on delete set null,
  add column if not exists subtopic_id   uuid references public.curriculum_subtopics(id) on delete set null;

create index if not exists idx_questions_curriculum_id on public.questions(curriculum_id);
create index if not exists idx_questions_subtopic_id   on public.questions(subtopic_id);
create index if not exists idx_draft_questions_curriculum_id on public.draft_questions(curriculum_id);

-- ── 4. Keep IDs filled on write ──────────────────────────────────────────────
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
        public.resolve_curriculum_id(new.subject),
        case when tg_op = 'UPDATE' then old.curriculum_id end);
    end if;
  end if;
  if new.curriculum_id is not null
     and (tg_op = 'INSERT'
          or new.subtopic is distinct from old.subtopic
          or new.curriculum_id is distinct from old.curriculum_id)
     and (tg_op = 'UPDATE' or new.subtopic_id is null) then
    new.subtopic_id := public.resolve_subtopic_id(new.curriculum_id, new.subtopic);
  end if;
  return new;
end;
$$;

drop trigger if exists fill_question_curriculum_ids on public.questions;
create trigger fill_question_curriculum_ids
  before insert or update of subject, subtopic, curriculum_id on public.questions
  for each row execute function public.fill_question_curriculum_ids();

drop trigger if exists fill_question_curriculum_ids on public.draft_questions;
create trigger fill_question_curriculum_ids
  before insert or update of subject, subtopic, curriculum_id on public.draft_questions
  for each row execute function public.fill_question_curriculum_ids();

-- ── 5. Backfill ──────────────────────────────────────────────────────────────
update public.questions q
   set curriculum_id = public.resolve_curriculum_id(q.subject)
 where q.curriculum_id is null;
update public.questions q
   set subtopic_id = public.resolve_subtopic_id(q.curriculum_id, q.subtopic)
 where q.curriculum_id is not null and q.subtopic_id is null;

update public.draft_questions q
   set curriculum_id = public.resolve_curriculum_id(q.subject)
 where q.curriculum_id is null;
update public.draft_questions q
   set subtopic_id = public.resolve_subtopic_id(q.curriculum_id, q.subtopic)
 where q.curriculum_id is not null and q.subtopic_id is null;

-- ── 6. Link previously-unmatched questions when a curriculum is added/renamed
-- Questions already linked keep their curriculum_id: that's the point of the
-- ID — renaming a curriculum no longer orphans its questions.
create or replace function public.relink_questions_for_curricula()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.questions q
     set curriculum_id = public.resolve_curriculum_id(q.subject)
   where q.curriculum_id is null
     and public.resolve_curriculum_id(q.subject) = new.id;
  update public.draft_questions q
     set curriculum_id = public.resolve_curriculum_id(q.subject)
   where q.curriculum_id is null
     and public.resolve_curriculum_id(q.subject) = new.id;
  return null;
end;
$$;

drop trigger if exists relink_questions_for_curricula on public.curricula;
create trigger relink_questions_for_curricula
  after insert or update of name, level_label on public.curricula
  for each row execute function public.relink_questions_for_curricula();

-- ── 7. Link unlinked questions when a subtopic is added or renamed ─────────
create or replace function public.relink_questions_for_subtopic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curriculum uuid;
begin
  select t.curriculum_id into v_curriculum from public.curriculum_topics t where t.id = new.topic_id;
  if v_curriculum is null then
    return null;
  end if;
  update public.questions q
     set subtopic_id = new.id
   where q.curriculum_id = v_curriculum
     and q.subtopic_id is null
     and lower(btrim(q.subtopic)) = lower(btrim(new.name));
  return null;
end;
$$;

drop trigger if exists relink_questions_for_subtopic on public.curriculum_subtopics;
create trigger relink_questions_for_subtopic
  after insert or update of name, topic_id on public.curriculum_subtopics
  for each row execute function public.relink_questions_for_subtopic();

-- ── 8. Admin report: questions that still have no curriculum ────────────────
create or replace view public.unlinked_question_subjects
with (security_invoker = true)
as
select subject, count(*) as question_count
  from public.questions
 where curriculum_id is null
 group by subject
 order by count(*) desc;
