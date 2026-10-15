-- Reading passages: a passage or poem shared by a small set of questions
-- (e.g. Year 6 English → Reading Comprehension).
--
-- • passages holds the text once; questions point at it with passage_id.
-- • curriculum_topics.question_style = 'passage' makes question generation for
--   that topic produce passage sets (one passage + 4–5 questions) instead of
--   standalone questions. Set it in Admin → Curricula → (subject) topic list.

create table if not exists public.passages (
  id             uuid primary key default gen_random_uuid(),
  curriculum_id  uuid references public.curricula(id) on delete set null,
  subtopic_id    uuid references public.curriculum_subtopics(id) on delete set null,
  title          text not null default '',
  kind           text not null default 'prose' check (kind in ('prose', 'poem')),
  body           text not null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_passages_curriculum on public.passages(curriculum_id);

alter table public.passages enable row level security;

-- Readable by anyone who can read questions; written only by the API (service role).
drop policy if exists "passages_read_all" on public.passages;
create policy "passages_read_all"
  on public.passages
  for select
  using (true);
grant select on public.passages to anon, authenticated;

alter table public.questions
  add column if not exists passage_id uuid references public.passages(id) on delete set null;
alter table public.draft_questions
  add column if not exists passage_id uuid references public.passages(id) on delete set null;
create index if not exists idx_questions_passage_id on public.questions(passage_id);

alter table public.curriculum_topics
  add column if not exists question_style text not null default 'standard';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'curriculum_topics_question_style_check'
  ) then
    alter table public.curriculum_topics
      add constraint curriculum_topics_question_style_check
      check (question_style in ('standard', 'passage'));
  end if;
end $$;
