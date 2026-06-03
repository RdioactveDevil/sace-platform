-- Add exam_context column to curricula for storing exam scope notes, textbook references,
-- and past exam guidance that will be included in AI generation prompts.
alter table public.curricula
  add column if not exists exam_context text;

comment on column public.curricula.exam_context is
  'Admin-supplied context for generation accuracy: past exam notes, textbook references, scope constraints. Included verbatim in Claude prompts when generating questions for this curriculum.';
