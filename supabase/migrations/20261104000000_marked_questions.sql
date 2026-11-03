-- Written-answer questions marked by AI, SACE style.
--
-- A new question_type 'marked': the student writes an answer (working,
-- explanation, equations) and the AI marks it against the question's marking
-- scheme, one mark point at a time, the way a SACE assessor would.
--
--   total_marks     the question's marks, e.g. 3
--   marking_scheme  the mark points, in order, adding up to total_marks:
--                   [{ "marks": 1, "point": "Correct mole ratio from the equation",
--                      "guidance": "Accept 2:1 stated or used" }, ...]
--   solution        (existing column) the model answer, shown after marking
--
-- Students only get these questions in subjects with the 'written_answers'
-- feature switched on (Admin → Curricula → subject → Student features).

alter table public.questions       add column if not exists total_marks    smallint;
alter table public.questions       add column if not exists marking_scheme jsonb;
alter table public.draft_questions add column if not exists total_marks    smallint;
alter table public.draft_questions add column if not exists marking_scheme jsonb;

-- One row per answer the AI marked. The API writes these with the service role
-- (students can't write marks for themselves); a student reads their own, and
-- the same answer to the same question is never marked (or paid for) twice.
--   marks  one entry per mark point, in scheme order:
--          [{ "point": 0, "awarded": 1, "of": 1, "evidence": "<the student's words>",
--             "comment": "why" }, ...]
create table if not exists public.answer_markings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  question_id   text not null references public.questions(id) on delete cascade,
  response      text not null,
  response_hash text not null,
  awarded       smallint not null check (awarded >= 0),
  total         smallint not null check (total > 0),
  marks         jsonb not null default '[]'::jsonb,
  summary       text,
  model         text,
  created_at    timestamptz not null default now(),
  unique (user_id, question_id, response_hash)
);
create index if not exists answer_markings_question_idx on public.answer_markings (question_id);
create index if not exists answer_markings_user_idx on public.answer_markings (user_id, created_at desc);

alter table public.answer_markings enable row level security;
drop policy if exists answer_markings_read_own on public.answer_markings;
create policy answer_markings_read_own on public.answer_markings
  for select using (auth.uid() = user_id);
drop policy if exists answer_markings_admin_read on public.answer_markings;
create policy answer_markings_admin_read on public.answer_markings
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
