-- Questions from real exam papers, for the exam builder (lib/examBuilder.js):
-- official past exams (e.g. VCAA) and commercial trial exams, loaded whole by
-- the past-paper ingest script (scripts/src/ingest-past-paper.ts).
--
--   source            label shown with the question: "VCAA 2023 Exam 2"
--   source_kind       'official' or 'commercial'
--   source_publisher  "VCAA", "NEAP", ...
--   source_year       2023
--   source_paper      which paper: "Exam 1", "Exam 2" (one exam never mixes papers)
--   source_question   the number printed on the paper: "5", "3"
--   exam_section      'A' (multiple choice) or 'B' (short and extended answer)
--   parts             multi-part written questions: [{ label, text, marks, solution, image_url, level }]
--
-- Multi-part questions use question_type 'extended'; practice quizzes leave
-- them out (getQuestionsForSubjectTile), only the exam builder uses them.
-- All null for questions written for GradeFarm.
alter table public.questions
  add column if not exists source text,
  add column if not exists source_kind text,
  add column if not exists source_publisher text,
  add column if not exists source_year smallint,
  add column if not exists source_paper text,
  add column if not exists source_question text,
  add column if not exists exam_section text,
  add column if not exists parts jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'questions_source_kind_check') then
    alter table public.questions add constraint questions_source_kind_check
      check (source_kind is null or source_kind in ('official', 'commercial'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'questions_exam_section_check') then
    alter table public.questions add constraint questions_exam_section_check
      check (exam_section is null or exam_section in ('A', 'B'));
  end if;
end $$;

create index if not exists questions_source_idx
  on public.questions (source) where source is not null;
