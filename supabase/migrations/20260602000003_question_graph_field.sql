-- Add optional graph spec column to questions and draft_questions.
-- Only questions that require a visual graph will have this populated.
-- Schema: { functions?: [{expr: string, color?: string}], points?: [{x: number, y: number, label?: string}], xRange?: [number, number], yRange?: [number, number] }

alter table questions
  add column if not exists graph jsonb default null;

alter table draft_questions
  add column if not exists graph jsonb default null;
