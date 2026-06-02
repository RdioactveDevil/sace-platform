-- Add subject_category to curricula so generation prompts can be tailored
-- without hardcoding subject name patterns in application code.
-- Values: 'maths' | 'science' | 'english' | 'humanities'
-- Built-in subjects (Y7/Y10 Maths, Chemistry) use hardcoded branches and don't need this.

alter table public.curricula
  add column if not exists subject_category text
    check (subject_category in ('maths', 'science', 'english', 'humanities'))
    default null;
