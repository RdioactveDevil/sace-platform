-- Titan's short tip after a wrong answer (POST /api/answers/tip): the same
-- wrong answer to the same question always gets the same tip, so each is
-- written by AI once and kept here. `response_key` is 'mcq:<option index>'
-- for multiple choice, else a hash of the answer. Read and written by the
-- API only (service role).
create table if not exists public.answer_tips (
  question_id  text not null,
  response_key text not null,
  tip          text not null,
  created_at   timestamptz not null default now(),
  primary key (question_id, response_key)
);
alter table public.answer_tips enable row level security;
