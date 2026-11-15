import { Router } from "express";
import { requireUser, requireAdmin, type Caller } from "../lib/auth";
import { checkAiQuota } from "../lib/ai-quota";
import { checkMarkedAllowance } from "../lib/marked-quota";
import { blockAwaitingParent, loadStudentContext } from "../lib/parent-consent";
import { CLAUDE_MARK_MODEL } from "../lib/anthropic-model";
import { markAnswer, normalizeResponse, responseHash, MAX_RESPONSE_CHARS, type MarkingResult } from "../lib/marking";
import { generateMarkedQuestions, loadMarkedTarget, MARKED_MAX_COUNT } from "../lib/marked-questions";
import { logger } from "../lib/logger";
import { storedAdvice, writeAdvice } from "../lib/advice";
import { withoutAnswers } from "../lib/grade";
import { canReadQuestion } from "../lib/question-access";
import { findSubtopic, markedTopupLimit, planMarkedTopup, topupDifficulty } from "../lib/marked-topup";

const router = Router();

type MarkedRow = {
  id: string;
  subject: string | null;
  question: string;
  question_type: string | null;
  total_marks: number | null;
  marking_scheme: unknown;
  solution: string | null;
  table_data: unknown;
  diagram: unknown;
  curriculum_id: string | null;
};

// POST /api/marked/mark  { questionId, response }
// Marks a student's written answer to a 'marked' question against its marking
// scheme and returns the marks point by point:
//   { awarded, total, marks: [{ point, awarded, of, evidence, found, comment }], summary, cached }
// Students can use it only in subjects with the 'written_answers' feature on.
// The same answer to the same question is marked once and then served from
// answer_markings, so a retry or a reload costs nothing. A student with no
// paid subject gets a few new markings a day (lib/marked-quota.ts).
router.post("/marked/mark", async (req, res) => {
  const caller = await requireUser(req, res);
  if (!caller) return;
  try {
    const { questionId, response } = (req.body || {}) as { questionId?: unknown; response?: unknown };
    if (typeof questionId !== "string" || !questionId) {
      res.status(400).json({ error: "questionId required" });
      return;
    }
    // An extra-practice copy of a bank question (bank__<parent>__<id>) is marked as that question.
    const bankQuestionId = questionId.startsWith("bank__") ? questionId.split("__").slice(2).join("__") : questionId;
    const answer = normalizeResponse(response);
    if (!answer) {
      res.status(400).json({ error: "Write your answer first." });
      return;
    }
    if (answer.length > MAX_RESPONSE_CHARS) {
      res.status(400).json({ error: `Answers can be up to ${MAX_RESPONSE_CHARS.toLocaleString()} characters.` });
      return;
    }

    const { data: qRow, error: qErr } = await caller.admin
      .from("questions")
      .select("id, subject, question, question_type, total_marks, marking_scheme, solution, table_data, diagram, curriculum_id")
      .eq("id", bankQuestionId)
      .maybeSingle();
    if (qErr) {
      res.status(500).json({ error: qErr.message });
      return;
    }
    const q = qRow as MarkedRow | null;
    if (!q || q.question_type !== "marked") {
      res.status(404).json({ error: "That question can't be marked." });
      return;
    }

    // Students: only where an admin has switched written answers on.
    if (!caller.isAdmin && !caller.isTutor) {
      const { data: curr } = q.curriculum_id
        ? await caller.admin.from("curricula").select("features").eq("id", q.curriculum_id).maybeSingle()
        : { data: null };
      const features = ((curr as { features?: Record<string, unknown> } | null)?.features ?? {});
      if (features.written_answers !== true) {
        res.status(403).json({ error: "Written answers aren't switched on for this subject." });
        return;
      }
    }

    const hash = responseHash(answer);
    const keepsRecord = caller.userId !== "service";
    if (keepsRecord) {
      const { data: prev } = await caller.admin
        .from("answer_markings")
        .select("awarded, total, marks, summary")
        .eq("user_id", caller.userId).eq("question_id", q.id).eq("response_hash", hash)
        .maybeSingle();
      if (prev) {
        res.json({ ...(prev as MarkingResult), cached: true });
        return;
      }
    }

    // A student under 15 waits for their parent to confirm before any AI.
    const student = await loadStudentContext(caller);
    if (blockAwaitingParent(student, res)) return;
    const allowance = await checkMarkedAllowance(caller);
    if (allowance.blocked) {
      res.status(429).json({
        code: "marked_daily_limit",
        limit: allowance.limit,
        error: allowance.limit > 0
          ? `You've had today's ${allowance.limit} free marked answer${allowance.limit === 1 ? "" : "s"}. More tomorrow, or subscribe to a subject to have every answer marked.`
          : "Marked written answers come with a paid subject. Subscribe to one to have your answers marked.",
      });
      return;
    }
    const check = await checkAiQuota(caller, false);
    if ("blocked" in check) {
      res.status(429).json({ code: "ai_daily_limit", error: "You've reached today's AI limit, so this answer can't be marked. It resets tomorrow." });
      return;
    }

    let result: MarkingResult;
    try {
      result = await markAnswer(q, answer);
    } catch (err) {
      logger.error({ err, questionId: q.id }, "[marking] marking an answer failed");
      res.status(502).json({ error: "Your answer couldn't be marked just now. Try again in a moment." });
      return;
    }

    if (keepsRecord) {
      const { error: saveErr } = await caller.admin.from("answer_markings").upsert({
        user_id: caller.userId,
        question_id: q.id,
        response: answer,
        response_hash: hash,
        awarded: result.awarded,
        total: result.total,
        marks: result.marks,
        summary: result.summary,
        model: CLAUDE_MARK_MODEL,
      }, { onConflict: "user_id,question_id,response_hash", ignoreDuplicates: true });
      if (saveErr) logger.warn({ err: saveErr, questionId: q.id }, "[marking] saving the marks failed");
    }

    res.json({ ...result, cached: false });
  } catch (err) {
    logger.error({ err }, "[marking] unexpected error");
    res.status(500).json({ error: "Your answer couldn't be marked just now. Try again in a moment." });
  }
});

// POST /api/marked/advice  { questionId }
// Titan's Advice for a written-answer question: a teacher's annotations on the
// question (phrases, quantities and table cells to mark, each with a short
// note) and the steps from the question to the answer:
//   { advice: { notes: [{ quote, mark, note }], cells: [{ row, col, note? }], steps: [string] }, cached }
// Made once per question and saved on it, so every student sees the same
// marks and only the first one costs an AI call. Same access rules as marking.
router.post("/marked/advice", async (req, res) => {
  const caller = await requireUser(req, res);
  if (!caller) return;
  try {
    const { questionId } = (req.body || {}) as { questionId?: unknown };
    if (typeof questionId !== "string" || !questionId) {
      res.status(400).json({ error: "questionId required" });
      return;
    }
    const bankQuestionId = questionId.startsWith("bank__") ? questionId.split("__").slice(2).join("__") : questionId;
    const { data: qRow, error: qErr } = await caller.admin
      .from("questions")
      .select("id, subject, question, question_type, total_marks, marking_scheme, solution, table_data, diagram, curriculum_id, advice")
      .eq("id", bankQuestionId)
      .maybeSingle();
    if (qErr) {
      res.status(500).json({ error: qErr.message });
      return;
    }
    const q = qRow as (MarkedRow & { advice: unknown }) | null;
    if (!q || q.question_type !== "marked") {
      res.status(404).json({ error: "Titan's Advice isn't available for this question." });
      return;
    }
    if (!caller.isAdmin && !caller.isTutor) {
      const { data: curr } = q.curriculum_id
        ? await caller.admin.from("curricula").select("features").eq("id", q.curriculum_id).maybeSingle()
        : { data: null };
      const features = ((curr as { features?: Record<string, unknown> } | null)?.features ?? {});
      if (features.written_answers !== true) {
        res.status(403).json({ error: "Written answers aren't switched on for this subject." });
        return;
      }
    }
    const table = q.table_data && typeof q.table_data === "object" ? (q.table_data as { rows?: unknown[] }) : null;
    const kept = storedAdvice(q.question, q.advice, table);
    if (kept) {
      res.json({ advice: kept, cached: true });
      return;
    }

    const student = await loadStudentContext(caller);
    if (blockAwaitingParent(student, res)) return;
    const check = await checkAiQuota(caller, false);
    if ("blocked" in check) {
      res.status(429).json({ code: "ai_daily_limit", error: "You've reached today's AI limit, so Titan can't annotate this now. It resets tomorrow." });
      return;
    }

    let advice;
    try {
      advice = await writeAdvice(q);
    } catch (err) {
      logger.error({ err, questionId: q.id }, "[marking] writing Titan's Advice failed");
      res.status(502).json({ error: "Titan couldn't annotate this question just now. Try again in a moment." });
      return;
    }
    if (!advice.notes.length && !advice.steps.length) {
      res.status(502).json({ error: "Titan couldn't annotate this question just now. Try again in a moment." });
      return;
    }
    const { error: saveErr } = await caller.admin.from("questions").update({ advice }).eq("id", q.id);
    if (saveErr) logger.warn({ err: saveErr, questionId: q.id }, "[marking] saving Titan's Advice failed");
    res.json({ advice, cached: false });
  } catch (err) {
    logger.error({ err }, "[marking] unexpected error in advice");
    res.status(500).json({ error: "Titan couldn't annotate this question just now. Try again in a moment." });
  }
});

// POST /api/marked/generate  { subtopicId, count?, difficulty? }   (admin only)
// Writes up to MARKED_MAX_COUNT written-answer questions for one subtopic,
// checks each one, and saves the ones that pass straight into the bank.
// Returns { saved: [question rows], rejected: [{ question, reason }] }.
router.post("/marked/generate", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  const { subtopicId, count = MARKED_MAX_COUNT, difficulty = "mixed" } = (req.body || {}) as {
    subtopicId?: unknown; count?: unknown; difficulty?: unknown;
  };
  if (typeof subtopicId !== "string" || !subtopicId) {
    res.status(400).json({ error: "subtopicId required" });
    return;
  }
  const d = Number(difficulty);
  const level = difficulty === "mixed" || !(d >= 1 && d <= 5) ? "mixed" : Math.round(d);
  try {
    const target = await loadMarkedTarget(caller.admin, subtopicId);
    if (!target) {
      res.status(404).json({ error: "Subtopic not found" });
      return;
    }
    const result = await generateMarkedQuestions(caller.admin, target, { count: Number(count) || MARKED_MAX_COUNT, difficulty: level });
    res.json(result);
  } catch (err) {
    logger.error({ err, subtopicId }, "[marking] generating written-answer questions failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Generating the questions failed" });
  }
});

/** Which of these questions the student has answered (answer_log). */
async function answeredIds(caller: Caller, ids: string[]): Promise<Set<string>> {
  const done = new Set<string>();
  if (caller.userId === "service") return done;
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await caller.admin
      .from("answer_log").select("question_id")
      .eq("user_id", caller.userId).in("question_id", ids.slice(i, i + 100));
    if (error) throw error;
    for (const r of (data ?? []) as { question_id: string }[]) done.add(r.question_id);
  }
  return done;
}

/**
 * Claim up to `wanted` written-answer top-ups from the student's allowance for
 * today (migration 20261115000000). 0 when they don't qualify (no paid,
 * granted or beta subscription to the subject), have none left, or the check
 * can't run: these cost real money, so they fail closed.
 */
async function claimTopups(caller: Caller, curriculumId: string, wanted: number, limit: number): Promise<number> {
  const { data, error } = await caller.admin.rpc("use_marked_topup_quota", {
    p_user: caller.userId, p_curriculum: curriculumId, p_count: wanted, p_limit: limit,
  });
  if (error) {
    logger.warn({ err: error }, "[marking] written-answer top-up allowance check failed; not writing any");
    return 0;
  }
  return Math.max(0, Math.min(wanted, Number(data) || 0));
}

async function releaseTopups(caller: Caller, unused: number): Promise<void> {
  if (unused < 1) return;
  const { error } = await caller.admin.rpc("release_marked_topup_quota", { p_user: caller.userId, p_count: unused });
  if (error) logger.warn({ err: error }, "[marking] giving back unused written-answer top-ups failed");
}

// POST /api/marked/top-up  { curriculumId, subtopic, difficulty? }
// More written-answer questions for a student who has used up the ones in a
// subtopic. The app asks in the background as they reach the last one, so the
// next is ready when they finish. Writes up to MARKED_MAX_COUNT, checked like
// the admin ones, within the student's daily allowance (paid subjects only;
// lib/marked-topup.ts). Only refills: a subtopic with no written answers gets
// none. When the student still has some unanswered, sends those back instead
// (the app may have loaded before they were written).
// Returns { questions: [rows, without answers for students], written, reason? }.
router.post("/marked/top-up", async (req, res) => {
  const caller = await requireUser(req, res);
  if (!caller) return;
  const { curriculumId, subtopic, difficulty } = (req.body || {}) as { curriculumId?: unknown; subtopic?: unknown; difficulty?: unknown };
  if (typeof curriculumId !== "string" || !curriculumId || typeof subtopic !== "string" || !subtopic.trim()) {
    res.status(400).json({ error: "curriculumId and subtopic required" });
    return;
  }
  const staff = caller.isAdmin || caller.isTutor;
  const shown = (rows: Record<string, unknown>[]) => (staff ? rows : rows.map((r) => withoutAnswers(r)));
  try {
    const { data: curr } = await caller.admin.from("curricula").select("id, features").eq("id", curriculumId).maybeSingle();
    if (!curr) {
      res.status(404).json({ error: "Subject not found" });
      return;
    }
    const features = ((curr as { features?: Record<string, unknown> | null }).features ?? {});
    if (features.written_answers !== true) {
      res.status(403).json({ error: "Written answers aren't switched on for this subject." });
      return;
    }
    const { data: subs, error: subErr } = await caller.admin
      .from("curriculum_subtopics").select("id, name").eq("curriculum_id", curriculumId);
    if (subErr) throw subErr;
    const sub = findSubtopic(subs as { id: string; name: string | null }[] | null, subtopic);
    if (!sub) {
      res.status(404).json({ error: "Subtopic not found" });
      return;
    }

    // The subtopic's written-answer questions, newest first, less any kept out of this subject.
    const [bankRes, hiddenRes] = await Promise.all([
      caller.admin.from("questions").select("id")
        .eq("subtopic_id", sub.id).eq("question_type", "marked")
        .order("created_at", { ascending: false }).limit(500),
      caller.admin.from("curriculum_hidden_questions").select("question_id").eq("curriculum_id", curriculumId),
    ]);
    if (bankRes.error) throw bankRes.error;
    const hidden = new Set(((hiddenRes.data ?? []) as { question_id: string }[]).map((r) => r.question_id));
    const bank = ((bankRes.data ?? []) as { id: string }[]).filter((q) => !hidden.has(q.id));
    if (!bank.length) {
      res.json({ questions: [], written: 0, reason: "none" });
      return;
    }
    // Only students who can see this subject's questions.
    if (!(await canReadQuestion(caller, bank[0].id))) {
      res.status(403).json({ error: "You don't have access to this subject." });
      return;
    }

    const plan = planMarkedTopup(bank, await answeredIds(caller, bank.map((q) => q.id)));
    if (plan.action === "serve") {
      const { data: rows, error } = await caller.admin.from("questions").select("*").in("id", plan.ids);
      if (error) throw error;
      res.json({ questions: shown((rows ?? []) as Record<string, unknown>[]), written: 0, reason: "enough" });
      return;
    }
    if (plan.action !== "generate") {
      res.json({ questions: [], written: 0, reason: "none" });
      return;
    }

    // A student under 15 waits for their parent to confirm before any AI.
    const student = await loadStudentContext(caller);
    if (blockAwaitingParent(student, res)) return;

    const claimed = staff ? MARKED_MAX_COUNT : await claimTopups(caller, curriculumId, MARKED_MAX_COUNT, markedTopupLimit(features));
    if (claimed < 1) {
      res.json({ questions: [], written: 0, reason: "allowance" });
      return;
    }
    const check = await checkAiQuota(caller, false);
    if ("blocked" in check) {
      if (!staff) await releaseTopups(caller, claimed);
      res.status(429).json({ code: "ai_daily_limit", error: "You've reached today's limit for new questions. It resets tomorrow." });
      return;
    }

    let saved: Record<string, unknown>[] = [];
    try {
      const target = await loadMarkedTarget(caller.admin, sub.id);
      if (target) {
        const result = await generateMarkedQuestions(caller.admin, target, { count: claimed, difficulty: topupDifficulty(difficulty) });
        saved = result.saved as Record<string, unknown>[];
        if (result.rejected.length) {
          logger.info({ subtopicId: sub.id, saved: saved.length, rejected: result.rejected.length }, "[marking] written-answer top-up");
        }
      }
    } finally {
      // The allowance counts only questions that reached the bank. Given back
      // before replying: Vercel may freeze the function once it has responded.
      if (!staff) await releaseTopups(caller, claimed - saved.length);
    }
    res.json({ questions: shown(saved), written: saved.length });
  } catch (err) {
    logger.error({ err, curriculumId, subtopic }, "[marking] written-answer top-up failed");
    res.status(500).json({ error: "New written-answer questions couldn't be written just now." });
  }
});

export default router;
