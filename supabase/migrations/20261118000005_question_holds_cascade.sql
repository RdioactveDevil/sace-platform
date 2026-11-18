-- A hold goes when its question is deleted.
--
-- question_holds keeps the question each student has on screen per practice
-- subject or assignment until they answer it (20261110000000_server_marking).
-- Nothing tied the hold to the question, so deleting a question from the bank
-- left holds on it. For staff, whose reads aren't limited by subject, the API
-- kept serving that missing question as the one to finish, and refused every
-- answer in that subject with "held" (the app showed "Your answer couldn't be
-- checked just now"). The API now ignores a hold whose question is gone
-- (routes/answers.ts holdStands); this removes the ones left behind and makes
-- deleting a question delete its holds.

set local lock_timeout = '10s';

delete from public.question_holds h
 where not exists (select 1 from public.questions q where q.id = h.question_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'question_holds_question_id_fkey') then
    alter table public.question_holds
      add constraint question_holds_question_id_fkey
      foreign key (question_id) references public.questions(id) on delete cascade;
  end if;
end $$;

create index if not exists question_holds_question_id_idx on public.question_holds (question_id);
