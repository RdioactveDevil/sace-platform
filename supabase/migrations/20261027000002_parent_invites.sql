-- Tutor invites can go to a parent instead of the student.
--
-- A young student often has no email of their own. The tutor can now send the
-- invite to a parent or guardian, naming the child: the parent sets up the
-- account under their own email (account_holder = 'parent', as on the parent
-- sign-up), and accepting it puts that account on the tutor's roster.
--
--   recipient   'student' (the default, as before) or 'parent'
--   child_name  the child's first name, for a parent invite

set local lock_timeout = '10s';

alter table public.tutor_invites
  add column if not exists recipient  text not null default 'student',
  add column if not exists child_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tutor_invites_recipient_check') then
    alter table public.tutor_invites
      add constraint tutor_invites_recipient_check check (recipient in ('student', 'parent'));
  end if;
end $$;
