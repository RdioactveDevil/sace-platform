-- Multi-format question support.
--
-- Questions were previously always 4-option multiple choice (options +
-- answer_index). These columns let a question declare a different type and
-- carry the answer data that type needs. Column names match the frontend
-- question fields exactly so `select('*')` feeds the renderer with no mapping.
--
-- Backward compatible: question_type defaults to 'mcq', so every existing row
-- and every existing MCQ generation keeps working unchanged.
--
--   mcq          → options, answer_index            (unchanged, legacy)
--   multi_select → options, answer_indices (jsonb int array)
--   numeric      → answer (number), tolerance, unit
--   short_text   → accept (jsonb string array), case_sensitive
--   order        → items  (jsonb string array, in correct order)

alter table questions       add column if not exists question_type  text default 'mcq';
alter table questions       add column if not exists answer_indices jsonb;
alter table questions       add column if not exists answer         double precision;
alter table questions       add column if not exists tolerance      double precision;
alter table questions       add column if not exists unit           text;
alter table questions       add column if not exists accept         jsonb;
alter table questions       add column if not exists items          jsonb;
alter table questions       add column if not exists case_sensitive boolean;
alter table questions       add column if not exists hotspots       jsonb;
alter table questions       add column if not exists markers        jsonb;
alter table questions       add column if not exists labels         jsonb;

alter table draft_questions add column if not exists question_type  text default 'mcq';
alter table draft_questions add column if not exists answer_indices jsonb;
alter table draft_questions add column if not exists answer         double precision;
alter table draft_questions add column if not exists tolerance      double precision;
alter table draft_questions add column if not exists unit           text;
alter table draft_questions add column if not exists accept         jsonb;
alter table draft_questions add column if not exists items          jsonb;
alter table draft_questions add column if not exists case_sensitive boolean;
alter table draft_questions add column if not exists hotspots       jsonb;
alter table draft_questions add column if not exists markers        jsonb;
alter table draft_questions add column if not exists labels         jsonb;

-- Non-MCQ types (numeric, short_text, order) carry no options/answer_index, so
-- these legacy columns must be nullable. Existing rows keep their values.
alter table questions       alter column options      drop not null;
alter table questions       alter column answer_index drop not null;
alter table draft_questions alter column options      drop not null;
alter table draft_questions alter column answer_index drop not null;

-- Backfill any NULL types (defensive — default handles new rows).
update questions       set question_type = 'mcq' where question_type is null;
update draft_questions set question_type = 'mcq' where question_type is null;
