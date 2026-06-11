-- Soft-delete (deactivation) support for accounts. When set, the account is
-- blocked from signing in (also banned at the auth layer) but all data is kept,
-- so an admin can reactivate it later. NULL means the account is active.

alter table public.profiles
  add column if not exists deactivated_at timestamptz;
