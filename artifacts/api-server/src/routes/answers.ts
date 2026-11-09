import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, type Caller } from "../lib/auth";
import {
  calcXP, cleanResponse, gradeResponse, partMarksXP, questionType, remediationXP, revealOf,
  REMEDIATION_BONUS, type GradableQuestion,
} from "../lib/grade";
import { normalizeResponse, responseHash } from "../lib/marking";
import { unseal } from "../lib/sealed";
import { VARIANT_SEAL, type SealedVariant } from "./remediation";
import { logger } from "../lib/logger";
import { createHash } from "node:crypto";
import { CLAUDE_MODEL, CLAUDE_THINKING } from "../lib/anthropic-model";
import { checkAiQuota } from "../lib/ai-quota";

/**
 * Answers are marked here, not in the app (migration 20261110000000).
 *
 * The app shows questions without their answers (questions_student) and sends
 * each answer here. This marks it, records it (answer log, review schedule,
 * assignment progress), awards the XP, and only then sends back the answer
 * and solution to show.
 *
 *   POST /answers/present    the question now on screen; holds it until answered
 *   POST /answers/check      mark one answer
 *   POST /answers/exam       mark a whole practice exam and save the attempt
 *   POST /answers/solutions  answers and solutions for the exam builder
 *   POST /answers/tip        Titan's short tip after a wrong answer (made once, then reused)
 *
 * Holds: the question a student is shown in a subject (or an assignment) stays
 * theirs until they answer it. Reloading the page or ending the session and
 * starting again brings back the same question, so a hard one can't be
 * swapped for another.
 */

const router = Router();

type QuestionRow = GradableQuestion & {
  subject: string | null;
  topic: string | null;
  subtopic: string | null;
  subtopic_id: string | null;
  curriculum_id: string | null;
  total_marks: number | null;
  source_kind: string | null;
};

const QUESTION_COLUMNS = [
  "id", "subject", "topic", "subtopic", "subtopic_id", "curriculum_id", "difficulty", "question_type",
  "options", "answer_index", "answer_indices", "answer", "tolerance", "unit", "accept", "case_sensitive",
  "items", "hotspots", "markers", "solution", "tip", "marking_scheme", "advice", "parts", "total_marks", "source_kind",
].join(", ");

const CONTEXT_RE = /^(practice|assignment):[\w .|:/()&+-]{1,160}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A question answered right this recently earns no more XP for being answered right again.
const REPEAT_XP_WINDOW_MS = 12 * 60 * 60 * 1000;
// Extra practice earns XP only after a wrong answer to its question this recently.
const REMEDIATION_WINDOW_MS = 6 * 60 * 60 * 1000;

const isStaff = (c: Caller) => c.isAdmin || c.isTutor;
const str = (v: unknown, max = 200) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const uuid = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : null);
const timeMs = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 86_400_000 ? Math.round(v) : null);

/** Which of these questions the caller may answer. */
async function readableIds(caller: Caller, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  if (isStaff(caller)) return new Set(ids);
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await caller.admin.rpc("readable_question_ids_for", { p_user: caller.userId, p_ids: ids.slice(i, i + 200) });
    if (error) throw error;
    for (const id of (data as string[] | null) || []) out.add(typeof id === "string" ? id : String((id as Record<string, unknown>).readable_question_ids_for ?? ""));
  }
  return out;
}

async function loadQuestions(admin: SupabaseClient, ids: string[]): Promise<Map<string, QuestionRow>> {
  const out = new Map<string, QuestionRow>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from("questions").select(QUESTION_COLUMNS).in("id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const r of (data || []) as unknown as QuestionRow[]) out.set(r.id, r);
  }
  return out;
}

/** Right answers in a row at the end of this session, from the answer log. */
async function sessionRun(admin: SupabaseClient, userId: string, sessionId: string | null): Promise<number> {
  if (!sessionId) return 0;
  const { data } = await admin.from("answer_log").select("correct")
    .eq("user_id", userId).eq("session_id", sessionId)
    .order("answered_at", { ascending: false }).limit(25);
  let run = 0;
  for (const r of (data || []) as { correct: boolean }[]) {
    if (!r.correct) break;
    run++;
  }
  return run;
}

async function answeredRightRecently(admin: SupabaseClient, userId: string, questionId: string): Promise<boolean> {
  const { data } = await admin.from("answer_log").select("id")
    .eq("user_id", userId).eq("question_id", questionId).eq("correct", true)
    .gte("answered_at", new Date(Date.now() - REPEAT_XP_WINDOW_MS).toISOString()).limit(1);
  return !!data?.length;
}

async function recordAnswer(admin: SupabaseClient, userId: string, questionId: string, correct: boolean, selected: number | null, sessionId: string | null, ms: number | null) {
  const { error } = await admin.rpc("record_answer_for", {
    p_user: userId, p_question_id: questionId, p_correct: correct,
    p_selected: selected, p_session_id: sessionId, p_time_ms: ms,
  });
  if (error) throw error;
}

type ProfileFields = { xp: number; streak: number; best_streak: number; recent_correct: number; recent_answers: number };

async function awardXP(admin: SupabaseClient, userId: string, xp: number, correct: boolean | null): Promise<ProfileFields | null> {
  const { data, error } = await admin.rpc("award_xp_for", { p_user: userId, p_xp_earned: xp, p_correct: correct });
  if (error) {
    logger.warn({ err: error, userId }, "[answers] awarding XP failed");
    return null;
  }
  return ((Array.isArray(data) ? data[0] : data) as ProfileFields) || null;
}

/** The hold for this context, or null. */
async function getHold(admin: SupabaseClient, userId: string, context: string) {
  const { data } = await admin.from("question_holds").select("question_id, shown_at")
    .eq("user_id", userId).eq("context", context).maybeSingle<{ question_id: string; shown_at: string }>();
  return data || null;
}

type Assignment = {
  id: string; student_id: string; subject: string | null; topics: string[] | null;
  question_count: number | null; completed_at: string | null;
};

async function openAssignment(admin: SupabaseClient, userId: string, id: string | null): Promise<Assignment | null> {
  if (!id) return null;
  const { data } = await admin.from("assignments")
    .select("id, student_id, subject, topics, question_count, completed_at")
    .eq("id", id).eq("student_id", userId).maybeSingle<Assignment>();
  return data && !data.completed_at ? data : null;
}

/**
 * Whether questions belong to an assignment: in its subject, and in one of
 * its topics (assignments list subtopic names; a subject's questions borrowed
 * from another subject count under the subtopic they're filed under there).
 * Looks the subject up once and returns a test for each question.
 */
export async function assignmentMatcher(admin: SupabaseClient, a: Assignment): Promise<(q: QuestionRow) => boolean> {
  const topics = (a.topics || []).filter(Boolean);
  const { data: currs } = a.subject
    ? await admin.from("curricula").select("id").eq("name", a.subject)
    : { data: [] as { id: string }[] };
  const currIds = ((currs || []) as { id: string }[]).map((c) => c.id);

  // Subtopics of the assignment's subject that it names (all of them if it names none),
  // and the other subjects' subtopics they borrow questions from.
  let subtopicIds: string[] = [];
  let borrowed: string[] = [];
  if (currIds.length) {
    let sq = admin.from("curriculum_subtopics").select("id, name").in("curriculum_id", currIds);
    if (topics.length) sq = sq.in("name", topics);
    const { data: subs } = await sq;
    subtopicIds = ((subs || []) as { id: string }[]).map((s) => s.id);
    if (subtopicIds.length) {
      const { data: links } = await admin.from("subtopic_links").select("source_subtopic_id").in("subtopic_id", subtopicIds);
      borrowed = ((links || []) as { source_subtopic_id: string }[]).map((l) => l.source_subtopic_id);
    }
  }

  return (q) => {
    const inSubject = !currIds.length
      || (q.curriculum_id != null && currIds.includes(q.curriculum_id))
      || (q.subtopic_id != null && borrowed.includes(q.subtopic_id))
      || (!!a.subject && q.subject === a.subject);
    if (!inSubject) return false;
    if (!topics.length) return true;
    return topics.includes(q.subtopic || "") || topics.includes(q.topic || "")
      || (q.subtopic_id != null && (subtopicIds.includes(q.subtopic_id) || borrowed.includes(q.subtopic_id)));
  };
}

async function recordAssignmentAnswer(admin: SupabaseClient, userId: string, assignmentId: string, q: QuestionRow, correct: boolean, response: unknown, ms: number | null) {
  const { data, error } = await admin.rpc("record_assignment_answer_for", {
    p_user: userId, p_assignment_id: assignmentId, p_correct: correct, p_question_id: q.id,
    p_response: response === null ? null : response, p_time_ms: ms,
  });
  if (error) logger.warn({ err: error, assignmentId }, "[answers] assignment answer failed");
  return ((Array.isArray(data) ? data[0] : data) as Record<string, unknown>) || null;
}

type Marked = { correct: boolean; marks: { awarded: number; total: number } | null };

/**
 * Mark one response. Written answers must already have been marked by
 * /marked/mark (it keeps the marks per answer); null means they haven't.
 */
async function mark(caller: Caller, q: QuestionRow, response: unknown): Promise<Marked | null> {
  if (questionType(q) === "marked") {
    const answer = normalizeResponse(response);
    if (!answer) return { correct: false, marks: { awarded: 0, total: Number(q.total_marks) || 0 } };
    const { data } = await caller.admin.from("answer_markings").select("awarded, total")
      .eq("user_id", caller.userId).eq("question_id", q.id).eq("response_hash", responseHash(answer))
      .maybeSingle<{ awarded: number; total: number }>();
    if (!data) return null;
    return { correct: data.total > 0 && data.awarded >= data.total, marks: { awarded: data.awarded, total: data.total } };
  }
  return { correct: gradeResponse(q, response), marks: null };
}

// ── Present ──────────────────────────────────────────────────────────────────
// Body: { questionId, context }. The app calls this when it puts a question on
// screen. → { questionId, held }: if the student already has a question on
// screen in this context that they haven't answered, that one comes back
// (held: true) and the app shows it instead.
router.post("/answers/present", async (req, res) => {
  const caller = await requireUser(req, res);
  if (!caller) return;
  const questionId = str(req.body?.questionId);
  const context = str(req.body?.context, 200);
  if (!questionId || !context || !CONTEXT_RE.test(context)) {
    res.status(400).json({ error: "questionId and context required" });
    return;
  }
  try {
    const { admin, userId } = caller;
    const hold = await getHold(admin, userId, context);
    if (hold && hold.question_id !== questionId) {
      // Still theirs to answer: readable, and not answered since it was shown.
      const [readable, answered] = await Promise.all([
        readableIds(caller, [hold.question_id]),
        admin.from("answer_log").select("id").eq("user_id", userId).eq("question_id", hold.question_id)
          .gte("answered_at", hold.shown_at).limit(1),
      ]);
      const assignmentId = context.startsWith("assignment:") ? context.slice(11) : null;
      const assignmentOpen = !assignmentId || !!(await openAssignment(admin, userId, uuid(assignmentId)));
      if (readable.has(hold.question_id) && !answered.data?.length && assignmentOpen) {
        res.json({ questionId: hold.question_id, held: true });
        return;
      }
    }
    if (!hold || hold.question_id !== questionId) {
      if (!(await readableIds(caller, [questionId])).has(questionId)) {
        res.status(403).json({ error: "You don't have access to that question" });
        return;
      }
      const { error } = await admin.from("question_holds").upsert(
        { user_id: userId, context, question_id: questionId, shown_at: new Date().toISOString() },
        { onConflict: "user_id,context" },
      );
      if (error) throw error;
    }
    res.json({ questionId, held: false });
  } catch (err) {
    logger.error({ err }, "[answers] present failed");
    res.status(500).json({ error: "Couldn't load that question. Try again." });
  }
});

// ── Check ────────────────────────────────────────────────────────────────────
// Body: {
//   questionId, response, context?, sessionId?, timeMs?,
//   remediation?: { parentQuestionId, bankId? | variantId? | token?, complete? }
// }
// A bank question (no `remediation`): marked, recorded, XP awarded, counted
// toward the assignment when the context is one and the question is in it.
// Extra practice after a wrong answer (`remediation`): a bank question
// (bankId), a saved variant (variantId) or a just-generated one (token).
// → { correct, marks, xp, bonus, run, reveal, profile, assignment }
router.post("/answers/check", async (req, res) => {
  const caller = await requireUser(req, res);
  if (!caller) return;
  const body = (req.body || {}) as Record<string, unknown>;
  const response = cleanResponse(body.response);
  const sessionId = uuid(body.sessionId);
  const ms = timeMs(body.timeMs);
  const context = str(body.context, 200);
  if (context && !CONTEXT_RE.test(context)) {
    res.status(400).json({ error: "Bad context" });
    return;
  }
  const { admin, userId } = caller;
  const keepsRecord = userId !== "service";

  try {
    const rem = body.remediation && typeof body.remediation === "object" ? body.remediation as Record<string, unknown> : null;
    if (rem) {
      await checkRemediation(caller, rem, response, sessionId, ms, res);
      return;
    }

    const questionId = str(body.questionId);
    if (!questionId) {
      res.status(400).json({ error: "questionId required" });
      return;
    }
    const q = (await loadQuestions(admin, [questionId])).get(questionId);
    if (!q || questionType(q) === "extended") {
      res.status(404).json({ error: "That question can't be answered here." });
      return;
    }
    if (!(await readableIds(caller, [q.id])).has(q.id)) {
      res.status(403).json({ error: "You don't have access to that question" });
      return;
    }

    // The question on screen in this context is the one that can be answered.
    const hold = context && keepsRecord ? await getHold(admin, userId, context) : null;
    if (hold && hold.question_id !== q.id) {
      res.status(409).json({ code: "held", heldQuestionId: hold.question_id, error: "Finish the question you were given first." });
      return;
    }

    const marked = await mark(caller, q, response);
    if (!marked) {
      res.status(409).json({ code: "mark_first", error: "Mark this written answer first." });
      return;
    }
    const { correct, marks } = marked;
    const partMarks = !!marks && !correct && marks.awarded > 0 && marks.total > 0;

    if (!keepsRecord) {
      res.json({ correct, marks, xp: 0, bonus: 0, run: 0, reveal: revealOf(q), profile: null, assignment: null });
      return;
    }

    const [run, repeat] = await Promise.all([
      sessionRun(admin, userId, sessionId),
      correct || partMarks ? answeredRightRecently(admin, userId, q.id) : Promise.resolve(false),
    ]);
    let xp = partMarks ? partMarksXP(q.difficulty, marks!.awarded, marks!.total) : calcXP(correct, q.difficulty, run);
    if (xp > 0 && repeat) xp = 0;

    const selected = questionType(q) === "mcq" && Number.isInteger(response) ? response as number : null;
    await recordAnswer(admin, userId, q.id, correct, selected, sessionId, ms);
    const profile = await awardXP(admin, userId, xp, correct);

    let assignment: Record<string, unknown> | null = null;
    if (context?.startsWith("assignment:")) {
      const a = await openAssignment(admin, userId, uuid(context.slice(11)));
      if (a?.question_count) {
        if ((await assignmentMatcher(admin, a))(q)) {
          assignment = await recordAssignmentAnswer(admin, userId, a.id, q, correct, response, ms);
        } else {
          assignment = { counted: false, reason: "not_in_assignment" };
        }
      }
    }

    if (hold) await admin.from("question_holds").delete().eq("user_id", userId).eq("context", context!).eq("question_id", q.id);

    res.json({ correct, marks, xp, bonus: 0, run: correct ? run + 1 : 0, reveal: revealOf(q), profile, assignment });
  } catch (err) {
    logger.error({ err }, "[answers] check failed");
    res.status(500).json({ error: "Your answer couldn't be checked just now. Try again." });
  }
});

/** Extra practice after a wrong answer: marked, recorded under its bank copy, small XP. */
async function checkRemediation(
  caller: Caller, rem: Record<string, unknown>, response: unknown,
  sessionId: string | null, ms: number | null, res: import("express").Response,
) {
  const { admin, userId } = caller;
  const parentId = str(rem.parentQuestionId);
  if (!parentId) {
    res.status(400).json({ error: "parentQuestionId required" });
    return;
  }

  // What to mark, and which bank question (if any) the answer is recorded under.
  let gradable: GradableQuestion | null = null;
  let trackId: string | null = null;
  const bankId = str(rem.bankId);
  const variantId = uuid(rem.variantId);
  if (bankId) {
    const q = (await loadQuestions(admin, [bankId])).get(bankId);
    if (!q || !(await readableIds(caller, [bankId])).has(bankId)) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    gradable = q;
    trackId = q.id;
  } else if (variantId) {
    const { data: v } = await admin.from("question_variants")
      .select("id, parent_question_id, subject, question, options, answer_index, solution, tip, difficulty")
      .eq("id", variantId).maybeSingle<{ id: string; parent_question_id: string; subject: string; question: string; options: unknown; answer_index: number; solution: string | null; tip: string | null; difficulty: number }>();
    if (!v || !(await readableIds(caller, [v.parent_question_id])).has(v.parent_question_id)) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    gradable = { ...v, question_type: "mcq" };
    // A saved variant also has a bank copy (same text); answers are recorded under that.
    const { data: copy } = await admin.from("questions").select("id").eq("question", v.question).eq("subject", v.subject).limit(1);
    trackId = (copy as { id: string }[] | null)?.[0]?.id ?? null;
    admin.rpc("bump_variant_usage", { p_variant_id: v.id }).then(() => {}, () => {});
  } else {
    const sealed = unseal<SealedVariant>(VARIANT_SEAL, rem.token);
    if (!sealed || sealed.v !== 1 || (sealed.uid !== userId && !caller.isAdmin) || sealed.exp < Date.now()) {
      res.status(400).json({ error: "That practice question has expired. Carry on with the next one." });
      return;
    }
    gradable = { id: sealed.id, question_type: "mcq", options: sealed.options, answer_index: sealed.answer_index, solution: sealed.solution, tip: sealed.tip };
    // Once the answer-key check has saved it, it's in the bank under bank_id.
    const { data: saved } = await admin.from("questions").select("id").eq("id", sealed.bank_id).limit(1);
    trackId = (saved as { id: string }[] | null)?.[0]?.id ?? null;
  }

  const correct = gradeResponse(gradable, response);
  const keepsRecord = userId !== "service";

  // XP only for practice that follows a recent wrong answer to its question.
  let earns = isStaff(caller);
  if (!earns && keepsRecord) {
    const { data: miss } = await admin.from("answer_log").select("id")
      .eq("user_id", userId).eq("question_id", parentId).eq("correct", false)
      .gte("answered_at", new Date(Date.now() - REMEDIATION_WINDOW_MS).toISOString()).limit(1);
    earns = !!miss?.length;
  }

  let xp = 0;
  let bonus = 0;
  let profile: ProfileFields | null = null;
  if (keepsRecord) {
    if (trackId) await recordAnswer(admin, userId, trackId, correct, Number.isInteger(response) ? response as number : null, sessionId, ms);
    if (earns) {
      xp = remediationXP(correct);
      // Finishing the practice run: once per missed question per day.
      if (correct && rem.complete === true) {
        const { error } = await admin.from("remediation_bonuses").insert({ user_id: userId, parent_question_id: parentId });
        if (!error) bonus = REMEDIATION_BONUS;
      }
    }
    // Only practice that earns XP counts toward recent accuracy (ranks), too.
    if (earns) profile = await awardXP(admin, userId, xp + bonus, correct);
  }
  res.json({ correct, marks: null, xp, bonus, run: 0, reveal: revealOf(gradable), profile, assignment: null });
}

// ── Exam ─────────────────────────────────────────────────────────────────────
// Body: { trackId, title, sections: [{ id, name, questionIds }], answers: { [id]: response }, timeSpent: { [sectionId]: sec } }
// Marks a practice exam (Exam mode), records every question on it as
// answered, and saves the attempt. → { totalCorrect, totalQuestions, percent,
// perSection, results: { [id]: { correct, reveal } }, attemptId }
router.post("/answers/exam", async (req, res) => {
  const caller = await requireUser(req, res);
  if (!caller) return;
  const body = (req.body || {}) as Record<string, unknown>;
  const trackId = str(body.trackId, 120);
  const sections = Array.isArray(body.sections) ? body.sections.slice(0, 12) as Record<string, unknown>[] : [];
  const answers = body.answers && typeof body.answers === "object" ? body.answers as Record<string, unknown> : {};
  const timeSpent = body.timeSpent && typeof body.timeSpent === "object" ? body.timeSpent as Record<string, unknown> : {};
  if (!trackId || !sections.length) {
    res.status(400).json({ error: "trackId and sections required" });
    return;
  }
  const { admin, userId } = caller;
  try {
    const ids = [...new Set(sections.flatMap((s) => (Array.isArray(s.questionIds) ? s.questionIds : []).filter((x): x is string => typeof x === "string")))].slice(0, 300);
    const [rows, readable] = await Promise.all([loadQuestions(admin, ids), readableIds(caller, ids)]);
    const results: Record<string, { correct: boolean; reveal: Record<string, unknown> }> = {};
    let totalCorrect = 0;
    let totalQuestions = 0;
    const perSection = sections.map((s) => {
      const qids = (Array.isArray(s.questionIds) ? s.questionIds : []).filter((x): x is string => typeof x === "string" && readable.has(x) && rows.has(x));
      let correct = 0;
      for (const id of qids) {
        const q = rows.get(id)!;
        const resp = cleanResponse(answers[id]);
        const answered = resp !== null && !(Array.isArray(resp) && resp.length === 0);
        const ok = answered && questionType(q) !== "marked" && gradeResponse(q, resp);
        if (ok) correct++;
        results[id] = { correct: ok, reveal: revealOf(q) };
      }
      totalCorrect += correct;
      totalQuestions += qids.length;
      const secId = str(s.id, 80) || "";
      const sec = Number(timeSpent[secId]);
      return {
        id: secId, name: str(s.name, 120) || "", correct, total: qids.length,
        percent: qids.length ? Math.round((correct / qids.length) * 100) : 0,
        timeSec: Number.isFinite(sec) && sec >= 0 ? Math.round(sec) : null,
      };
    });
    const percent = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    let attemptId: string | null = null;
    if (userId !== "service" && totalQuestions) {
      // Every question on the paper counts as answered, so practice doesn't serve it again.
      const queue = Object.entries(results);
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const [id, r] = next;
          const resp = cleanResponse(answers[id]);
          try {
            await recordAnswer(admin, userId, id, r.correct, Number.isInteger(resp) ? resp as number : null, null, null);
          } catch (err) {
            logger.warn({ err, id }, "[answers] recording an exam answer failed");
          }
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));
      const { data, error } = await admin.from("exam_attempts").insert({
        user_id: userId, track_id: trackId, title: str(body.title, 200),
        total_correct: totalCorrect, total_questions: totalQuestions, percent, per_section: perSection,
      }).select("id").maybeSingle<{ id: string }>();
      if (error) logger.warn({ err: error }, "[answers] saving the exam attempt failed");
      attemptId = data?.id ?? null;
    }
    res.json({ totalCorrect, totalQuestions, percent, perSection, results, attemptId });
  } catch (err) {
    logger.error({ err }, "[answers] exam marking failed");
    res.status(500).json({ error: "Your exam couldn't be marked just now. Try again." });
  }
});

// ── Exam run ─────────────────────────────────────────────────────────────────
// The quiz's exam mode: questions answered one after another, marked together
// at Finish. Body: { items: [{ questionId, response, timeMs }] (answered, in
// order), questionIds (every question on it), context?, sessionId? }.
// Each answer is marked, recorded and earns XP in order (so runs of right
// answers count), and counts toward the assignment when the context is one.
// → { results: { [id]: { correct, xp } }, reveals: { [id]: reveal }, xp, run, profile, assignment }
router.post("/answers/exam-run", async (req, res) => {
  const caller = await requireUser(req, res);
  if (!caller) return;
  const body = (req.body || {}) as Record<string, unknown>;
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 100) as Record<string, unknown>[];
  const sessionId = uuid(body.sessionId);
  const context = str(body.context, 200);
  const { admin, userId } = caller;
  const keepsRecord = userId !== "service";
  try {
    const answeredIds = items.map((it) => str(it.questionId)).filter((x): x is string => !!x);
    const allIds = [...new Set([...answeredIds, ...(Array.isArray(body.questionIds) ? body.questionIds : []).filter((x): x is string => typeof x === "string")])].slice(0, 120);
    const [rows, readable] = await Promise.all([loadQuestions(admin, allIds), readableIds(caller, allIds)]);
    const reveals: Record<string, Record<string, unknown>> = {};
    for (const id of allIds) {
      const q = rows.get(id);
      if (q && readable.has(id)) reveals[id] = revealOf(q);
    }

    const a = keepsRecord && context?.startsWith("assignment:") ? await openAssignment(admin, userId, uuid(context.slice(11))) : null;
    const fits = a?.question_count ? await assignmentMatcher(admin, a) : null;

    let run = keepsRecord ? await sessionRun(admin, userId, sessionId) : 0;
    let xpTotal = 0;
    let profile: ProfileFields | null = null;
    let assignment: Record<string, unknown> | null = null;
    const results: Record<string, { correct: boolean; xp: number }> = {};
    const seen = new Set<string>();
    for (const it of items) {
      const id = str(it.questionId);
      const q = id ? rows.get(id) : undefined;
      if (!id || !q || !readable.has(id) || seen.has(id) || questionType(q) === "marked" || questionType(q) === "extended") continue;
      seen.add(id);
      const response = cleanResponse(it.response);
      const correct = gradeResponse(q, response);
      const ms = timeMs(it.timeMs);
      let xp = calcXP(correct, q.difficulty, run);
      if (keepsRecord) {
        if (xp > 0 && await answeredRightRecently(admin, userId, id)) xp = 0;
        await recordAnswer(admin, userId, id, correct, questionType(q) === "mcq" && Number.isInteger(response) ? response as number : null, sessionId, ms);
        profile = (await awardXP(admin, userId, xp, correct)) || profile;
        if (a && fits?.(q)) assignment = (await recordAssignmentAnswer(admin, userId, a.id, q, correct, response, ms)) || assignment;
      }
      run = correct ? run + 1 : 0;
      xpTotal += xp;
      results[id] = { correct, xp };
    }
    if (keepsRecord && context) await admin.from("question_holds").delete().eq("user_id", userId).eq("context", context).in("question_id", [...seen]);
    res.json({ results, reveals, xp: xpTotal, run, profile, assignment });
  } catch (err) {
    logger.error({ err }, "[answers] exam run failed");
    res.status(500).json({ error: "Your exam couldn't be marked just now. Try again." });
  }
});

// ── Tip ──────────────────────────────────────────────────────────────────────
// Body: { questionId, response }. Titan's two-sentence tip after a wrong
// answer: the mistake behind that answer and a way to remember the right one.
// The same wrong answer to the same question always gets the same tip, so each
// is written once and kept in answer_tips (migration 20261110000001); only the
// first student to give that answer costs an AI call. Only for questions the
// student has answered. → { tip, cached }
router.post("/answers/tip", async (req, res) => {
  const caller = await requireUser(req, res);
  if (!caller) return;
  const questionId = str(req.body?.questionId);
  const response = cleanResponse(req.body?.response);
  if (!questionId || response === null) {
    res.status(400).json({ error: "questionId and response required" });
    return;
  }
  const { admin, userId } = caller;
  try {
    const q = (await loadQuestions(admin, [questionId])).get(questionId);
    if (!q || questionType(q) === "marked" || questionType(q) === "extended") {
      res.status(404).json({ error: "No tip for that question." });
      return;
    }
    if (!(await readableIds(caller, [q.id])).has(q.id)) {
      res.status(403).json({ error: "You don't have access to that question" });
      return;
    }
    // The tip gives the answer away, so only after answering.
    if (!isStaff(caller)) {
      const { data: answered } = await admin.from("answer_log").select("id").eq("user_id", userId).eq("question_id", q.id).limit(1);
      if (!answered?.length) {
        res.status(403).json({ error: "Answer the question first." });
        return;
      }
    }
    const key = questionType(q) === "mcq" && Number.isInteger(response)
      ? `mcq:${response}`
      : `r:${createHash("sha256").update(JSON.stringify(response)).digest("hex").slice(0, 32)}`;
    const { data: kept } = await admin.from("answer_tips").select("tip").eq("question_id", q.id).eq("response_key", key).maybeSingle<{ tip: string }>();
    if (kept?.tip) {
      res.json({ tip: kept.tip, cached: true });
      return;
    }
    const check = await checkAiQuota(caller, false);
    if ("blocked" in check) {
      res.json({ tip: "", cached: false });
      return;
    }

    const { data: full } = await admin.from("questions").select("question").eq("id", q.id).maybeSingle<{ question: string }>();
    const options = Array.isArray(q.options) ? (q.options as unknown[]).map(String) : [];
    const correct = questionType(q) === "mcq" && q.answer_index != null ? options[q.answer_index] ?? "" : JSON.stringify(revealOf(q).answer ?? revealOf(q).accept ?? revealOf(q).items ?? revealOf(q).answer_indices ?? "");
    const given = questionType(q) === "mcq" && Number.isInteger(response) ? options[response as number] ?? "" : JSON.stringify(response);
    const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
    const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
    const ai = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        thinking: CLAUDE_THINKING,
        max_tokens: 200,
        system: `You are a ${q.subject || "school"} tutor. Write exactly 2 sentences: one explaining the conceptual mistake, one giving a memory trick. No markdown. No preamble. Write any maths in LaTeX inside $...$.`,
        messages: [{ role: "user", content: `Topic: ${q.topic} — ${q.subtopic}\nQ: ${full?.question || ""}\nCorrect answer: ${correct}\nStudent answered: ${given}\nSolution: ${q.solution || ""}` }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!ai.ok) throw new Error(`Claude API error ${ai.status}`);
    const data = (await ai.json()) as { content?: { type: string; text?: string }[] };
    const tip = (data.content?.find((b) => b.type === "text")?.text || "").trim().slice(0, 1000);
    if (tip) {
      const { error } = await admin.from("answer_tips").upsert({ question_id: q.id, response_key: key, tip }, { onConflict: "question_id,response_key", ignoreDuplicates: true });
      if (error) logger.warn({ err: error, questionId: q.id }, "[answers] saving a tip failed");
    }
    res.json({ tip, cached: false });
  } catch (err) {
    logger.warn({ err }, "[answers] tip failed");
    res.json({ tip: "", cached: false });
  }
});

// ── Solutions ────────────────────────────────────────────────────────────────
// Body: { questionIds }. Answers and solutions for questions on an exam the
// student built (the exam builder's solutions pages). Tutors and admins get
// them all; students get them for questions they've already answered and for
// questions from real past or trial papers. → { solutions: { [id]: reveal } }
router.post("/answers/solutions", async (req, res) => {
  const caller = await requireUser(req, res);
  if (!caller) return;
  const ids = (Array.isArray(req.body?.questionIds) ? req.body.questionIds : [])
    .filter((x: unknown): x is string => typeof x === "string" && x.length <= 200).slice(0, 300);
  try {
    const { admin, userId } = caller;
    const [rows, readable] = await Promise.all([loadQuestions(admin, ids), readableIds(caller, ids)]);
    let answered = new Set<string>();
    if (!isStaff(caller)) {
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await admin.from("struggle_profiles").select("question_id").eq("user_id", userId).in("question_id", ids.slice(i, i + 200));
        for (const r of (data || []) as { question_id: string }[]) answered = answered.add(r.question_id);
      }
    }
    const solutions: Record<string, Record<string, unknown>> = {};
    for (const [id, q] of rows) {
      if (!readable.has(id)) continue;
      const pastPaper = q.source_kind === "official" || q.source_kind === "commercial";
      if (isStaff(caller) || pastPaper || answered.has(id)) solutions[id] = revealOf(q);
    }
    res.json({ solutions });
  } catch (err) {
    logger.error({ err }, "[answers] solutions failed");
    res.status(500).json({ error: "Couldn't load the solutions just now." });
  }
});

export default router;
