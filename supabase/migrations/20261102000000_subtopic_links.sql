-- Sharing questions between subjects, one subtopic at a time.
--
-- A row says "subtopic_id also uses the questions of source_subtopic_id":
-- e.g. SACE Stage 1 Methods "Quadratic functions" borrows VCE Methods
-- Units 1 & 2 "Quadratics". The app loads a subject's own questions plus the
-- questions of every source subtopic, filed under the borrowing subtopic
-- (lib/db.js getQuestionsForSubjectTile). The questions themselves stay put,
-- so a fix in one subject shows in both and a student's history for a
-- question is the same in each. Links are one level deep: a source's own
-- borrowed questions don't pass through.
--
-- Admins set links from the subject editor (api-server routes/subtopic-links.ts,
-- service key). Signed-in users only read them.

create table if not exists public.subtopic_links (
  subtopic_id uuid not null references public.curriculum_subtopics(id) on delete cascade,
  source_subtopic_id uuid not null references public.curriculum_subtopics(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subtopic_id, source_subtopic_id),
  constraint subtopic_links_not_self check (subtopic_id <> source_subtopic_id)
);

create index if not exists subtopic_links_source_idx on public.subtopic_links (source_subtopic_id);

alter table public.subtopic_links enable row level security;

drop policy if exists "Signed-in users read subtopic links" on public.subtopic_links;
create policy "Signed-in users read subtopic links" on public.subtopic_links
  for select to authenticated using (true);

-- Reading borrowed questions. A student who can read a subject (a curriculum
-- in readable_curriculum_ids()) can also read the questions, and their
-- passages, of every subtopic that subject's subtopics borrow from.
create or replace function public.readable_shared_subtopic_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.source_subtopic_id
    from public.subtopic_links l
    join public.curriculum_subtopics s on s.id = l.subtopic_id
   where s.curriculum_id in (select public.readable_curriculum_ids())
$$;

revoke all on function public.readable_shared_subtopic_ids() from public, anon;
grant execute on function public.readable_shared_subtopic_ids() to authenticated;

alter policy questions_read_entitled on public.questions to authenticated using (
  (select public.is_staff())
  or curriculum_id = any (array(select public.readable_curriculum_ids()))
  or subtopic_id = any (array(select public.readable_shared_subtopic_ids()))
);

alter policy passages_read_entitled on public.passages to authenticated using (
  (select public.is_staff())
  or curriculum_id = any (array(select public.readable_curriculum_ids()))
  or subtopic_id = any (array(select public.readable_shared_subtopic_ids()))
);

-- The same rule for a given user, as the API checks it with the service role.
create or replace function public.user_can_read_question(p_user uuid, p_question_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with readable as (
    select c.id
      from public.curricula c
      join public.user_subscriptions s
        on s.user_id = p_user
       and s.active
       and s.subject_name = c.name
       and (coalesce(s.stage, '') = '' or coalesce(trim(c.level_label), '') in ('', s.stage))
  )
  select exists (
    select 1
      from public.questions q
     where q.id = p_question_id
       and (
         exists (select 1 from public.profiles p where p.id = p_user and (p.is_admin or p.is_tutor))
         or q.curriculum_id in (select id from readable)
         or q.subtopic_id in (
           select l.source_subtopic_id
             from public.subtopic_links l
             join public.curriculum_subtopics st on st.id = l.subtopic_id
            where st.curriculum_id in (select id from readable)
         )
       )
  )
$$;

revoke all on function public.user_can_read_question(uuid, text) from public, anon, authenticated;
grant execute on function public.user_can_read_question(uuid, text) to service_role;
