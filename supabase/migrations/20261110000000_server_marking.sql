-- Answers are marked on the server (routes/answers.ts in the API).
--
-- Before this, the app downloaded every question with its answer key and
-- solution, marked answers in the browser and then told the database whether
-- they were right (record_answer, award_xp, record_assignment_answer and
-- inserts into exam_attempts all took the browser's word for it). Anyone who
-- opened the browser's developer tools could read the answers, or skip
-- straight to "correct".
--
-- Now:
--   * Students read questions through `questions_student`, which has no
--     answer key, solution, tip, marking scheme or advice. The answer comes
--     back from the API only once the question has been answered.
--   * `questions` itself (with the answers) is for tutors and admins.
--   * Answers, XP, assignment progress and exam attempts are written only by
--     the API (service role), which marks the answer itself first.
--   * `question_holds` remembers the question each student has on screen in
--     each subject or assignment, so reloading the page or ending the session
--     brings back the same question instead of a new one.
--
-- The mobile app (artifacts/gradefarm-mobile) still uses the old way and must
-- be moved to the API before it is released.

-- ── Questions without their answers ─────────────────────────────────────────
-- security_invoker = false: the view reads `questions` as its owner, so it can
-- serve students rows the table no longer lets them read, and its WHERE clause
-- is the same entitlement check the old read policy made.
-- Ordering questions: `items` holds the right order, so it is shuffled here
-- (the same way every time for a question). Hotspots and labelled diagrams
-- lose the fields that say which is right.
drop view if exists public.questions_student;
create view public.questions_student
with (security_invoker = false, security_barrier = true) as
select
  q.id, q.subject, q.topic, q.subtopic, q.difficulty, q.question, q.options,
  q.sace_code, q.created_at, q.concept_tag, q.graph, q.table_data, q.image_url,
  q.question_type, q.unit, q.case_sensitive, q.labels, q.diagram,
  q.curriculum_id, q.subtopic_id, q.passage_id, q.total_marks,
  q.source, q.source_kind, q.source_publisher, q.source_year, q.source_paper,
  q.source_question, q.exam_section,
  case when jsonb_typeof(q.items) = 'array' then
    (select jsonb_agg(x order by md5(q.id || x::text)) from jsonb_array_elements(q.items) x)
  end as items,
  case when jsonb_typeof(q.hotspots) = 'array' then
    (select jsonb_agg(h - 'correct' - 'label' order by ord) from jsonb_array_elements(q.hotspots) with ordinality as t(h, ord))
  end as hotspots,
  case when jsonb_typeof(q.markers) = 'array' then
    (select jsonb_agg(m - 'answer' order by ord) from jsonb_array_elements(q.markers) with ordinality as t(m, ord))
  end as markers,
  case when jsonb_typeof(q.parts) = 'array' then
    (select jsonb_agg(p - 'solution' - 'answer' - 'marking_scheme' order by ord) from jsonb_array_elements(q.parts) with ordinality as t(p, ord))
  end as parts
from public.questions q
where (select public.is_staff())
   or q.curriculum_id = any (array(select public.readable_curriculum_ids()))
   or q.subtopic_id = any (array(select public.readable_shared_subtopic_ids()));

revoke all on public.questions_student from public, anon;
grant select on public.questions_student to authenticated;

-- Extra-practice questions saved for a bank question, without their answers.
drop view if exists public.question_variants_student;
create view public.question_variants_student
with (security_invoker = false, security_barrier = true) as
select
  v.id, v.parent_question_id, v.variant_type, v.subject, v.topic, v.subtopic,
  v.concept_tag, v.difficulty, v.question, v.options, v.source, v.usage_count,
  v.last_seen_at, v.created_at
from public.question_variants v
where (select public.is_staff())
   or exists (
     select 1 from public.questions q
      where q.id = v.parent_question_id
        and (q.curriculum_id = any (array(select public.readable_curriculum_ids()))
             or q.subtopic_id = any (array(select public.readable_shared_subtopic_ids())))
   );

revoke all on public.question_variants_student from public, anon;
grant select on public.question_variants_student to authenticated;

-- The tables with the answers: tutors and admins only.
drop policy if exists questions_read_entitled on public.questions;
drop policy if exists questions_read_staff on public.questions;
create policy questions_read_staff on public.questions
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists question_variants_read_entitled on public.question_variants;
drop policy if exists question_variants_read_staff on public.question_variants;
create policy question_variants_read_staff on public.question_variants
  for select to authenticated
  using ((select public.is_staff()));

-- ── Answers, XP and exam attempts: written by the API only ──────────────────
-- Students keep reading their own history; tutors and admins keep their read
-- policies (unchanged).
drop policy if exists answers_own on public.answer_log;
drop policy if exists answer_log_read_own on public.answer_log;
create policy answer_log_read_own on public.answer_log
  for select using (auth.uid() = user_id);

drop policy if exists struggle_own on public.struggle_profiles;
drop policy if exists struggle_profiles_read_own on public.struggle_profiles;
create policy struggle_profiles_read_own on public.struggle_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "Users insert own exam attempts" on public.exam_attempts;

revoke execute on function public.record_answer(text, boolean, integer, uuid, integer) from public, anon, authenticated;
revoke execute on function public.award_xp(integer, integer, boolean) from public, anon, authenticated;
revoke execute on function public.record_assignment_answer(uuid, boolean, text, jsonb, integer) from public, anon, authenticated;

-- A legacy assignment (no question count) completes when its session ends,
-- but only once the student has answered something since it was set.
create or replace function public.complete_assignment(p_assignment_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.assignments a
     set completed_at = now()
   where a.id = p_assignment_id
     and a.student_id = auth.uid()
     and a.completed_at is null
     and a.question_count is null
     and exists (select 1 from public.answer_log l
                  where l.user_id = auth.uid() and l.answered_at >= a.created_at);
  if not found then
    raise exception 'Assignment not found or already completed';
  end if;
end;
$$;

-- One answer, for a given student: the answer log and the question's review
-- schedule (same as record_answer, which used auth.uid()).
create or replace function public.record_answer_for(
  p_user uuid, p_question_id text, p_correct boolean,
  p_selected integer default null, p_session_id uuid default null, p_time_ms integer default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_wrong integer := case when p_correct then 0 else 1 end;
  v_session uuid := p_session_id;
begin
  if p_user is null then raise exception 'no user'; end if;
  -- A session that isn't this student's is left off rather than failing the answer.
  if v_session is not null and not exists (select 1 from public.sessions where id = v_session and user_id = p_user) then
    v_session := null;
  end if;

  insert into public.answer_log (user_id, session_id, question_id, selected, correct, time_taken_ms)
  values (p_user, v_session, p_question_id, p_selected, coalesce(p_correct, false),
          case when p_time_ms between 0 and 86400000 then p_time_ms end);

  insert into public.struggle_profiles as s (user_id, question_id, attempts, wrong, last_seen, next_review)
  values (p_user, p_question_id, 1, v_wrong, now(), public.struggle_next_review(1, v_wrong))
  on conflict (user_id, question_id) do update
     set attempts    = s.attempts + 1,
         wrong       = s.wrong + v_wrong,
         last_seen   = now(),
         next_review = public.struggle_next_review(s.attempts + 1, s.wrong + v_wrong);
end;
$$;

-- XP for a given student (same as award_xp: clamped, day streak worked out here).
create or replace function public.award_xp_for(p_user uuid, p_xp_earned integer, p_correct boolean default null)
returns table (xp integer, streak integer, best_streak integer, recent_correct real, recent_answers real)
language plpgsql security definer set search_path = public as $$
declare
  v_prof  public.profiles%rowtype;
  v_delta integer := greatest(-60, least(coalesce(p_xp_earned, 0), 150));
  v_today date := (now() at time zone 'Australia/Adelaide')::date;
  v_last  date;
  v_streak integer;
  v_decay real := case when p_correct is null then 1 else 0.995 end;
begin
  select * into v_prof from public.profiles where id = p_user for update;
  if not found then raise exception 'profile not found'; end if;

  v_last := (v_prof.last_active at time zone 'Australia/Adelaide')::date;
  v_streak := case
    when v_last = v_today     then greatest(coalesce(v_prof.streak, 0), 1)
    when v_last = v_today - 1 then coalesce(v_prof.streak, 0) + 1
    else 1
  end;

  update public.profiles p
     set xp             = greatest(0, coalesce(p.xp, 0) + v_delta),
         streak         = v_streak,
         best_streak    = greatest(coalesce(p.best_streak, 0), v_streak),
         last_active    = now(),
         recent_correct = p.recent_correct * v_decay + (case when p_correct then 1 else 0 end),
         recent_answers = p.recent_answers * v_decay + (case when p_correct is null then 0 else 1 end)
   where p.id = p_user
  returning p.xp, p.streak, p.best_streak, p.recent_correct, p.recent_answers
       into xp, streak, best_streak, recent_correct, recent_answers;
  return next;
end;
$$;

-- One answer toward an assignment, for a given student. The API has already
-- checked the question belongs to the assignment and marked it. A question
-- already answered in this assignment isn't counted again (`counted` false),
-- so the same question can't be answered twice toward the goal.
create or replace function public.record_assignment_answer_for(
  p_user uuid, p_assignment_id uuid, p_correct boolean, p_question_id text,
  p_response jsonb default null, p_time_ms integer default null
) returns table (counted boolean, progress_count integer, question_count integer, min_accuracy integer,
                 pass_mode text, recent_results boolean[], passed boolean, completed_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count    integer;
  v_min      integer;
  v_mode     text;
  v_progress integer;
  v_recent   boolean[];
  v_correct  integer;
  v_meets    boolean;
  v_done     boolean;
begin
  select a.question_count, a.min_accuracy, a.pass_mode, a.progress_count, a.recent_results
    into v_count, v_min, v_mode, v_progress, v_recent
    from public.assignments a
   where a.id = p_assignment_id
     and a.student_id = p_user
     and a.question_count is not null
     and a.completed_at is null
   for update;
  if not found then
    return;
  end if;

  if exists (select 1 from public.assignment_answers aa
              where aa.assignment_id = p_assignment_id and aa.question_id = p_question_id) then
    return query
      select false, a.progress_count, a.question_count, a.min_accuracy, a.pass_mode, a.recent_results, a.passed, a.completed_at
        from public.assignments a where a.id = p_assignment_id;
    return;
  end if;

  insert into public.assignment_answers (assignment_id, student_id, question_id, correct, response, time_taken_ms)
  values (p_assignment_id, p_user, p_question_id, coalesce(p_correct, false), p_response,
          case when p_time_ms between 0 and 86400000 then p_time_ms end);

  v_progress := least(coalesce(v_progress, 0) + 1, v_count);
  v_recent   := coalesce(v_recent, '{}') || coalesce(p_correct, false);
  if cardinality(v_recent) > v_count then
    v_recent := v_recent[cardinality(v_recent) - v_count + 1 : cardinality(v_recent)];
  end if;
  select count(*) filter (where r) into v_correct from unnest(v_recent) as r;
  v_meets := v_min is null or v_correct * 100 >= v_min * cardinality(v_recent);
  v_done  := v_progress >= v_count and (v_meets or v_mode = 'one_attempt');

  return query
  update public.assignments a
     set progress_count = v_progress,
         recent_results = v_recent,
         completed_at   = case when v_done then now() end,
         passed         = case when v_done and v_min is not null then v_meets end
   where a.id = p_assignment_id
  returning true, a.progress_count, a.question_count, a.min_accuracy, a.pass_mode, a.recent_results, a.passed, a.completed_at;
end;
$$;

revoke execute on function public.record_answer_for(uuid, text, boolean, integer, uuid, integer) from public, anon, authenticated;
revoke execute on function public.award_xp_for(uuid, integer, boolean) from public, anon, authenticated;
revoke execute on function public.record_assignment_answer_for(uuid, uuid, boolean, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.record_answer_for(uuid, text, boolean, integer, uuid, integer) to service_role;
grant execute on function public.award_xp_for(uuid, integer, boolean) to service_role;
grant execute on function public.record_assignment_answer_for(uuid, uuid, boolean, text, jsonb, integer) to service_role;

-- Which of these questions a student may answer (the API's access check for
-- several questions at once; same rule as user_can_read_question).
create or replace function public.readable_question_ids_for(p_user uuid, p_ids text[])
returns setof text
language sql stable security definer set search_path = public as $$
  with readable as (
    select c.id
      from public.curricula c
      join public.user_subscriptions s
        on s.user_id = p_user
       and s.active
       and s.subject_name = c.name
       and (coalesce(s.stage, '') = '' or coalesce(trim(c.level_label), '') in ('', s.stage))
  )
  select q.id
    from public.questions q
   where q.id = any (p_ids)
     and (
       exists (select 1 from public.profiles p where p.id = p_user and (p.is_admin or p.is_tutor))
       or q.curriculum_id in (select id from readable)
       or q.subtopic_id in (
         select l.source_subtopic_id
           from public.subtopic_links l
           join public.curriculum_subtopics st on st.id = l.subtopic_id
          where st.curriculum_id in (select id from readable)
       )
     )
$$;
revoke execute on function public.readable_question_ids_for(uuid, text[]) from public, anon, authenticated;
grant execute on function public.readable_question_ids_for(uuid, text[]) to service_role;

-- ── The question on screen ──────────────────────────────────────────────────
-- One row per student per context ('practice:<subject>' or
-- 'assignment:<id>'): the question they were shown and haven't answered. The
-- API serves it again until it's answered, so a reload can't swap it.
create table if not exists public.question_holds (
  user_id     uuid not null references auth.users(id) on delete cascade,
  context     text not null,
  question_id text not null,
  shown_at    timestamptz not null default now(),
  primary key (user_id, context)
);
alter table public.question_holds enable row level security;
-- No policies: only the API (service role) reads and writes holds.

-- Extra-practice completion bonus: once per missed question per day.
create table if not exists public.remediation_bonuses (
  user_id            uuid not null references auth.users(id) on delete cascade,
  parent_question_id text not null,
  day                date not null default ((now() at time zone 'Australia/Adelaide')::date),
  awarded_at         timestamptz not null default now(),
  primary key (user_id, parent_question_id, day)
);
alter table public.remediation_bonuses enable row level security;
