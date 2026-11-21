-- Pre-call questionnaire: each tutor owns one questionnaire, and every
-- diagnostic keeps its own snapshot of the questions it was sent with.
--
--   tutor_questionnaires           a tutor's master questionnaire (intro text
--                                  and items); no row = the code's default set
--                                  (server-only: RLS on, no policies)
--   diagnostic_assessments         questionnaire (the snapshot, null = none /
--                                  legacy link), questionnaire_answers,
--                                  questionnaire_submitted_at,
--                                  questionnaire_reminded_at

set local lock_timeout = '10s';

create table if not exists public.tutor_questionnaires (
  tutor_id   uuid primary key references public.profiles (id) on delete cascade,
  intro      text not null default '',
  items      jsonb not null,
  updated_at timestamptz default now()
);
alter table public.tutor_questionnaires enable row level security;

alter table public.diagnostic_assessments
  add column if not exists questionnaire              jsonb,
  add column if not exists questionnaire_answers      jsonb,
  add column if not exists questionnaire_submitted_at timestamptz,
  add column if not exists questionnaire_reminded_at  timestamptz;
