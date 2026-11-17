-- Reviewing questions loaded from exam papers before students see them
-- (Admin → Exam papers → Loaded papers). The ingest
-- (scripts/src/ingest-past-paper.ts) saves each question as 'pending' with
-- what it found wrong; an admin checks it against the paper and approves it.
--
--   review_status  'pending' | 'approved' | 'rejected'. Null for every other
--                  question, and for exam-paper questions loaded before this,
--                  which stay live as they were.
--   review         { printed_marks, flags: [{ code, where, message }] }: the
--                  total printed with the question, and what a close look at
--                  each cropped figure found. The app adds its own text checks
--                  (artifacts/gradefarm/src/lib/questionChecks.js).
--
-- Students read questions through questions_student, which now leaves out
-- pending and rejected questions; staff still see everything.
alter table public.questions
  add column if not exists review_status text,
  add column if not exists review jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'questions_review_status_check') then
    alter table public.questions add constraint questions_review_status_check
      check (review_status is null or review_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists questions_review_pending_idx
  on public.questions (source) where review_status = 'pending';

-- As in 20261110000000_server_marking.sql, with review_status and the review gate.
drop view if exists public.questions_student;
create view public.questions_student
with (security_invoker = false, security_barrier = true) as
select
  q.id, q.subject, q.topic, q.subtopic, q.difficulty, q.question, q.options,
  q.sace_code, q.created_at, q.concept_tag, q.graph, q.table_data, q.image_url,
  q.question_type, q.unit, q.case_sensitive, q.labels, q.diagram,
  q.curriculum_id, q.subtopic_id, q.passage_id, q.total_marks,
  q.source, q.source_kind, q.source_publisher, q.source_year, q.source_paper,
  q.source_question, q.exam_section,
  case when jsonb_typeof(q.items) = 'array' then
    (select jsonb_agg(x order by md5(q.id || x::text)) from jsonb_array_elements(q.items) x)
  end as items,
  case when jsonb_typeof(q.hotspots) = 'array' then
    (select jsonb_agg(h - 'correct' - 'label' order by ord) from jsonb_array_elements(q.hotspots) with ordinality as t(h, ord))
  end as hotspots,
  case when jsonb_typeof(q.markers) = 'array' then
    (select jsonb_agg(m - 'answer' order by ord) from jsonb_array_elements(q.markers) with ordinality as t(m, ord))
  end as markers,
  case when jsonb_typeof(q.parts) = 'array' then
    (select jsonb_agg(p - 'solution' - 'answer' - 'marking_scheme' order by ord) from jsonb_array_elements(q.parts) with ordinality as t(p, ord))
  end as parts,
  q.review_status
from public.questions q
where (select public.is_staff())
   or (
     (q.review_status is null or q.review_status = 'approved')
     and (q.curriculum_id = any (array(select public.readable_curriculum_ids()))
          or q.subtopic_id = any (array(select public.readable_shared_subtopic_ids())))
   );

revoke all on public.questions_student from public, anon;
grant select on public.questions_student to authenticated;
