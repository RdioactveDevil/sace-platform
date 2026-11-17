-- Who reviewed a question loaded from an exam paper, and when, so Admin →
-- Exam papers → Loaded papers can show each paper as checked ("Checked 18 Nov
-- by Sam"), part way or not checked. Set by POST /api/admin/questions/review
-- when a question is approved or rejected; cleared when it goes back to review.
alter table public.questions
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
