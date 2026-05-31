/**
 * Supabase table audit + interactive cleanup script.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<your-key> node scripts/supabase-audit.mjs
 *
 * Or set the key inline:
 *   node scripts/supabase-audit.mjs --key eyJ...
 *
 * Flags:
 *   --drop-empty     Drop all zero-row tables that are NOT in the known-good list (asks confirmation first)
 *   --yes            Skip confirmation prompt (use with care)
 */

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "readline";

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

const args = process.argv.slice(2);
const keyArg = args.indexOf("--key");
const SERVICE_KEY =
  keyArg !== -1
    ? args[keyArg + 1]
    : process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("ERROR: set SUPABASE_SERVICE_KEY env var or pass --key <value>");
  process.exit(1);
}

const DROP_EMPTY = args.includes("--drop-empty");
const AUTO_YES = args.includes("--yes");

// All tables the application code actively references
const KNOWN_TABLES = new Set([
  "profiles",
  "questions",
  "draft_questions",
  "question_variants",
  "question_flags",
  "curricula",
  "curriculum_topics",
  "curriculum_subtopics",
  "user_subscriptions",
  "answer_log",
  "struggle_profiles",
  "study_plan_items",
  "sessions",
  "session_participants",
  "session_series",
  "series_participants",
  "tutor_classes",
  "tutor_class_members",
  "tutor_students",
  "tutoring_sessions",
  "assignments",
  "assessments",
  "diagnostic_assessments",
  "off_topic_attempts",
  "writing_attempts",
  "leaderboard",
]);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function getTableNames() {
  const { data, error } = await supabase.rpc("get_tables");
  if (!error) return data.map((r) => r.table_name);

  // Fallback: query information_schema directly via PostgREST
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/information_schema.tables?table_schema=eq.public&select=table_name`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to list tables: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows.map((r) => r.table_name);
}

async function countRows(table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) return null; // permission denied or doesn't exist
  return count;
}

async function dropTable(table) {
  const { error } = await supabase.rpc("exec_sql", {
    sql: `DROP TABLE IF EXISTS public."${table}" CASCADE;`,
  });
  if (error) {
    // Try raw fetch if rpc not available
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql: `DROP TABLE IF EXISTS public."${table}" CASCADE;` }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Could not drop ${table}: ${txt}`);
    }
  }
}

async function prompt(question) {
  if (AUTO_YES) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question + " [y/N] ", (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === "y");
    });
  });
}

async function main() {
  console.log(`\nConnecting to ${SUPABASE_URL}...\n`);

  let tables;
  try {
    tables = await getTableNames();
  } catch (e) {
    // Last resort: try known Supabase system way
    console.error("Could not auto-list tables:", e.message);
    console.error(
      "Try running this SQL in Supabase SQL Editor instead:\n\n" +
        "SELECT table_name, pg_size_pretty(pg_total_relation_size('public.'||table_name)) AS size\n" +
        "FROM information_schema.tables\n" +
        "WHERE table_schema = 'public'\n" +
        "ORDER BY pg_total_relation_size('public.'||table_name) DESC;\n"
    );
    process.exit(1);
  }

  console.log(`Found ${tables.length} tables. Counting rows (this may take a moment)...\n`);

  const results = await Promise.all(
    tables.map(async (t) => {
      const count = await countRows(t);
      return { table: t, count, known: KNOWN_TABLES.has(t) };
    })
  );

  results.sort((a, b) => {
    if (a.known !== b.known) return a.known ? -1 : 1;
    return (b.count ?? -1) - (a.count ?? -1);
  });

  console.log("=".repeat(60));
  console.log(
    "TABLE".padEnd(35) + "ROWS".padEnd(10) + "STATUS"
  );
  console.log("=".repeat(60));

  const unknown = [];
  for (const { table, count, known } of results) {
    const rowStr = count === null ? "???" : String(count);
    const status = known ? "✓ in use" : count === 0 ? "✗ UNKNOWN (empty)" : "⚠ UNKNOWN (has data!)";
    console.log(table.padEnd(35) + rowStr.padEnd(10) + status);
    if (!known) unknown.push({ table, count });
  }

  console.log("=".repeat(60));
  console.log(`\n${unknown.length} unknown tables (not referenced by any app code):`);

  const emptyUnknown = unknown.filter((u) => u.count === 0);
  const dataUnknown = unknown.filter((u) => u.count > 0);

  if (dataUnknown.length > 0) {
    console.log("\n⚠  These unknown tables HAVE DATA — review before deleting:");
    for (const { table, count } of dataUnknown) {
      console.log(`   ${table} (${count} rows)`);
    }
  }

  if (emptyUnknown.length > 0) {
    console.log("\n🗑  These unknown tables are EMPTY and safe to drop:");
    for (const { table } of emptyUnknown) {
      console.log(`   ${table}`);
    }
  }

  if (DROP_EMPTY && emptyUnknown.length > 0) {
    console.log();
    const ok = await prompt(
      `Drop ${emptyUnknown.length} empty unknown table(s)? This cannot be undone.`
    );
    if (ok) {
      for (const { table } of emptyUnknown) {
        try {
          await dropTable(table);
          console.log(`  ✓ dropped ${table}`);
        } catch (e) {
          console.error(`  ✗ failed to drop ${table}: ${e.message}`);
        }
      }
    } else {
      console.log("Skipped.");
    }
  } else if (emptyUnknown.length > 0 && !DROP_EMPTY) {
    console.log(
      "\nRe-run with --drop-empty to remove the empty unknown tables."
    );
  }

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
