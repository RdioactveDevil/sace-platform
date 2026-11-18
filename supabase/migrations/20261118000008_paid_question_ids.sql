-- Worked solutions for past and trial paper questions are for paid subjects.
--
-- paid_question_ids_for(user, ids): the ids among `ids` the user can read
-- through a subscription other than their free subject (stripe, admin, beta or
-- tutor-included). The same rules as readable_question_ids_for (migration
-- 20261110000000_server_marking.sql) without the free subject and without the
-- staff shortcut, which the API checks itself. Used by POST /answers/solutions.

create or replace function public.paid_question_ids_for(p_user uuid, p_ids text[])
returns setof text
language sql stable security definer set search_path = public as $$
  with paid as (
    select c.id
      from public.curricula c
      join public.user_subscriptions s
        on s.user_id = p_user
       and s.active
       and s.source <> 'free'
       and s.subject_name = c.name
       and (coalesce(s.stage, '') = '' or coalesce(trim(c.level_label), '') in ('', s.stage))
  )
  select q.id
    from public.questions q
   where q.id = any (p_ids)
     and (
       q.curriculum_id in (select id from paid)
       or q.subtopic_id in (
         select l.source_subtopic_id
           from public.subtopic_links l
           join public.curriculum_subtopics st on st.id = l.subtopic_id
          where st.curriculum_id in (select id from paid)
       )
     )
$$;
revoke execute on function public.paid_question_ids_for(uuid, text[]) from public, anon, authenticated;
grant execute on function public.paid_question_ids_for(uuid, text[]) to service_role;
