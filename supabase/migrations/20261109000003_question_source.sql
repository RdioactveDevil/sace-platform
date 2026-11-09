-- Where a question came from, for past-exam questions: the paper
-- ("VCAA 2024 Exam 1"), its year and the question number as printed. The test
-- maker filters and labels by these; the past-paper ingest script sets them
-- (--source, --year). Null for questions written for GradeFarm.
alter table public.questions
  add column if not exists source text,
  add column if not exists source_year smallint,
  add column if not exists source_question text;

create index if not exists questions_source_year_idx
  on public.questions (source_year) where source is not null;
