/**
 * One-shot backfill: merge legacy Year 10 Maths variants into the unified
 * `Year 10 Mathematics` subject.
 *
 * Updates rows where `subject` (or `subject_name`) is one of:
 *   - 'Victorian Year 10 Mathematics'
 *   - 'Victorian Year 10A Mathematics'
 * to the canonical 'Year 10 Mathematics'.
 *
 * Tables touched:
 *   - questions          (subject)
 *   - draft_questions    (subject)
 *   - sessions           (subject)
 *   - user_subscriptions (subject_name; also normalises stage to 'Year 10')
 *   - study_plan_items   (subject)
 *   - assignments        (subject)
 *   - struggle_profiles  (subject)
 *   - answer_log         (subject, if present)
 *   - assessments        (subject, if present)
 *
 * This script is intentionally **not run as part of the merge implementation
 * task**. Run it manually once, after deploying the code changes:
 *
 *   SUPABASE_SERVICE_KEY=... \
 *     pnpm --filter @workspace/scripts exec tsx ./src/backfill-y10-maths-merge.ts
 *
 * It is idempotent — re-running it after a successful run is a no-op because
 * no rows will match the legacy subject names anymore.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("Neither SUPABASE_SERVICE_KEY nor SUPABASE_SERVICE_ROLE_KEY is set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const LEGACY_SUBJECTS = [
  "Victorian Year 10 Mathematics",
  "Victorian Year 10A Mathematics",
];
const CANONICAL_SUBJECT = "Year 10 Mathematics";
const CANONICAL_STAGE = "Year 10";

async function backfillSubjectColumn(table: string, column: string) {
  const { data, error } = await supabase
    .from(table)
    .update({ [column]: CANONICAL_SUBJECT })
    .in(column, LEGACY_SUBJECTS)
    .select(column);
  if (error) {
    console.log(`  [WARN] ${table}.${column}: ${error.message}`);
    return;
  }
  console.log(`  [OK]   ${table}.${column}: updated ${data?.length ?? 0} row(s)`);
}

async function backfillSubscriptions() {
  // user_subscriptions stores `subject_name` = the SubjectPicker tile's
  // display name (`subj.name`), NOT the canonical questions.subject string.
  // Legacy mapping:
  //   vic_maths_y10  -> { subject_name: 'Mathematics',         stage: 'Year 10' }  (already matches new tile, no change needed)
  //   vic_maths_y10a -> { subject_name: 'Mathematics (10A)',   stage: 'Year 10' }  (must become 'Mathematics')
  //
  // Some older / admin-created rows may also use the canonical
  // questions.subject strings as subject_name; cover those too.
  const { data: a, error: ea } = await supabase
    .from("user_subscriptions")
    .update({ subject_name: "Mathematics", stage: CANONICAL_STAGE })
    .eq("subject_name", "Mathematics (10A)")
    .eq("stage", "Year 10")
    .select("id");
  if (ea) {
    console.log(`  [WARN] user_subscriptions (Mathematics (10A)): ${ea.message}`);
  } else {
    console.log(`  [OK]   user_subscriptions (Mathematics (10A) -> Mathematics): updated ${a?.length ?? 0} row(s)`);
  }

  const { data: b, error: eb } = await supabase
    .from("user_subscriptions")
    .update({ subject_name: "Mathematics", stage: CANONICAL_STAGE })
    .in("subject_name", LEGACY_SUBJECTS)
    .select("id");
  if (eb) {
    console.log(`  [WARN] user_subscriptions (legacy canonical names): ${eb.message}`);
  } else {
    console.log(`  [OK]   user_subscriptions (legacy canonical -> Mathematics): updated ${b?.length ?? 0} row(s)`);
  }
}

console.log("=== Backfilling Year 10 Maths merge ===");

await backfillSubjectColumn("questions", "subject");
await backfillSubjectColumn("draft_questions", "subject");
await backfillSubjectColumn("sessions", "subject");
await backfillSubscriptions();
await backfillSubjectColumn("study_plan_items", "subject");
await backfillSubjectColumn("assignments", "subject");
await backfillSubjectColumn("struggle_profiles", "subject");
await backfillSubjectColumn("answer_log", "subject");
await backfillSubjectColumn("assessments", "subject");

console.log("\n=== Backfill complete ===");
