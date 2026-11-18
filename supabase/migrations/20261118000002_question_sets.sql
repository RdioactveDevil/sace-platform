-- Question sets: exam questions that share one block of information ("Use the
-- following information to answer Questions 29 and 30.", then the
-- information). They stay together in built exams, and in practice each shows
-- the shared information above it (artifacts/gradefarm/src/lib/questionSets.js).
--
--   set_key           the same for every question of a set (the first one's id)
--   set_position      1, 2, 3… in paper order
--   shared_info       on the set's first question only: the shared
--                     information, without the "Use the following
--                     information…" sentence (printed with the exam's numbers)
--   shared_image_url  on the set's first question only: the shared figure
--
-- questions_student gives every question of a set the set's shared
-- information and figure, read from the first question even when that one is
-- hidden from students, so a follow-on question always comes with what it
-- needs.
alter table public.questions
  add column if not exists set_key text,
  add column if not exists set_position smallint,
  add column if not exists shared_info text,
  add column if not exists shared_image_url text;

create index if not exists questions_set_key_idx on public.questions (set_key) where set_key is not null;

-- As in 20261118000000_question_review.sql, with the set columns.
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
  q.review_status,
  q.set_key, q.set_position,
  coalesce(q.shared_info, (
    select l.shared_info from public.questions l
     where l.set_key = q.set_key and l.shared_info is not null
     order by l.set_position limit 1
  )) as shared_info,
  coalesce(q.shared_image_url, (
    select l.shared_image_url from public.questions l
     where l.set_key = q.set_key and l.shared_image_url is not null
     order by l.set_position limit 1
  )) as shared_image_url
from public.questions q
where (select public.is_staff())
   or (
     (q.review_status is null or q.review_status = 'approved')
     and (q.curriculum_id = any (array(select public.readable_curriculum_ids()))
          or q.subtopic_id = any (array(select public.readable_shared_subtopic_ids())))
   );

revoke all on public.questions_student from public, anon;
grant select on public.questions_student to authenticated;
