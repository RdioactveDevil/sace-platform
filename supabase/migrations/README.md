# Database migrations

SQL files here are applied to the Supabase Postgres database by the
**"Apply database migrations"** GitHub Action (Actions tab → Run workflow),
which runs `scripts/src/apply-migrations.ts`.

Applied versions are tracked in a `schema_migrations` table, so each file runs
at most once.

## One-time setup

Add a repository secret **`SUPABASE_DB_URL`** = the Postgres connection string
from the Supabase dashboard (Project Settings → Database → Connection string →
URI, including the password).

## Applying the current pending migrations

The legacy migrations were applied by hand and some are **not** idempotent, so
the runner will not blindly re-run everything. To apply only the new files on
the already-migrated production DB:

1. Actions → **Apply database migrations** → Run workflow
2. Mode: **dry-run** first, `from` = `20260609000000` → confirm it lists only:
   - `20260609000000_question_multi_format`
   - `20260609000001_question_images_bucket`
   - `20260609000002_exam_attempts`
3. Run again with Mode: **apply**.

## Authoring new migrations

- Name files `YYYYMMDDHHMMSS_description.sql` (lexicographic = apply order).
- Make them idempotent where practical: `create table if not exists`,
  `add column if not exists`, `create or replace function`, and
  `drop policy if exists` before `create policy`.
- New files (version ≥ the last applied) are picked up automatically; just run
  the workflow in **apply** mode (no `from` needed once `schema_migrations` is
  populated).
