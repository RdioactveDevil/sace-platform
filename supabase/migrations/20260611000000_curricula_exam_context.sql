-- Per-curriculum exam context: free-text notes from the admin about the real
-- exam (structure, mark weighting, terminology, scope) that get injected into
-- every question-generation prompt for that curriculum.
alter table public.curricula
  add column if not exists exam_context text;
