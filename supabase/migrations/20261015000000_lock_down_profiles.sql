-- Lock down student-writable profile fields.
--
-- Before this migration the `profiles_update_own` policy let a signed-in user
-- update ANY column of their own row straight from the browser, e.g.
--   supabase.from('profiles').update({ is_admin: true, xp: 999999 })
-- and `profiles_read_all` exposed every user's profile to everyone.
--
-- After it:
--   • Privileged / gamification columns can only change through SECURITY
--     DEFINER functions (award_xp, admin_set_admin, admin_approve_tutor, …) or
--     the service role used by the API. Direct client writes to them are
--     silently reverted to their old value.
--   • XP and streaks are awarded through award_xp(), which clamps each award
--     and derives the streak server-side.
--   • Users can only read their own profile row. Admin and tutor read policies
--     (admins_read_all_profiles, tutors_read_rostered_student_profiles) are
--     unchanged. The leaderboard view exposes only public columns.

-- ── 1. Guard trigger ─────────────────────────────────────────────────────────
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  -- SECURITY DEFINER functions run as their owner and the API uses
  -- service_role, so only direct PostgREST calls from end users are guarded.
  if current_user in ('authenticated', 'anon') then
    new.is_admin                 := old.is_admin;
    new.is_tutor                 := old.is_tutor;
    new.deactivated_at           := old.deactivated_at;
    new.tutor_application_status := old.tutor_application_status;
    new.xp                       := old.xp;
    new.level                    := old.level;
    new.streak                   := old.streak;
    new.best_streak              := old.best_streak;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_columns on public.profiles;
create trigger protect_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- ── 2. Server-side XP award ──────────────────────────────────────────────────
-- p_xp_earned is clamped to what one answer (or session bonus) can be worth:
-- calcXP tops out at 5 * 12 * 2.2 = 132 and a wrong answer costs at most 20.
-- The streak can only grow by one per call, and resets to 1 if the user wasn't
-- active today or yesterday (same rule the client used to apply).
create or replace function public.award_xp(p_xp_earned integer, p_new_streak integer)
returns table (xp integer, streak integer, best_streak integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_prof  public.profiles%rowtype;
  v_delta integer := greatest(-20, least(coalesce(p_xp_earned, 0), 150));
  v_streak integer;
  v_active_recently boolean;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  select * into v_prof from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'profile not found';
  end if;

  v_active_recently := v_prof.last_active is not null
    and v_prof.last_active::date >= (now() - interval '1 day')::date;

  v_streak := greatest(0, least(coalesce(p_new_streak, 0), coalesce(v_prof.streak, 0) + 1));
  if not v_active_recently and v_streak > 0 then
    v_streak := 1;
  end if;

  update public.profiles p
     set xp          = greatest(0, coalesce(p.xp, 0) + v_delta),
         streak      = v_streak,
         best_streak = greatest(coalesce(p.best_streak, 0), v_streak),
         last_active = now()
   where p.id = v_uid
  returning p.xp, p.streak, p.best_streak
       into xp, streak, best_streak;

  return next;
end;
$$;

revoke all on function public.award_xp(integer, integer) from public, anon;
grant execute on function public.award_xp(integer, integer) to authenticated;

-- ── 3. Profiles are private; leaderboard exposes public columns only ─────────
drop policy if exists "profiles_read_all" on public.profiles;
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own"
  on public.profiles
  for select
  using (auth.uid() = id);

-- The view must read every profile, so it runs as its owner (not the caller)
-- and selects only the columns that are meant to be public.
drop view if exists public.leaderboard;
create view public.leaderboard
with (security_invoker = false)
as
select
  id,
  display_name,
  school,
  xp,
  level,
  streak,
  rank() over (order by xp desc) as position
from public.profiles
where deactivated_at is null
order by xp desc;

revoke all on public.leaderboard from anon;
grant select on public.leaderboard to authenticated;
