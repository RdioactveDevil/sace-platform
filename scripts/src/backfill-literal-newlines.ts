/**
 * One-time backfill: replace literal backslash-n ("...\n\nWhich rule...") with
 * real line breaks in stored questions, drafts and passages.
 *
 * #136 fixed the cause in generation and already repairs these at render time,
 * so students see clean text either way; this cleans the stored data so admin
 * screens that show raw text (e.g. the question editor) are clean too.
 *
 * Dry-run by default — lists every row that WOULD change, with before/after.
 * Pass --apply to write.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<k> pnpm --filter @workspace/scripts run backfill:literal-newlines              # dry run
 *   SUPABASE_SERVICE_KEY=<k> pnpm --filter @workspace/scripts run backfill:literal-newlines -- --apply   # write
 *   ... -- --key eyJ... --apply
 */

import { createClient } from "@supabase/supabase-js";
import { restoreLiteralNewlines } from "./lib/literal-newlines";

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

const args = process.argv.slice(2);
const keyArg = args.indexOf("--key");
const SERVICE_KEY =
  keyArg !== -1
    ? args[keyArg + 1]
    : process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = args.includes("--apply");

if (!SERVICE_KEY) {
  console.error("ERROR: set SUPABASE_SERVICE_KEY env var or pass --key <value>");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Text columns per table. `options` is an array (or a JSON-encoded array).
const TABLES: Record<string, string[]> = {
  questions: ["question", "options", "solution", "tip"],
  draft_questions: ["question", "options", "solution"],
  passages: ["title", "body"],
};

const PAGE = 1000;

type Row = Record<string, unknown> & { id: string };

function fixOptions(value: unknown): unknown {
  if (Array.isArray(value)) {
    const fixed = value.map((o) => (typeof o === "string" ? restoreLiteralNewlines(o) : o));
    return fixed.some((o, i) => o !== value[i]) ? fixed : value;
  }
  if (typeof value === "string") {
    // Some rows store options as a JSON string; keep that format.
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return value;
      const fixed = fixOptions(parsed);
      return fixed === parsed ? value : JSON.stringify(fixed);
    } catch {
      return value;
    }
  }
  return value;
}

function patchFor(row: Row, columns: string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const col of columns) {
    const before = row[col];
    const after = col === "options"
      ? fixOptions(before)
      : typeof before === "string" ? restoreLiteralNewlines(before) : before;
    if (after !== before) patch[col] = after;
  }
  return patch;
}

const show = (v: unknown) => JSON.stringify(v);

async function backfillTable(table: string, columns: string[]): Promise<void> {
  console.log(`\n=== ${table} ===`);
  let from = 0;
  let scanned = 0;
  let changedCount = 0;
  let updatedCount = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(["id", ...columns].join(", "))
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`  error reading ${table}: ${error.message}`);
      return;
    }
    const rows = (data ?? []) as unknown as Row[];
    if (!rows.length) break;

    for (const row of rows) {
      scanned++;
      const patch = patchFor(row, columns);
      if (!Object.keys(patch).length) continue;
      changedCount++;

      console.log(`  [${row.id}]`);
      for (const [col, after] of Object.entries(patch)) {
        console.log(`    ${col}:\n      before ${show(row[col])}\n      after  ${show(after)}`);
      }

      if (APPLY) {
        const { error: upErr } = await supabase.from(table).update(patch).eq("id", row.id);
        if (upErr) console.error(`    ✗ update ${row.id}: ${upErr.message}`);
        else updatedCount++;
      }
    }

    if (rows.length < PAGE) break;
    from += PAGE;
  }

  console.log(
    `  scanned ${scanned}, would change ${changedCount}` +
      (APPLY ? `, updated ${updatedCount}` : " (dry run — re-run with --apply to write)"),
  );
}

async function main() {
  console.log(`Connecting to ${SUPABASE_URL} — ${APPLY ? "APPLY (writing)" : "DRY RUN"}`);
  for (const [table, columns] of Object.entries(TABLES)) {
    await backfillTable(table, columns);
  }
  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
