-- Replace subject_category (coarse enum) with generation_flags (flexible JSONB).
-- Each flag independently enables a generation feature for the curriculum.
-- Migrate existing maths rows from subject_category to generation_flags.

alter table public.curricula
  add column if not exists generation_flags jsonb default '{}'::jsonb;

-- Migrate existing subject_category values
update public.curricula set generation_flags =
  case subject_category
    when 'maths'       then '{"latex": true, "graphs": true,  "tables": false}'::jsonb
    when 'science'     then '{"latex": true, "graphs": false, "tables": true}'::jsonb
    when 'english'     then '{"latex": false,"graphs": false, "tables": false}'::jsonb
    when 'humanities'  then '{"latex": false,"graphs": false, "tables": false}'::jsonb
    else                    '{}'::jsonb
  end
where subject_category is not null;

alter table public.curricula drop column if exists subject_category;

-- Optional table data for questions (e.g. frequency tables, data tables)
alter table questions
  add column if not exists table_data jsonb default null;

alter table draft_questions
  add column if not exists table_data jsonb default null;
