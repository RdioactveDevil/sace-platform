-- Admin → People → Sign out everywhere.
--
-- Ends every session a user has, so each device has to sign in again (their
-- current access token runs out within the hour). The same as a user's own
-- "sign out everywhere", for an admin helping with a lost phone or a shared
-- login. Called by the API (service role) only.

create or replace function public.admin_sign_out_user(p_user uuid)
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  ended integer;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics ended = row_count;
  -- Refresh tokens not tied to a session (older sign-ins) go too.
  delete from auth.refresh_tokens where user_id = p_user::text;
  return ended;
end
$$;

revoke all on function public.admin_sign_out_user(uuid) from public, anon, authenticated;
grant execute on function public.admin_sign_out_user(uuid) to service_role;
