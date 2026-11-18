-- A new account's profile takes its name from Google or Apple too.
--
-- handle_new_user names the profile from the display_name the email sign-up
-- form sends. Google and Apple send the person's name as full_name or name
-- instead, so an account made with either was called "Student", and
-- onboarding (which only asks for a missing name) never asked.

set local lock_timeout = '10s';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      'Student'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
