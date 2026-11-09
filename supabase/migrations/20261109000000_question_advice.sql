-- Titan's Advice: a teacher's annotations on a written-answer question, made
-- once per question by AI and kept here so every student sees the same marks.
--   advice = {
--     notes: [{ quote, mark: underline|double_underline|circle|box, note }],
--       quote is either a phrase copied from the question's plain text, or one
--       whole maths segment of it ($...$), so the app can find it on screen;
--     cells: [{ row, col, note? }],   table cells to circle (0-based, body rows)
--     steps: [string],                how the question leads to the answer
--     model: string, created_at: string
--   }
-- Written by the API (service role) only.

alter table public.questions add column if not exists advice jsonb;
