-- How big a question's maths prints, set from its paper page (Admin → a
-- subject → Exam papers → a paper → Maths size).
--
-- Superscripts, subscripts, integral limits and fractions in a line of text
-- print small, and some rebuilt equations come out hard to read. math_scale
-- multiplies that question's printed maths (ExamPaper.jsx, lib/mathScale.js):
-- null is the normal size; the paper page offers 1.15, 1.3 and 1.5.
--
-- Written only through the API (PATCH /api/admin/questions/:id/math-scale,
-- service role): live questions have no update policy for signed-in users.

set local lock_timeout = '10s';

alter table public.questions
  add column if not exists math_scale real;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'questions_math_scale_check') then
    alter table public.questions
      add constraint questions_math_scale_check
      check (math_scale is null or (math_scale >= 0.8 and math_scale <= 2));
  end if;
end $$;
