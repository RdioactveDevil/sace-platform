-- Sound effects on or off (Account > Preferences), kept on the account so it
-- follows the student to every device. On by default. Users update their own
-- row (existing profiles policies).
alter table public.profiles
  add column if not exists sounds_enabled boolean not null default true;
