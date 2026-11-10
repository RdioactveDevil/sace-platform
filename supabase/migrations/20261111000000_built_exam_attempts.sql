-- Self-marked attempts at exams from the exam builder (the Exams dashboard).
-- A student downloads an exam, sits it on paper, then marks each part against
-- the solutions: marks out of the part's total, or "skipped" when they left it
-- blank, kept apart from answers that scored 0.
--
-- `snapshot` is the exam as it was when the attempt began, so a score still
-- makes sense if the saved exam is edited later:
--   { "title", "subject", "questions": [{ "id", "number", "topic", "source",
--     "parts": [{ "label": "(a)(ii)", "marks": 2 }] }] }
-- `marks` is keyed "<question id>#<part index>" → integer marks or "skip".
-- `question_ids` lists the snapshot's questions so the API can find them:
-- a question in one of a student's attempts has had its solution shown, so
-- answering it in practice earns no XP (routes/answers.ts).
--
-- Self-marked scores give no XP and stay out of leaderboards and the exam
-- simulator's `exam_attempts`.
--
-- Who sees a row: its owner (read and write); tutors of the class the exam
-- was shared with (read); admins (read).

create table if not exists public.built_exam_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  exam_id        uuid references public.built_exams(id) on delete set null,
  subject        text not null,
  title          text not null,
  snapshot       jsonb not null default '{}'::jsonb,
  question_ids   text[] not null default '{}',
  marks          jsonb not null default '{}'::jsonb,
  scored         integer not null default 0,
  available      integer not null default 0,
  skipped        integer not null default 0,
  status         text not null default 'not_marked' check (status in ('not_marked', 'marking', 'marked')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  marked_at      timestamptz
);

create index if not exists built_exam_attempts_user_idx on public.built_exam_attempts (user_id, subject, created_at desc);
create index if not exists built_exam_attempts_exam_idx on public.built_exam_attempts (exam_id) where exam_id is not null;
create index if not exists built_exam_attempts_qids_idx on public.built_exam_attempts using gin (question_ids);

alter table public.built_exam_attempts enable row level security;

drop policy if exists built_exam_attempts_own on public.built_exam_attempts;
create policy built_exam_attempts_own on public.built_exam_attempts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists built_exam_attempts_tutor_read on public.built_exam_attempts;
create policy built_exam_attempts_tutor_read on public.built_exam_attempts
  for select to authenticated
  using (exists (
    select 1 from public.built_exams e
    where e.id = exam_id and e.class_id is not null and public.is_class_tutor(e.class_id)
  ));

drop policy if exists built_exam_attempts_admin_read on public.built_exam_attempts;
create policy built_exam_attempts_admin_read on public.built_exam_attempts
  for select to authenticated
  using (public.is_current_user_admin());
