-- Which state a student studies in, so the subject picker can leave out the
-- other board's subjects (SACE for Victorians, VCE for South Australians).
-- Asked during onboarding and editable in Account; null for accounts made
-- before this, which then see every board. Users update their own row
-- (existing profiles policies).
alter table public.profiles
  add column if not exists state text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_state_check') then
    alter table public.profiles
      add constraint profiles_state_check
      check (state is null or state in ('VIC', 'SA', 'NSW', 'QLD', 'WA', 'TAS', 'ACT', 'NT', 'INTL'));
  end if;
end $$;
