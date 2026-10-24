-- schema_migrations is created by the migration runner in the public schema,
-- which PostgREST exposes. It had RLS off and the default anon/authenticated
-- grants, so anyone holding the public anon key could insert, delete or
-- truncate rows and make the runner skip or re-run migrations.
--
-- The runner connects as the database owner, which bypasses RLS and these
-- grants, so it is unaffected.

alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;
