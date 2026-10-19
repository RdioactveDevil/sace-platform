-- 1. Question data follows subject access.
--
-- Until now every signed-in user (and anon) could read the whole question
-- bank straight from the database, whatever the app showed them. Students may
-- now read questions, passages and question variants only for curricula they
-- have an active user_subscriptions row for (paid, granted, beta or their free
-- subject); tutors and admins read everything. The API uses the service role
-- and is unaffected.
--
-- A row covers a curriculum the same way the app's subscriptionCoversSubject()
-- does: same subject name, and the same stage (or no stage on the row).

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and (is_admin or is_tutor))
$$;

create or replace function public.readable_curriculum_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.id
  from curricula c
  join user_subscriptions s
    on s.user_id = auth.uid()
   and s.active
   and s.subject_name = c.name
   and (coalesce(s.stage, '') = '' or coalesce(trim(c.level_label), '') in ('', s.stage))
$$;

revoke all on function public.readable_curriculum_ids() from public, anon;
grant execute on function public.readable_curriculum_ids() to authenticated;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- `(select …)` / `array(select …)` run once per query, not once per row.
drop policy if exists questions_read_all on public.questions;
create policy questions_read_entitled on public.questions
  for select to authenticated
  using ((select public.is_staff()) or curriculum_id = any (array(select public.readable_curriculum_ids())));

drop policy if exists passages_read_all on public.passages;
create policy passages_read_entitled on public.passages
  for select to authenticated
  using ((select public.is_staff()) or curriculum_id = any (array(select public.readable_curriculum_ids())));

-- Variants follow their parent question (the subquery is itself filtered by
-- the questions policy above).
drop policy if exists question_variants_read_all on public.question_variants;
create policy question_variants_read_entitled on public.question_variants
  for select to authenticated
  using ((select public.is_staff()) or exists (select 1 from public.questions q where q.id = parent_question_id));

drop policy if exists question_variants_update_authenticated on public.question_variants;
create policy question_variants_update_entitled on public.question_variants
  for update to authenticated
  using ((select public.is_staff()) or exists (select 1 from public.questions q where q.id = parent_question_id));

-- 2. Daily AI usage.
--
-- Counted by the API (service role) before each /api/chat call:
--   chat_messages – messages a student sends to Titan AI. Capped for students
--                   with no paid/granted/beta subject (pricing.free_daily_ai_messages).
--   calls         – every AI call (also quiz tips, lesson openers, …). A hidden
--                   safety cap so the endpoint can't be used as a free AI proxy.
-- Tutors and admins are not limited.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  chat_messages integer not null default 0,
  calls integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
create policy "Users read own AI usage" on public.ai_usage for select using (auth.uid() = user_id);

-- The caller's limits: { chat_limit, call_limit } (null = unlimited).
create or replace function public.ai_limits(p_user uuid) returns json
language sql stable security definer set search_path = public as $$
  with tier as (
    select
      exists (select 1 from profiles where id = p_user and (is_admin or is_tutor)) as staff,
      exists (select 1 from user_subscriptions where user_id = p_user and active and source <> 'free') as paid,
      coalesce((select (value ->> 'free_daily_ai_messages')::integer from platform_settings where key = 'pricing'), 10) as free_chat
  )
  select case
    when staff then json_build_object('chat_limit', null, 'call_limit', null)
    when paid then json_build_object('chat_limit', null, 'call_limit', 400)
    else json_build_object('chat_limit', free_chat, 'call_limit', 80)
  end
  from tier
$$;

-- Count one AI call (and one chat message when p_chat) for p_user if it fits
-- their limits. Returns { allowed, chat_used, chat_limit, limit_hit }.
create or replace function public.use_ai_quota(p_user uuid, p_chat boolean) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  lim json := ai_limits(p_user);
  chat_lim integer := (lim ->> 'chat_limit')::integer;
  call_lim integer := (lim ->> 'call_limit')::integer;
  today date := (now() at time zone 'Australia/Adelaide')::date;
  chat_inc integer := case when p_chat then 1 else 0 end;
  r ai_usage;
begin
  insert into ai_usage as u (user_id, day, chat_messages, calls) values (p_user, today, 0, 0)
    on conflict (user_id, day) do nothing;
  update ai_usage as u set chat_messages = u.chat_messages + chat_inc, calls = u.calls + 1
    where u.user_id = p_user and u.day = today
      and (call_lim is null or u.calls < call_lim)
      and (not p_chat or chat_lim is null or u.chat_messages < chat_lim)
    returning * into r;
  if r.user_id is not null then
    return json_build_object('allowed', true, 'chat_used', r.chat_messages, 'chat_limit', chat_lim);
  end if;
  select * into r from ai_usage where user_id = p_user and day = today;
  return json_build_object(
    'allowed', false,
    'chat_used', r.chat_messages,
    'chat_limit', chat_lim,
    'limit_hit', case when p_chat and chat_lim is not null and r.chat_messages >= chat_lim then 'chat' else 'calls' end);
end
$$;

-- What the app shows: { chat_used, chat_limit } for the caller today.
create or replace function public.ai_chat_usage_today() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'chat_used', coalesce((select chat_messages from ai_usage
                           where user_id = auth.uid() and day = (now() at time zone 'Australia/Adelaide')::date), 0),
    'chat_limit', (ai_limits(auth.uid()) ->> 'chat_limit')::integer)
$$;

revoke all on function public.use_ai_quota(uuid, boolean) from public, anon, authenticated;
revoke all on function public.ai_limits(uuid) from public, anon, authenticated;
grant execute on function public.use_ai_quota(uuid, boolean) to service_role;
grant execute on function public.ai_limits(uuid) to service_role;
revoke all on function public.ai_chat_usage_today() from public, anon;
grant execute on function public.ai_chat_usage_today() to authenticated;

update public.platform_settings
  set value = value || '{"free_daily_ai_messages": 10}'::jsonb
  where key = 'pricing' and not (value ? 'free_daily_ai_messages');
