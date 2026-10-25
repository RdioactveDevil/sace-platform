-- Remediation questions are written to the shared bank by the server only.
--
-- Students' browsers used to insert AI-generated remediation questions into
-- question_variants themselves, and could update any variant row (question
-- text and answer key included) through the policy that let them bump
-- usage_count. Those rows are served to every student. Their inserts into
-- `questions` already failed (admin only), so nothing they generated reached
-- the main bank.
--
-- The API now generates them (POST /api/remediation/variants), checks their
-- answer keys and saves the ones that pass to both tables with the service
-- role (POST /api/remediation/store). After this migration:
--   • students can no longer insert or update question_variants; staff can
--     still update them (the server's service role bypasses RLS).
--   • bump_variant_usage() counts a served variant (the only write the app
--     still needs).
--   • user_can_read_question() lets the API check a student may see the
--     question they're asking for similar questions to.
--
-- Apply after deploying the app that calls the new endpoints: the old app
-- writes these rows from the browser, which this stops.

drop policy if exists question_variants_insert_authenticated on public.question_variants;
drop policy if exists question_variants_update_entitled on public.question_variants;
drop policy if exists question_variants_update_staff on public.question_variants;
create policy question_variants_update_staff on public.question_variants
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create or replace function public.bump_variant_usage(p_variant_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.question_variants
     set usage_count = usage_count + 1,
         last_seen_at = now()
   where id = p_variant_id
     and auth.uid() is not null
$$;

revoke all on function public.bump_variant_usage(uuid) from public, anon;
grant execute on function public.bump_variant_usage(uuid) to authenticated;

-- Same rule as the questions_read_entitled policy (is_staff() or a curriculum
-- in readable_curriculum_ids()), for a given user rather than auth.uid(),
-- because the API calls it with the service role.
create or replace function public.user_can_read_question(p_user uuid, p_question_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.questions q
     where q.id = p_question_id
       and (
         exists (select 1 from public.profiles p where p.id = p_user and (p.is_admin or p.is_tutor))
         or q.curriculum_id in (
           select c.id
             from public.curricula c
             join public.user_subscriptions s
               on s.user_id = p_user
              and s.active
              and s.subject_name = c.name
              and (coalesce(s.stage, '') = '' or coalesce(trim(c.level_label), '') in ('', s.stage))
         )
       )
  )
$$;

revoke all on function public.user_can_read_question(uuid, text) from public, anon, authenticated;
grant execute on function public.user_can_read_question(uuid, text) to service_role;
