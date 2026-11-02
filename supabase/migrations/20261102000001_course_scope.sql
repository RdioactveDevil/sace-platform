-- Keeping questions on the course.
--
-- curricula.out_of_scope        what this course leaves out, subject-wide
--                               (e.g. "No inverse functions. No CAS-only methods.")
-- curriculum_subtopics.scope    the official key ideas / dot points for that subtopic
--
-- Both are filled from the course document by AI and edited by an admin
-- (Admin -> subject -> Course scope). The question generators put them in
-- their prompts, and a course check (api-server lib/course-scope.ts) rejects
-- generated questions that go outside them before they reach the bank.
--
-- question_scope_checks          one row per subject and question: the course
--                                check's verdict (audit), or a student's
--                                "Not in my course" report, and what an admin
--                                did about it. Service role only.
-- curriculum_hidden_questions    questions kept out of one subject without
--                                deleting them (a borrowed question that suits
--                                VCE but not SACE). The app leaves them out of
--                                that subject's bank (gradefarm lib/db.js).

alter table public.curricula add column if not exists out_of_scope text not null default '';
alter table public.curriculum_subtopics add column if not exists scope text not null default '';

create table if not exists public.question_scope_checks (
  curriculum_id uuid not null references public.curricula(id) on delete cascade,
  question_id text not null references public.questions(id) on delete cascade,
  verdict text not null check (verdict in ('in', 'out', 'reported')),
  reason text not null default '',
  source text not null default 'audit' check (source in ('audit', 'student')),
  reported_by uuid references auth.users(id) on delete set null,
  resolution text check (resolution in ('kept', 'hidden')),
  checked_at timestamptz not null default now(),
  primary key (curriculum_id, question_id)
);

create index if not exists question_scope_checks_open_idx
  on public.question_scope_checks (curriculum_id) where verdict <> 'in';

alter table public.question_scope_checks enable row level security;

create table if not exists public.curriculum_hidden_questions (
  curriculum_id uuid not null references public.curricula(id) on delete cascade,
  question_id text not null references public.questions(id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (curriculum_id, question_id)
);

alter table public.curriculum_hidden_questions enable row level security;

drop policy if exists "Signed-in users read hidden questions" on public.curriculum_hidden_questions;
create policy "Signed-in users read hidden questions" on public.curriculum_hidden_questions
  for select to authenticated using (true);
