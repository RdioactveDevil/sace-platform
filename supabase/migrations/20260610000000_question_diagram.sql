-- Optional AI-authored vector diagram for a question (labelled figures, circuits,
-- geometry, reaction/energy profiles, simple charts). Stored as { svg, caption }.
-- Rendered as a sandboxed data-URI image, so no script can execute.

alter table questions       add column if not exists diagram jsonb;
alter table draft_questions add column if not exists diagram jsonb;
