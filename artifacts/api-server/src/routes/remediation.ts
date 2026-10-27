import { Router } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { requireUser, type Caller } from "../lib/auth";
import { checkAiQuota } from "../lib/ai-quota";
import { CLAUDE_MODEL, CLAUDE_THINKING } from "../lib/anthropic-model";
import { fetchExemplarContext, exemplarSystemLines } from "../lib/curriculum-exemplars";
import { extractJsonArray } from "../lib/json-latex";
import { normalizeMathText } from "../lib/normalize-math";
import { filterVerifiedQuestions } from "../lib/verify-question";
import { logger } from "../lib/logger";

/**
 * Remediation "similar questions", generated and stored by the server.
 *
 * A student who gets a question wrong and has nothing left in the bank for
 * that subtopic needs new questions straight away, so generation answers as
 * soon as Claude does. Storing them for everyone waits on the answer-key check,
 * which takes tens of seconds, so it's a second request the app makes without
 * waiting on it: /remediation/variants returns the questions plus a signed
 * batch, and /remediation/store checks the batch's answer keys and saves the
 * ones that pass to the bank (`questions`) and to `question_variants`.
 *
 * The signature means /store only ever saves questions this server wrote, for
 * the student it wrote them for. (Vercel may freeze a function once it has
 * responded, so the check can't simply run after /variants replies.)
 */

const router = Router();

const VARIANT_COUNT = 5;
const CLAUDE_TIMEOUT_MS = 10_000;
// Long enough for a student to finish the remediation the batch was made for.
const BATCH_TTL_MS = 2 * 60 * 60 * 1000;

type Parent = {
  id: string;
  subject: string;
  topic: string;
  subtopic: string;
  concept_tag: string | null;
  curriculum_id: string | null;
  difficulty: number | null;
  question: string;
  options: unknown;
  answer_index: number | null;
  solution: string | null;
};

type Variant = {
  id: string;        // question_variants.id once stored
  bank_id: string;   // questions.id once stored
  question: string;
  options: string[];
  answer_index: number;
  solution: string;
  tip: string | null;
  difficulty: number;
  variant_type: string;
};

type Batch = { v: 1; uid: string; parent: Omit<Parent, "question" | "options" | "answer_index">; variants: Variant[]; exp: number };

function signingSecret(): string {
  return process.env.REMEDIATION_SIGNING_SECRET || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function sign(encoded: string): string {
  return createHmac("sha256", signingSecret()).update(`remediation:${encoded}`).digest("base64url");
}

function encodeBatch(batch: Batch): { batch: string; signature: string } {
  const encoded = Buffer.from(JSON.stringify(batch)).toString("base64url");
  return { batch: encoded, signature: sign(encoded) };
}

/** The batch if the signature is ours, it's the caller's and it hasn't expired; otherwise null. */
function decodeBatch(encoded: unknown, signature: unknown, caller: Caller): Batch | null {
  if (typeof encoded !== "string" || typeof signature !== "string") return null;
  const expected = Buffer.from(sign(encoded));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const batch = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Batch;
    if (batch?.v !== 1 || !Array.isArray(batch.variants) || !batch.parent?.id) return null;
    if (batch.exp < Date.now()) return null;
    if (batch.uid !== caller.userId && !caller.isAdmin) return null;
    return batch;
  } catch {
    return null;
  }
}

function parseOptions(options: unknown): string[] {
  if (Array.isArray(options)) return options.map(String);
  if (typeof options === "string") {
    try { const parsed = JSON.parse(options); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
  }
  return [];
}

/** A generated question in the shape the quiz can serve, or null if it isn't a usable 4-option MCQ. */
function toVariant(raw: unknown, parent: Parent): Variant | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.question !== "string" || !r.question.trim()) return null;
  if (!Array.isArray(r.options) || r.options.length !== 4 || !r.options.every((o) => typeof o === "string" && o.trim())) return null;
  const answerIndex = Number(r.answer_index);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return null;
  const difficulty = Math.max(1, Math.min(5, Math.round(Number(r.difficulty) || parent.difficulty || 3)));
  return {
    id: randomUUID(),
    bank_id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    question: normalizeMathText(r.question.trim()) as string,
    options: (r.options as string[]).map((o) => normalizeMathText(o) as string),
    answer_index: answerIndex,
    solution: (normalizeMathText(typeof r.solution === "string" && r.solution.trim() ? r.solution : parent.solution || "") as string) || "",
    tip: typeof r.tip === "string" && r.tip.trim() ? r.tip : null,
    difficulty,
    variant_type: typeof r.variant_type === "string" && r.variant_type ? r.variant_type : "ai_variant",
  };
}

/** Whether the caller may see this question (staff, or a subject they have access to). */
async function canReadQuestion(caller: Caller, questionId: string): Promise<boolean> {
  if (caller.isAdmin || caller.isTutor) return true;
  const { data, error } = await caller.admin.rpc("user_can_read_question", { p_user: caller.userId, p_question_id: questionId });
  if (error?.code === "PGRST202") {
    // Before migration 20261025000005 there is no access check to call.
    logger.warn("[remediation] user_can_read_question missing; allowing the request");
    return true;
  }
  if (error) throw error;
  return data === true;
}

async function generateWithClaude(caller: Caller, parent: Parent, targetDifficulty: number): Promise<unknown[]> {
  const options = parseOptions(parent.options);
  const correctAnswer = parent.answer_index != null ? options[parent.answer_index] ?? "" : "";
  const subjectLabel = parent.subject || "high school";
  const systemLines = [
    `You are generating adaptive remediation MCQs for a ${subjectLabel} student.`,
    `Return only a valid JSON array containing exactly ${VARIANT_COUNT} objects.`,
    "Each object must have these keys: question, options, answer_index, solution, tip, difficulty, topic, subtopic, concept_tag, variant_type.",
    "Each options array must contain exactly 4 strings.",
    "Every question MUST be on the SAME topic and SAME subtopic as the original.",
    "Keep the same underlying concept, but vary wording, values, or structure.",
    "Write all maths in LaTeX inside $...$, escaping backslashes for JSON.",
    "Do not include markdown or commentary outside the JSON array.",
  ];
  try {
    const exemplars = await fetchExemplarContext(caller.admin, parent.subject, parent.subtopic, 1500);
    systemLines.push(...exemplarSystemLines(parent.subject, exemplars));
  } catch {
    /* generation still works without exemplars */
  }

  const user = [
    `Topic: ${parent.topic}`,
    `Subtopic: ${parent.subtopic}`,
    `Concept tag: ${parent.concept_tag || ""}`,
    `Original question: ${parent.question}`,
    `Correct answer: ${correctAnswer}`,
    `Original solution: ${parent.solution || ""}`,
    `Centre the difficulty around ${targetDifficulty} out of 5, but VARY it: include some at difficulty ${Math.max(1, targetDifficulty - 1)} and some at ${Math.min(5, targetDifficulty + 1)} so the student is stretched whether they get questions right or wrong.`,
    `Generate ${VARIANT_COUNT} questions that all test the "${parent.subtopic}" subtopic — same topic and subtopic as the original, not copies.`,
    `Vary wording, values, or scenario across the ${VARIANT_COUNT} questions.`,
  ].join("\n");

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        thinking: CLAUDE_THINKING,
        max_tokens: 2000,
        system: systemLines.join(" "),
        messages: [{ role: "user", content: user }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Claude API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return extractJsonArray(data?.content?.find((b) => b.type === "text")?.text || "");
  } finally {
    clearTimeout(timeout);
  }
}

// ── Generate ─────────────────────────────────────────────────────────────────
// Body: { parentQuestionId, targetDifficulty? }
// → { variants: [...], batch, signature }; pass batch + signature to /store.
router.post("/remediation/variants", async (req, res) => {
  const caller = await requireUser(req, res);
  if (!caller) return;
  const parentId = typeof req.body?.parentQuestionId === "string" ? req.body.parentQuestionId : "";
  if (!parentId) {
    res.status(400).json({ error: "parentQuestionId required" });
    return;
  }

  try {
    if (!(await canReadQuestion(caller, parentId))) {
      res.status(403).json({ error: "You don't have access to that question" });
      return;
    }
    const check = await checkAiQuota(caller, false);
    if ("blocked" in check) {
      res.status(429).json({ code: "ai_daily_limit", error: "You've reached today's AI limit. It resets tomorrow." });
      return;
    }

    const { data: parent, error } = await caller.admin
      .from("questions")
      .select("id, subject, topic, subtopic, concept_tag, curriculum_id, difficulty, question, options, answer_index, solution")
      .eq("id", parentId)
      .maybeSingle<Parent>();
    if (error) throw error;
    if (!parent) {
      res.status(404).json({ error: "Question not found" });
      return;
    }

    const target = Math.max(1, Math.min(5, Math.round(Number(req.body?.targetDifficulty) || parent.difficulty || 3)));
    const raw = await generateWithClaude(caller, parent, target);
    const variants = raw.map((r) => toVariant(r, parent)).filter((v): v is Variant => v !== null);
    if (!variants.length) {
      res.status(200).json({ variants: [] });
      return;
    }

    const { question: _q, options: _o, answer_index: _a, ...parentMeta } = parent;
    const signed = encodeBatch({ v: 1, uid: caller.userId, parent: parentMeta, variants, exp: Date.now() + BATCH_TTL_MS });
    res.status(200).json({
      variants: variants.map(({ bank_id: _b, ...v }) => ({
        ...v,
        variant_record_id: v.id,
        parent_question_id: parent.id,
        subject: parent.subject,
        topic: parent.topic,
        subtopic: parent.subtopic,
        concept_tag: parent.concept_tag,
        source: "ai_generated",
      })),
      ...signed,
    });
  } catch (err) {
    logger.error({ err, parentId }, "[remediation] variant generation failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Store ────────────────────────────────────────────────────────────────────
// Body: { batch, signature } from /variants. Checks each answer key, then saves
// the questions that pass. Safe to repeat: already-saved questions are skipped.
// → { stored: [{ variant_id, question }], dropped, fixed } where `question` is
//   the new bank row.
router.post("/remediation/store", async (req, res) => {
  const caller = await requireUser(req, res);
  if (!caller) return;
  const batch = decodeBatch(req.body?.batch, req.body?.signature, caller);
  if (!batch) {
    res.status(400).json({ error: "Invalid or expired batch" });
    return;
  }
  const { parent } = batch;
  const db = caller.admin;

  try {
    // Already saved (a repeated request): report those, check only the rest.
    const bankIds = batch.variants.map((v) => v.bank_id);
    const { data: savedRows, error: savedErr } = await db.from("questions").select("*").in("id", bankIds);
    if (savedErr) throw savedErr;
    const saved = new Map((savedRows || []).map((r: { id: string }) => [r.id, r]));

    // Skip questions whose text the subject's bank already has.
    const pending = batch.variants.filter((v) => !saved.has(v.bank_id));
    let fresh = pending;
    if (pending.length) {
      let dupQuery = db.from("questions").select("question").in("question", pending.map((v) => v.question));
      dupQuery = parent.curriculum_id ? dupQuery.eq("curriculum_id", parent.curriculum_id) : dupQuery.eq("subject", parent.subject);
      const { data: dups, error: dupErr } = await dupQuery;
      if (dupErr) throw dupErr;
      const dupTexts = new Set((dups || []).map((d: { question: string }) => d.question));
      fresh = pending.filter((v) => !dupTexts.has(v.question));
    }

    let kept: Variant[] = [];
    let dropped = 0;
    let fixed = 0;
    if (fresh.length) {
      const checks = await checkAiQuota(caller, false);
      if ("blocked" in checks) {
        res.status(429).json({ code: "ai_daily_limit", error: "You've reached today's AI limit. It resets tomorrow." });
        return;
      }
      ({ kept, dropped, fixed } = await filterVerifiedQuestions(fresh, { context: { parentId: parent.id, route: "remediation/store" } }));
    }

    const now = new Date().toISOString();
    const conceptTag = parent.concept_tag || `${parent.subject}|${parent.topic}|${parent.subtopic}`.toLowerCase();
    if (kept.length) {
      const bankRows = kept.map((v) => ({
        id: v.bank_id,
        subject: parent.subject,
        topic: parent.topic,
        subtopic: parent.subtopic,
        concept_tag: conceptTag,
        ...(parent.curriculum_id ? { curriculum_id: parent.curriculum_id } : {}),
        difficulty: v.difficulty,
        question: v.question,
        options: v.options,
        answer_index: v.answer_index,
        solution: v.solution,
        tip: null,
        created_at: now,
      }));
      const { data: inserted, error: bankErr } = await db
        .from("questions")
        .upsert(bankRows, { onConflict: "id", ignoreDuplicates: true })
        .select("*");
      if (bankErr) throw bankErr;
      for (const row of inserted || []) saved.set((row as { id: string }).id, row);

      const variantRows = kept.map((v) => ({
        id: v.id,
        parent_question_id: parent.id,
        variant_type: v.variant_type,
        subject: parent.subject,
        topic: parent.topic,
        subtopic: parent.subtopic,
        concept_tag: conceptTag,
        difficulty: v.difficulty,
        question: v.question,
        options: v.options,
        answer_index: v.answer_index,
        solution: v.solution,
        tip: v.tip,
        source: "ai_generated",
      }));
      const { error: variantErr } = await db
        .from("question_variants")
        .upsert(variantRows, { onConflict: "id", ignoreDuplicates: true });
      if (variantErr) logger.warn({ err: variantErr, parentId: parent.id }, "[remediation] saving question_variants failed");
    }

    const stored = batch.variants
      .filter((v) => saved.has(v.bank_id))
      .map((v) => ({ variant_id: v.id, question: saved.get(v.bank_id) }));
    if (dropped || fixed) {
      logger.info({ parentId: parent.id, generated: fresh.length, kept: kept.length, dropped, fixed }, "[remediation] answer-key check adjusted the batch");
    }
    res.status(200).json({ stored, dropped, fixed });
  } catch (err) {
    logger.error({ err, parentId: parent.id }, "[remediation] storing variants failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
