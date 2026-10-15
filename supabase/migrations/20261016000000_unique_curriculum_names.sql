-- Give every curriculum a unique name, and keep it that way.
--
-- Much of the app (topic lists, question top-ups, the tutor dashboard) finds a
-- curriculum by its name. Two curricula were both called "Chemistry" (Stage 1
-- and Stage 2), so those lookups matched two rows and returned nothing: the
-- topic list came up empty and top-ups failed.
--
-- This migration:
--   1. renames every curriculum whose name clashes to its canonical
--      "<Title> Stage N" / "Year N <Title>" form, and moves student
--      subscriptions to the new name;
--   2. re-sorts questions between the renamed curricula: a question whose
--      subject names a stage follows it; one with a bare title ("Chemistry")
--      goes to whichever curriculum has its subtopic;
--   3. adds a unique index so a duplicate name can't be created again.

-- ── 1. Rename clashing curricula ─────────────────────────────────────────────
drop table if exists renamed_curricula;
create temporary table renamed_curricula as
select c.id,
       c.name as old_name,
       c.level_label,
       case
         when c.level_label ~* '^stage\s*[12]$'
           then btrim(regexp_replace(c.name, '\s*stage\s*[12]\s*$', '', 'i')) || ' ' || initcap(c.level_label)
         when c.level_label ~* '^year\s*\d+'
           then initcap(c.level_label) || ' ' || btrim(regexp_replace(c.name, '^\s*year\s*\d+\s*', '', 'i'))
         else c.name || ' (' || c.level_label || ')'
       end as new_name
  from public.curricula c
 where lower(btrim(c.name)) in (
         select lower(btrim(name)) from public.curricula group by 1 having count(*) > 1
       )
   and btrim(c.level_label) <> '';

update public.curricula c
   set name = r.new_name
  from renamed_curricula r
 where c.id = r.id and c.name <> r.new_name;

update public.user_subscriptions s
   set subject_name = r.new_name
  from renamed_curricula r
 where s.subject_name = r.old_name
   and lower(s.stage) = lower(r.level_label)
   and not exists (
         select 1 from public.user_subscriptions x
          where x.user_id = s.user_id and x.subject_name = r.new_name and x.stage = s.stage
       );

-- ── 2. Resolve a spelling with the subtopic as a tie-breaker ─────────────────
-- A bare title ("Chemistry") matches every stage of that subject; the
-- question's subtopic picks the one curriculum that teaches it.
create or replace function public.resolve_curriculum_id(p_subject text, p_subtopic text)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_id  uuid := public.resolve_curriculum_id(p_subject);
  k     text;
  ids   uuid[];
begin
  if v_id is not null or coalesce(btrim(p_subtopic), '') = '' then
    return v_id;
  end if;
  k := public.subject_match_key(p_subject);
  if k is null then
    return null;
  end if;
  select array_agg(distinct t.curriculum_id) into ids
    from public.curriculum_subtopics s
    join public.curriculum_topics t on t.id = s.topic_id
    join public.curricula c on c.id = t.curriculum_id
   where lower(btrim(s.name)) = lower(btrim(p_subtopic))
     and split_part(public.subject_match_key(c.name, c.level_label), '|', 1) = split_part(k, '|', 1);
  if coalesce(array_length(ids, 1), 0) = 1 then
    return ids[1];
  end if;
  return null;
end;
$$;

-- New and edited questions use the subtopic tie-breaker too.
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
     and (tg_op = 'UPDATE' or new.subtopic_id is null) then
    new.subtopic_id := public.resolve_subtopic_id(new.curriculum_id, new.subtopic);
  end if;
  return new;
end;
$$;

-- Re-sort questions that belong to a renamed curriculum, or to its title
-- without a stage (these were previously unlinked or linked by guesswork).
update public.questions q
   set curriculum_id = coalesce(public.resolve_curriculum_id(q.subject, q.subtopic), q.curriculum_id)
 where q.curriculum_id in (select id from renamed_curricula)
    or (q.curriculum_id is null
        and split_part(public.subject_match_key(q.subject), '|', 1) in (
              select split_part(public.subject_match_key(r.new_name, r.level_label), '|', 1)
                from renamed_curricula r));

update public.draft_questions q
   set curriculum_id = coalesce(public.resolve_curriculum_id(q.subject, q.subtopic), q.curriculum_id)
 where q.curriculum_id in (select id from renamed_curricula)
    or (q.curriculum_id is null
        and split_part(public.subject_match_key(q.subject), '|', 1) in (
              select split_part(public.subject_match_key(r.new_name, r.level_label), '|', 1)
                from renamed_curricula r));

-- ── 3. No duplicate names from now on ────────────────────────────────────────
create unique index if not exists curricula_name_unique
  on public.curricula (lower(btrim(name)));

drop table if exists renamed_curricula;
