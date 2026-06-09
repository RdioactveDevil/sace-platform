-- Persisted exam-simulator attempts, powering predicted-score + percentile analytics.

create table if not exists exam_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  track_id        text not null,
  title           text,
  total_correct   integer not null default 0,
  total_questions integer not null default 0,
  percent         integer not null default 0,
  per_section     jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists exam_attempts_user_idx  on exam_attempts (user_id, created_at desc);
create index if not exists exam_attempts_track_idx on exam_attempts (track_id);

alter table exam_attempts enable row level security;

-- Students can read and create their own attempts.
create policy "Users read own exam attempts" on exam_attempts
  for select to authenticated
  using (user_id = auth.uid());

create policy "Users insert own exam attempts" on exam_attempts
  for insert to authenticated
  with check (user_id = auth.uid());

-- Anonymous, aggregate percentile for a track WITHOUT exposing other users' rows.
-- Returns how the given score compares against all attempts for the track.
create or replace function exam_track_percentile(p_track_id text, p_percent integer)
returns table (attempts bigint, average numeric, percentile integer)
language sql
security definer
set search_path = public
as $$
  select
    count(*)                                            as attempts,
    round(coalesce(avg(percent), 0))                    as average,
    case when count(*) = 0 then null
         else round(100.0 * sum(case when percent <= p_percent then 1 else 0 end) / count(*))
    end::integer                                        as percentile
  from exam_attempts
  where track_id = p_track_id;
$$;

grant execute on function exam_track_percentile(text, integer) to authenticated, anon;
