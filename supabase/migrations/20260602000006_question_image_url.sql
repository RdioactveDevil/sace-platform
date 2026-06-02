-- Add optional image URL to questions for diagrams, maps, reading passages, etc.
alter table questions        add column if not exists image_url text default null;
alter table draft_questions  add column if not exists image_url text default null;
