/**
 * Seed script: top up the live question bank with EXAM-GRADE questions (the
 * hardest multiple choice, with graphs wherever the topic allows) for managed
 * subjects, so adaptive sessions have genuinely exam-level material.
 *
 * How it works:
 *   1. Reads the managed curricula straight from the DB and rebuilds the exact
 *      T{n}.{m} topic codes the generator expects (topics and subtopics ordered
 *      by order_index, 1-based) — no hardcoded codes that can drift from the
 *      curriculum.
 *   2. For each subtopic, calls the API's generate-questions endpoint with
 *      examGrade on (stronger model with reasoning, exam-level prompt rules,
 *      strict answer verification), includeGraphs, and autoApprove so verified
 *      questions land directly in the live `questions` table.
 *   3. Repeats for a subtopic until it holds TARGET exam-grade questions (ids
 *      starting ai_exam_) or MAX_ATTEMPTS requests have run, so re-running the
 *      script only fills the gaps.
 *
 * Requirements:
 *   - The API must be reachable at API_BASE (the deployed app works: the
 *     service key authenticates as admin) and configured with an Anthropic key.
 *   - SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set.
 *   - The "Seed exam-grade questions" GitHub Action runs this against the
 *     deployed app.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx ./src/seed-hard-graph-questions.ts
 *
 * Optional env knobs:
 *   SUBJECTS       comma-separated curriculum names to seed (default: all managed)
 *                  e.g. SUBJECTS="VCE Mathematical Methods Units 1 and 2"
 *   TOPICS         comma-separated topic names within those subjects (default: all)
 *   DIFFICULTY     target difficulty 1–5 (default 5)
 *   TARGET         exam-grade questions wanted per subtopic (default 4)
 *   PER_REQUEST    questions per request, max 3 (default 2; keeps each request
 *                  inside the API's 300 s limit)
 *   MAX_ATTEMPTS   requests per subtopic per run (default 3)
 *   CONCURRENCY    subtopics worked on at once (default 3)
 *   API_BASE       API base URL (default http://localhost:8080)
 *   DRY_RUN        if set, list what would be generated without calling the API
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = process.env.API_BASE || "http://localhost:8080";
const DIFFICULTY = Number(process.env.DIFFICULTY || 5);
const TARGET = Number(process.env.TARGET || 4);
const PER_REQUEST = Math.min(3, Number(process.env.PER_REQUEST || 2));
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 3);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 3));
const DRY_RUN = !!process.env.DRY_RUN;
const TOPIC_FILTER = (process.env.TOPICS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({
      subject,
      topicCode,
      count,
      difficulty: DIFFICULTY,
      autoApprove: true,
      includeGraphs: true,
      includeDiagrams: true,
      examGrade: true,
    }),
    // The API's own limit is 300 s; exam-grade requests can use most of it.
    signal: AbortSignal.timeout(310_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as GenResponse;
  if (data.error) throw new Error(`${data.error}${data.detail ? `: ${data.detail}` : ""}`);
  return data.inserted ?? 0;
}

/** Count exam-grade questions already in the live bank for this subtopic. */
async function existingExamCount(subject: string, subtopic: string): Promise<number> {
  const { count } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("subject", subject)
    .eq("subtopic", subtopic)
    .like("id", "ai_exam_%");
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

  // Every subtopic with its T{n}.{m} code, in curriculum order.
  const jobs: { topicCode: string; subtopicName: string }[] = [];
  for (let ti = 0; ti < topics.length; ti++) {
    const topic = topics[ti];
    const { data: subs, error: sErr } = await supabase
      .from("curriculum_subtopics")
      .select("name")
      .eq("topic_id", topic.id)
      .order("order_index");
    if (sErr) throw sErr;
    if (TOPIC_FILTER.length > 0 && !TOPIC_FILTER.includes(topic.name)) continue;
    (subs || []).forEach((sub, si) => jobs.push({ topicCode: `T${ti + 1}.${si + 1}`, subtopicName: sub.name }));
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  const runJob = async ({ topicCode, subtopicName }: { topicCode: string; subtopicName: string }) => {
    const label = `${topicCode} ${subtopicName.slice(0, 48)}`;
    let have = await existingExamCount(subjectLabel, subtopicName);
    if (have >= TARGET) {
      skipped++;
      console.log(`  [SKIP] ${label} — ${have} exam-grade already`);
      return;
    }
    if (DRY_RUN) {
      console.log(`  [DRY]  ${label} — has ${have}, would request ${PER_REQUEST} at a time up to ${TARGET}`);
      return;
    }
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && have < TARGET; attempt++) {
      try {
        const inserted = await generateForTopic(subjectLabel, topicCode, Math.min(PER_REQUEST, TARGET - have));
        generated += inserted;
        have += inserted;
        console.log(`  [GEN]  ${label} — attempt ${attempt}: inserted ${inserted} (now ${have}/${TARGET})`);
      } catch (err) {
        failed++;
        console.log(`  [ERR]  ${label} — attempt ${attempt}: ${(err as Error).message}`);
      }
    }
  };

  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (next < jobs.length) await runJob(jobs[next++]);
  }));

  console.log(`  → ${subjectLabel}: inserted ${generated}, skipped ${skipped} subtopic(s), ${failed} failed request(s)`);
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
    `Seeding exam-grade (diff ${DIFFICULTY}, ${TARGET} per subtopic) questions into ${curricula.length} subject(s)` +
      `${DRY_RUN ? " [DRY RUN]" : ""}: ${curricula.map((c) => c.name).join(", ")}`,
  );

  for (const c of curricula) {
    console.log(`\n=== ${c.name} ===`);
    await seedSubject(c.id, c.name);
  }

  console.log("\n=== Seeding complete ===");
}

await main();
