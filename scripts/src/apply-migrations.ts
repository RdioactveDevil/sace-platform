/**
 * Migration runner for the Supabase Postgres database.
 *
 * Applies the SQL files in `supabase/migrations/` that have not yet been
 * recorded in a `schema_migrations` tracking table, in filename order, each in
 * its own transaction.
 *
 * IMPORTANT — adopting this on an already-migrated database:
 *   The existing migrations were applied by hand and some are NOT idempotent
 *   (e.g. `create policy` without a guard), so re-running them would fail. To
 *   avoid that, the runner refuses to apply anything when `schema_migrations`
 *   is empty unless you pass `--from <version>` (apply only files at/after that
 *   version) or `--baseline` (record every current file as applied, run none).
 *
 * Usage (via the workflow or locally):
 *   tsx apply-migrations.ts --dry-run
 *   tsx apply-migrations.ts --from 20260609000000      # apply the new ones
 *   tsx apply-migrations.ts --baseline                 # mark all as applied
 *
 * Connection: set SUPABASE_DB_URL to the Postgres connection string from the
 * Supabase dashboard (Project Settings → Database → Connection string → URI).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "migrations");

function parseArgs(argv: string[]) {
  const args = { dryRun: false, baseline: false, from: "" as string };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--baseline") args.baseline = true;
    else if (a === "--from") args.from = argv[++i] ?? "";
  }
  return args;
}

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function versionOf(file: string): string {
  return file.replace(/\.sql$/, "");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("::error::SUPABASE_DB_URL is not set. Add the Supabase Postgres connection string as a secret.");
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const { rows } = await client.query<{ version: string }>("select version from schema_migrations");
    const applied = new Set(rows.map((r) => r.version));
    const files = listMigrationFiles();
    const fromVersion = args.from.trim();

    // Baseline: record every current file as applied without executing any.
    if (args.baseline) {
      const toRecord = files.map(versionOf).filter((v) => !applied.has(v));
      if (args.dryRun) {
        console.log(`[dry-run] would baseline ${toRecord.length} migration(s):`);
        toRecord.forEach((v) => console.log(`  - ${v}`));
        return;
      }
      for (const v of toRecord) {
        await client.query("insert into schema_migrations (version) values ($1) on conflict do nothing", [v]);
      }
      console.log(`Baselined ${toRecord.length} migration(s) as applied (no SQL executed).`);
      return;
    }

    // Safety guard: empty tracking table + no scoping flag → refuse, to avoid
    // re-running the non-idempotent legacy migrations.
    if (applied.size === 0 && !fromVersion) {
      console.error(
        "::error::schema_migrations is empty. Re-running all legacy migrations is unsafe.\n" +
          "Pass --from <version> to apply only newer files (e.g. --from 20260609000000),\n" +
          "or --baseline to record all current files as already applied.",
      );
      process.exit(1);
    }

    const pending = files.filter((f) => {
      const v = versionOf(f);
      if (applied.has(v)) return false;
      if (fromVersion && v < fromVersion) return false;
      return true;
    });

    if (pending.length === 0) {
      console.log("Database is up to date — no pending migrations.");
      return;
    }

    console.log(`${args.dryRun ? "[dry-run] " : ""}${pending.length} pending migration(s):`);
    pending.forEach((f) => console.log(`  - ${versionOf(f)}`));
    if (args.dryRun) return;

    for (const file of pending) {
      const version = versionOf(file);
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`Applying ${version} … `);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into schema_migrations (version) values ($1)", [version]);
        await client.query("commit");
        console.log("ok");
      } catch (err) {
        await client.query("rollback").catch(() => {});
        console.log("FAILED");
        console.error(`::error::Migration ${version} failed: ${(err as Error).message}`);
        throw err;
      }
    }

    console.log(`Applied ${pending.length} migration(s) successfully.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
