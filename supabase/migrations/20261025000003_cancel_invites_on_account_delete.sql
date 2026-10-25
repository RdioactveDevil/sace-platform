-- Deleting a student account cancels the tutor invites still waiting for its
-- email address.
--
-- Invites are addressed to an email, not an account (a student can be invited
-- before they sign up). Without this, an invite that was never accepted
-- outlived the account it was meant for, and a new account later created
-- with the same address could accept it.
--
-- A trigger on auth.users, so it applies however the account goes: the
-- account page, the admin panel, or the Supabase dashboard.

create or replace function public.cancel_invites_for_deleted_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.email is not null then
    update public.tutor_invites
       set status = 'cancelled', responded_at = now()
     where email = lower(old.email)
       and status = 'pending';
  end if;
  return old;
end;
$$;

revoke all on function public.cancel_invites_for_deleted_account() from public, anon, authenticated;

drop trigger if exists cancel_invites_for_deleted_account on auth.users;
create trigger cancel_invites_for_deleted_account
  after delete on auth.users
  for each row execute function public.cancel_invites_for_deleted_account();
