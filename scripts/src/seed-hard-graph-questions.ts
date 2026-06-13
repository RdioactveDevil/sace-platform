/**
 * Seed script: top up the live question bank with HARD (difficulty 4–5) and
 * graph/diagram questions for managed subjects, so adaptive sessions have
 * exam-level material to surface immediately instead of waiting for the
 * on-demand top-up to generate it.
 *
 * How it works:
 *   1. Reads the managed curricula straight from the DB and rebuilds the exact
 *      T{n}.{m} topic codes the generator expects (topics and subtopics ordered
 *      by order_index, 1-based) — no hardcoded codes that can drift from the
 *      curriculum.
 *   2. For each subtopic, calls the running API server's generate-questions
 *      endpoint with difficulty 4 (→ "difficulty 4–5"), includeGraphs and
 *      includeDiagrams on, and autoApprove so verified questions land directly
 *      in the live `questions` table.
 *   3. Idempotent: skips any subtopic that already has enough hard questions.
 *
 * Requirements:
 *   - The API server must be running and reachable at API_BASE (default
 *     http://localhost:8080) and configured with an Anthropic API key.
 *   - SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx ./src/seed-hard-graph-questions.ts
 *
 * Optional env knobs:
 *   SUBJECTS       comma-separated curriculum names to seed (default: all managed)
 *                  e.g. SUBJECTS="Year 10 Mathematics,Chemistry Stage 2"
 *   DIFFICULTY     target difficulty 1–5 (default 4)
 *   PER_SUBTOPIC   questions to request per subtopic (default 3)
 *   MIN_EXISTING   skip a subtopic that already has this many hard questions (default 3)
 *   API_BASE       API server base URL (default http://localhost:8080)
 *   DRY_RUN        if set, list what would be generated without calling the API
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = process.env.API_BASE || "http://localhost:8080";
const DIFFICULTY = Number(process.env.DIFFICULTY || 4);
const PER_SUBTOPIC = Number(process.env.PER_SUBTOPIC || 3);
const MIN_EXISTING = Number(process.env.MIN_EXISTING || 3);
const HARD_THRESHOLD = 4; // difficulty >= this counts as "hard" for idempotency
const DRY_RUN = !!process.env.DRY_RUN;
const SUBJECT_FILTER = (process.env.SUBJECTS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!SERVICE_KEY) {
  console.error("Neither SUPABASE_SERVICE_KEY nor SUPABASE_SERVICE_ROLE_KEY is set.");
  process.exit(1);
}
if (!Number.isFinite(DIFFICULTY) || DIFFICULTY < 1 || DIFFICULTY > 5) {
  console.error(`DIFFICULTY must be 1–5 (got "${process.env.DIFFICULTY}").`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

type GenResponse = { inserted?: number; message?: string; error?: string; detail?: string };

async function generateForTopic(subject: string, topicCode: string, count: number): Promise<number> {
  const resp = await fetch(`${API_BASE}/api/generate-questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject,
      topicCode,
      count,
      difficulty: DIFFICULTY,
      autoApprove: true,
      includeGraphs: true,
      includeDiagrams: true,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as GenResponse;
  if (data.error) throw new Error(`${data.error}${data.detail ? `: ${data.detail}` : ""}`);
  return data.inserted ?? 0;
}

/** Count existing hard questions already in the live bank for this subtopic. */
async function existingHardCount(subject: string, subtopic: string): Promise<number> {
  const { count } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("subject", subject)
    .eq("subtopic", subtopic)
    .gte("difficulty", HARD_THRESHOLD);
  return count ?? 0;
}

async function seedSubject(curriculumId: string, subjectLabel: string) {
  const { data: topics, error: tErr } = await supabase
    .from("curriculum_topics")
    .select("id, name")
    .eq("curriculum_id", curriculumId)
    .order("order_index");
  if (tErr) throw tErr;
  if (!topics || topics.length === 0) {
    console.log(`  (no topics found for ${subjectLabel})`);
    return;
  }

  let generated = 0;
  let skipped = 0;

  for (let ti = 0; ti < topics.length; ti++) {
    const topic = topics[ti];
    const { data: subs, error: sErr } = await supabase
      .from("curriculum_subtopics")
      .select("name")
      .eq("topic_id", topic.id)
      .order("order_index");
    if (sErr) throw sErr;
    if (!subs || subs.length === 0) continue;

    for (let si = 0; si < subs.length; si++) {
      const subtopicName = subs[si].name;
      const topicCode = `T${ti + 1}.${si + 1}`;

      const have = await existingHardCount(subjectLabel, subtopicName);
      if (have >= MIN_EXISTING) {
        skipped++;
        console.log(`  [SKIP] ${topicCode} ${subtopicName.slice(0, 48)} — ${have} hard already`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [DRY]  ${topicCode} ${subtopicName.slice(0, 48)} — would request ${PER_SUBTOPIC} @ diff ${DIFFICULTY}`);
        continue;
      }

      process.stdout.write(`  [GEN]  ${topicCode} ${subtopicName.slice(0, 48)} ... `);
      try {
        const inserted = await generateForTopic(subjectLabel, topicCode, PER_SUBTOPIC);
        generated += inserted;
        console.log(`inserted ${inserted}`);
      } catch (err) {
        console.log(`ERROR: ${(err as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  console.log(`  → ${subjectLabel}: inserted ${generated}, skipped ${skipped} subtopic(s)`);
}

async function main() {
  let query = supabase.from("curricula").select("id, name").order("name");
  if (SUBJECT_FILTER.length > 0) query = query.in("name", SUBJECT_FILTER);

  const { data: curricula, error } = await query;
  if (error) throw error;
  if (!curricula || curricula.length === 0) {
    console.error(
      SUBJECT_FILTER.length > 0
        ? `No managed curricula matched SUBJECTS=${JSON.stringify(SUBJECT_FILTER)}.`
        : "No managed curricula found.",
    );
    process.exit(1);
  }

  console.log(
    `Seeding hard (diff ${DIFFICULTY}) + graph questions into ${curricula.length} subject(s)` +
      `${DRY_RUN ? " [DRY RUN]" : ""}: ${curricula.map((c) => c.name).join(", ")}`,
  );

  for (const c of curricula) {
    console.log(`\n=== ${c.name} ===`);
    await seedSubject(c.id, c.name);
  }

  console.log("\n=== Seeding complete ===");
}

await main();
