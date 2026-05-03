/**
 * Seed script: generates Victorian Year 10 and Year 10A Mathematics questions
 * by calling the running API server's generate-questions endpoint, then
 * auto-approving the drafts (inserting into the live questions table).
 *
 * Idempotent: skips any topic that already has ≥ 3 approved drafts.
 *
 * Run:  pnpm --filter @workspace/scripts exec tsx ./src/seed-vic-y10-questions.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = "http://localhost:8080";

if (!SERVICE_KEY) {
  console.error("Neither SUPABASE_SERVICE_KEY nor SUPABASE_SERVICE_ROLE_KEY is set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const VIC_Y10_TOPICS: Record<string, string> = {
  "N1":  "Percentages, errors and approximations with real numbers",
  "N2":  "Simple and compound interest",
  "A1":  "Expanding, factorising and simplifying algebraic expressions",
  "A2":  "Solving linear equations and inequalities",
  "A3":  "Solving quadratic equations",
  "A4":  "Linear, quadratic and simple exponential functions and graphs",
  "A5":  "Direct and inverse proportion",
  "A6":  "Simultaneous linear equations",
  "M1":  "Surface area and volume of pyramids, cones and spheres",
  "M2":  "Similarity and scale factors",
  "M3":  "Trigonometry \u2014 right-angled triangles (sin, cos, tan)",
  "M4":  "Applications of Pythagoras\u2019 theorem and trigonometry",
  "SP1": "Geometric reasoning and proofs with plane shapes",
  "SP2": "Congruence and similarity of triangles",
  "SP3": "Circle geometry \u2014 chord, tangent and angle properties",
  "ST1": "Data distributions \u2014 displaying and comparing with statistical measures",
  "ST2": "Bivariate numerical data \u2014 scatter plots and lines of best fit",
  "ST3": "Evaluating statistical reports and media claims",
  "P1":  "Conditional probability and independence",
  "P2":  "Two-step and multi-step chance experiments \u2014 tables and tree diagrams",
};

const VIC_Y10A_TOPICS: Record<string, string> = {
  "XN1":  "The real number system \u2014 surds and irrational numbers",
  "XN2":  "Logarithms \u2014 definition, laws and applications",
  "XA1":  "Binomial expansion and Pascal\u2019s triangle",
  "XA2":  "Polynomial functions \u2014 graphs, roots and factorisation",
  "XA3":  "Exponential and logarithmic functions and equations",
  "XA4":  "Inverse functions and function notation",
  "XA5":  "Arithmetic and geometric sequences and series",
  "XM1":  "Trigonometry \u2014 non-right-angled triangles (sine and cosine rules)",
  "XM2":  "Trigonometric ratios of obtuse angles and exact values",
  "XM3":  "Arc length, sectors and segments of circles",
  "XSP1": "Proof \u2014 congruent and similar triangles, angle and chord theorems",
  "XSP2": "Vectors \u2014 representation, addition and scalar multiplication",
  "XST1": "Statistical inference \u2014 sampling distributions and variability",
  "XST2": "Correlation coefficient and lines of best fit \u2014 interpretation and use",
  "XP1":  "Counting techniques \u2014 permutations and combinations",
  "XP2":  "Probability distributions \u2014 discrete random variables",
};

function makeId(): string {
  return `seed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function generateForTopic(subject: string, topicCode: string, count: number): Promise<number> {
  const resp = await fetch(`${API_BASE}/api/generate-questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, topicCode, count, difficulty: "mixed" }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json() as { inserted?: number; message?: string; error?: string };
  if (data.error) throw new Error(data.error);
  return data.inserted ?? 0;
}

async function approveDrafts(subjectLabel: string, topicCode: string): Promise<number> {
  // Fetch all pending drafts for this topic
  const { data: drafts, error: fetchErr } = await supabase
    .from("draft_questions")
    .select("*")
    .eq("subject", subjectLabel)
    .eq("topic_code", topicCode)
    .eq("status", "pending");

  if (fetchErr) throw fetchErr;
  if (!drafts || drafts.length === 0) return 0;

  const now = new Date().toISOString();

  // Insert into live questions table (matches columns in adminDb.js approveDraftQuestion)
  const liveRows = drafts.map((d) => ({
    id: makeId(),
    subject: d.subject,
    topic: d.topic,
    subtopic: d.subtopic ?? d.topic,
    concept_tag: `${d.subject}|${d.topic}|${d.subtopic ?? d.topic}`.toLowerCase(),
    difficulty: d.difficulty ?? 3,
    question: d.question,
    options: typeof d.options === "string" ? JSON.parse(d.options) : d.options,
    answer_index: d.answer_index,
    solution: d.solution ?? "",
    tip: null,
    created_at: now,
  }));

  const { error: insertErr } = await supabase.from("questions").insert(liveRows);
  if (insertErr) throw insertErr;

  // Mark drafts as approved
  const draftIds = drafts.map((d) => d.id);
  const { error: updateErr } = await supabase
    .from("draft_questions")
    .update({ status: "approved", reviewed_at: now })
    .in("id", draftIds);
  if (updateErr) throw updateErr;

  return liveRows.length;
}

async function seedSubject(
  subjectApiId: string,
  subjectLabel: string,
  topics: Record<string, string>,
) {
  console.log(`\n=== Seeding ${subjectLabel} (${Object.keys(topics).length} topics) ===`);

  for (const [code, topicName] of Object.entries(topics)) {
    // Idempotency: skip if already ≥3 approved drafts for this topic
    const { count: existing } = await supabase
      .from("draft_questions")
      .select("id", { count: "exact", head: true })
      .eq("subject", subjectLabel)
      .eq("topic_code", code)
      .eq("status", "approved");

    if ((existing ?? 0) >= 3) {
      console.log(`  [SKIP] ${code} — already has ${existing} approved questions`);
      continue;
    }

    process.stdout.write(`  [GEN]  ${code}: ${topicName.slice(0, 50)} ... `);

    try {
      const inserted = await generateForTopic(subjectApiId, code, 5);
      process.stdout.write(`generated ${inserted} drafts, `);

      const approved = await approveDrafts(subjectLabel, code);
      console.log(`approved ${approved}`);
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
    }

    // Brief pause between topics
    await new Promise((r) => setTimeout(r, 1500));
  }
}

await seedSubject("vic_maths_y10", "Victorian Year 10 Mathematics", VIC_Y10_TOPICS);
await seedSubject("vic_maths_y10a", "Victorian Year 10A Mathematics", VIC_Y10A_TOPICS);

console.log("\n=== Seeding complete ===");
