import { Router } from "express";
import { requireUser, requireAdmin } from "../lib/auth";
import { checkAiQuota } from "../lib/ai-quota";
import { blockAwaitingParent, loadStudentContext } from "../lib/parent-consent";
import { CLAUDE_MARK_MODEL } from "../lib/anthropic-model";
import { markAnswer, normalizeResponse, responseHash, MAX_RESPONSE_CHARS, type MarkingResult } from "../lib/marking";
import { generateMarkedQuestions, loadMarkedTarget, MARKED_MAX_COUNT } from "../lib/marked-questions";
import { logger } from "../lib/logger";

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
// answer_markings, so a retry or a reload costs nothing.
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

export default router;
