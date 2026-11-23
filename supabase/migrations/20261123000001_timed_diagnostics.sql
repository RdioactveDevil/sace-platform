alter table public.diagnostic_assessments
  add column if not exists time_limit_minutes int,
  add column if not exists marking_started_at timestamptz,
  add column if not exists marking_attempts int not null default 0;
