import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { studentSolution, verifyQuestionPayload, withStimulus, type Verdict } from "../lib/verify-question";
import { logger } from "../lib/logger";
import { requireUser } from "../lib/auth";
import { generateForTopic } from "./generate-questions";
import { buildQuestionUpdate, parseOptions } from "../lib/question-edit";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

function getAdmin() {
  return createClient(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
}

async function requireAdmin(req: any, res: any) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const adminDb = getAdmin();
  const { data: caller } = await adminDb.auth.getUser(auth.slice(7));
  if (!caller?.user) { res.status(401).json({ error: "Invalid token" }); return null; }
  const { data: profile } = await adminDb.from("profiles").select("is_admin").eq("id", caller.user.id).single();
  if (!profile?.is_admin) { res.status(403).json({ error: "Forbidden" }); return null; }
  return { adminDb, userId: caller.user.id };
}

// ── AI verification ───────────────────────────────────────────────────────────

async function verifyQuestion(questionId: string): Promise<Verdict> {
  const adminDb = getAdmin();
  const { data: q } = await adminDb.from("questions").select("*").eq("id", questionId).single();
  if (!q) throw new Error(`Question ${questionId} not found`);

  const options: string[] = typeof q.options === "string" ? JSON.parse(q.options) : (q.options || []);
  let passage: string | null = null;
  if (q.passage_id) {
    const { data: p } = await adminDb.from("passages").select("body").eq("id", q.passage_id).maybeSingle();
    passage = (p as { body?: string } | null)?.body ?? null;
  }
  return verifyQuestionPayload({ question: withStimulus(q.question, passage), options, answer_index: q.answer_index });
}

async function getTopicCode(
  adminDb: ReturnType<typeof getAdmin>,
  subject: string,
  subtopicName: string,
): Promise<string | null> {
  const { data: curr } = await adminDb.from("curricula").select("id").eq("name", subject).maybeSingle();
  if (!curr?.id) return null;
  const { data: topics } = await adminDb
    .from("curriculum_topics").select("id").eq("curriculum_id", curr.id).order("order_index");
  if (!topics?.length) return null;
  for (let ti = 0; ti < topics.length; ti++) {
    const { data: subs } = await adminDb
      .from("curriculum_subtopics").select("name").eq("topic_id", topics[ti].id).order("order_index");
    if (!subs) continue;
    const si = subs.findIndex((s: any) => s.name.toLowerCase().trim() === subtopicName.toLowerCase().trim());
    if (si >= 0) return `T${ti + 1}.${si + 1}`;
  }
  return null;
}

async function resolveReport(reportId: string, questionId: string) {
  const adminDb = getAdmin();
  try {
    await adminDb.from("question_reports").update({ ai_status: "processing" }).eq("id", reportId);

    // Already removed (e.g. an earlier run deleted it) — nothing left to verify.
    const { data: existing } = await adminDb.from("questions").select("id").eq("id", questionId).maybeSingle();
    if (!existing) {
      await adminDb.from("question_reports").update({
        ai_status: "deleted",
        resolved_at: new Date().toISOString(),
        resolution_note: "Question no longer exists in the bank",
      }).eq("id", reportId);
      return;
    }

    const verdict = await verifyQuestion(questionId);

    if (verdict.verdict === "correct") {
      await adminDb.from("question_reports").update({
        ai_status: "dismissed",
        ai_verdict: verdict,
        resolved_at: new Date().toISOString(),
        resolution_note: "AI confirmed the marked answer is correct",
      }).eq("id", reportId);
      return;
    }

    // A corrected key needs working that agrees with it; without a usable
    // student solution the question is handled like a flawed one below.
    const solution = verdict.verdict === "wrong_answer" ? studentSolution(verdict) : null;
    if (verdict.verdict === "wrong_answer" && verdict.correct_index != null && solution) {
      await adminDb.from("questions").update({ answer_index: verdict.correct_index, solution }).eq("id", questionId);
      await adminDb.from("question_reports").update({
        ai_status: "fixed_index",
        ai_verdict: verdict,
        resolved_at: new Date().toISOString(),
        resolution_note: `answer_index updated to ${verdict.correct_index}`,
      }).eq("id", reportId);
      return;
    }

    if (verdict.verdict === "wrong_question" || verdict.verdict === "wrong_answer") {
      const { data: q } = await adminDb
        .from("questions").select("subject, topic, subtopic, difficulty").eq("id", questionId).single();

      if (q?.subject && q?.subtopic) {
        const topicCode = await getTopicCode(adminDb, q.subject, q.subtopic);
        if (topicCode) {
          await adminDb.from("questions").delete().eq("id", questionId);
          // Generate in-process: a localhost HTTP call to /api/generate-questions
          // isn't routable on Vercel and failed with "fetch failed" after the
          // question had already been deleted.
          let regenerated = false;
          try {
            const gen = await generateForTopic({
              adminDb, resolvedSubject: q.subject, topicCode, count: 1,
              difficulty: q.difficulty || 3, autoApprove: true,
            });
            regenerated = gen.status === 200;
            if (!regenerated) logger.warn({ reportId, questionId, body: gen.body }, "[report-question] regeneration failed");
          } catch (err) {
            logger.error({ err, reportId, questionId }, "[report-question] regeneration failed");
          }
          const note = regenerated ? "Question deleted and 1 replacement generated" : "Question deleted; regeneration failed";
          await adminDb.from("question_reports").update({
            ai_status: "regenerated",
            ai_verdict: verdict,
            resolved_at: new Date().toISOString(),
            resolution_note: note,
          }).eq("id", reportId);
          return;
        }
      }

      // No topic code — delete only
      await adminDb.from("questions").delete().eq("id", questionId);
      await adminDb.from("question_reports").update({
        ai_status: "deleted",
        ai_verdict: verdict,
        resolved_at: new Date().toISOString(),
        resolution_note: "Question deleted; could not regenerate (topic code not found)",
      }).eq("id", reportId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, reportId, questionId }, "[report-question] AI verification failed");
    await adminDb.from("question_reports").update({
      ai_status: "error",
      resolution_note: msg,
      resolved_at: new Date().toISOString(),
    }).eq("id", reportId);
  }
}

// ── POST /api/report-question ─────────────────────────────────────────────────

router.post("/report-question", async (req, res) => {
  const caller = await requireUser(req, res);
  if (!caller) return;
  const { questionId } = req.body as { questionId?: string };
  if (!questionId) { res.status(400).json({ error: "questionId required" }); return; }

  const adminDb = getAdmin();
  const { data: report, error } = await adminDb
    .from("question_reports")
    .insert({ question_id: questionId, ai_status: "pending", reported_by: caller.userId === "service" ? null : caller.userId })
    .select("id")
    .single();

  if (error || !report) {
    logger.error({ error }, "[report-question] insert failed");
    res.status(500).json({ error: "Failed to create report" });
    return;
  }

  // Await before responding so Vercel doesn't freeze the container mid-verification
  await resolveReport(report.id, questionId);
  res.status(200).json({ ok: true, reportId: report.id });
});

// ── POST /api/bulk-scan-questions (admin only) ────────────────────────────────

router.post("/bulk-scan-questions", async (req, res) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { adminDb, userId } = ctx;

  const { subject, limit = 50 } = req.body as { subject?: string; limit?: number };

  // Skip questions already being processed
  const { data: inFlight } = await adminDb
    .from("question_reports").select("question_id").in("ai_status", ["pending", "processing"]);
  const skipIds = (inFlight || []).map((r: any) => r.question_id);

  let query = adminDb.from("questions").select("id").limit(Math.min(Number(limit), 200));
  if (subject) query = (query as any).eq("subject", subject);
  if (skipIds.length) query = (query as any).not("id", "in", `(${skipIds.map((id: string) => `"${id}"`).join(",")})`);

  const { data: questions } = await query;
  if (!questions?.length) {
    res.status(200).json({ ok: true, queued: 0, message: "No questions to scan" });
    return;
  }

  const rows = questions.map((q: any) => ({ question_id: q.id, reported_by: userId, ai_status: "pending" }));
  const { data: reports, error } = await adminDb.from("question_reports").insert(rows).select("id, question_id");
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Run sequentially before responding — Vercel can't freeze mid-loop this way.
  // The client shows a spinner until done; bulk scan is an admin-only operation.
  for (const r of (reports || [])) {
    await resolveReport(r.id, r.question_id);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  res.status(200).json({ ok: true, queued: reports?.length ?? 0 });
});

// ── POST /api/retry-pending-reports (admin only) ─────────────────────────────

router.post("/retry-pending-reports", async (req, res) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { adminDb } = ctx;

  const { limit = 20 } = req.body as { limit?: number };

  const { data: stuck } = await adminDb
    .from("question_reports")
    .select("id, question_id")
    .in("ai_status", ["pending", "error"])
    .limit(Math.min(Number(limit), 50));

  if (!stuck?.length) {
    res.status(200).json({ ok: true, retried: 0, message: "No stuck reports found" });
    return;
  }

  // Reset to pending so resolveReport picks them up cleanly
  for (const r of stuck) {
    await adminDb.from("question_reports").update({ ai_status: "pending" }).eq("id", r.id);
    await resolveReport(r.id, r.question_id);
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  res.status(200).json({ ok: true, retried: stuck.length });
});

// ── POST /api/question-reports/:id/resolve (admin only) ──────────────────────
// An admin settles a report by hand. Body:
//   { action: "dismiss" }                      the question is right as it is
//   { action: "set_answer", answerIndex }      change its answer key
//   { action: "edit", question, options, answerIndex, solution, difficulty }
//                                              rewrite it (any of those fields)
//   { action: "delete" }                       take it out of the bank
//   { action: "recheck" }                      run the AI check on it again
// Every open report on the same question is settled together.

router.post("/question-reports/:id/resolve", async (req, res) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { adminDb } = ctx;

  const { data: report } = await adminDb
    .from("question_reports").select("id, question_id").eq("id", req.params.id).maybeSingle();
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  const body = (req.body || {}) as {
    action?: string; answerIndex?: number; question?: string; options?: unknown;
    solution?: string; difficulty?: number;
  };
  const { action } = body;

  // Close this report and any other open report on the same question.
  const settle = async (ai_status: string, resolution_note: string) => {
    const { error } = await adminDb.from("question_reports")
      .update({ ai_status, resolution_note, resolved_at: new Date().toISOString() })
      .eq("question_id", report.question_id)
      .or(`id.eq.${report.id},resolved_at.is.null,ai_status.eq.error`);
    return error;
  };

  if (action === "recheck") {
    await adminDb.from("question_reports").update({ ai_status: "pending", resolved_at: null }).eq("id", report.id);
    await resolveReport(report.id, report.question_id);
    const { data: after } = await adminDb.from("question_reports").select("*").eq("id", report.id).single();
    res.status(200).json({ ok: true, report: after });
    return;
  }

  if (action === "dismiss") {
    const error = await settle("dismissed", "Dismissed by an admin");
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  const { data: q } = await adminDb.from("questions").select("id, options").eq("id", report.question_id).maybeSingle();
  if (!q) { res.status(404).json({ error: "The question is no longer in the bank" }); return; }
  const current = parseOptions(q.options);

  if (action === "delete") {
    const { error: dErr } = await adminDb.from("questions").delete().eq("id", report.question_id);
    if (dErr) { res.status(500).json({ error: dErr.message }); return; }
    const error = await settle("deleted", "Removed from the bank by an admin");
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (action === "set_answer" || action === "edit") {
    if (action === "set_answer" && body.answerIndex === undefined) { res.status(400).json({ error: "answerIndex required" }); return; }
    const built = buildQuestionUpdate(current, action === "set_answer" ? { answerIndex: body.answerIndex } : body);
    if ("error" in built) { res.status(400).json({ error: built.error }); return; }
    const { update } = built;

    const { error: qErr } = await adminDb.from("questions").update(update).eq("id", report.question_id);
    if (qErr) { res.status(500).json({ error: qErr.message }); return; }
    const error = action === "set_answer"
      ? await settle("fixed_index", `Answer set to option ${String.fromCharCode(65 + (update.answer_index as number))} by an admin`)
      : await settle("edited", "Question edited by an admin");
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ error: "action must be dismiss, set_answer, edit, delete or recheck" });
});

// ── GET /api/question-flags (admin only) ──────────────────────────────────────
// Students' flags (Too easy, Too hard, Confusing, Typo), one row per question
// with a count for each flag, most recent first.

router.get("/question-flags", async (req, res) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { adminDb } = ctx;

  const { data: flags, error } = await adminDb
    .from("question_flags").select("question_id, flag_type, created_at")
    .order("created_at", { ascending: false }).limit(2000);
  if (error) { res.status(500).json({ error: error.message }); return; }

  const byQuestion = new Map<string, { question_id: string; counts: Record<string, number>; total: number; last_at: string }>();
  for (const f of (flags || []) as { question_id: string; flag_type: string; created_at: string }[]) {
    const e = byQuestion.get(f.question_id) || { question_id: f.question_id, counts: {}, total: 0, last_at: f.created_at };
    e.counts[f.flag_type] = (e.counts[f.flag_type] || 0) + 1;
    e.total++;
    if (f.created_at > e.last_at) e.last_at = f.created_at;
    byQuestion.set(f.question_id, e);
  }
  const ids = [...byQuestion.keys()];
  const questions: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data: qs } = await adminDb.from("questions")
      .select("id, subject, topic, subtopic, question, options, answer_index, solution, difficulty")
      .in("id", ids.slice(i, i + 200));
    (qs || []).forEach((q: any) => { questions[q.id] = q; });
  }
  const rows = [...byQuestion.values()]
    .map(e => ({ ...e, questions: questions[e.question_id] ?? null }))
    .sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
  res.status(200).json({ flags: rows });
});

// ── POST /api/question-flags/clear (admin only) ───────────────────────────────
// Clears every flag on a question once an admin has dealt with it.

router.post("/question-flags/clear", async (req, res) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { questionId } = (req.body || {}) as { questionId?: string };
  if (!questionId) { res.status(400).json({ error: "questionId required" }); return; }
  const { error } = await ctx.adminDb.from("question_flags").delete().eq("question_id", questionId);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(200).json({ ok: true });
});

// ── GET /api/question-reports (admin only) ────────────────────────────────────

router.get("/question-reports", async (req, res) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { adminDb } = ctx;

  const status = (req.query.status as string) || "all";
  let query = adminDb
    .from("question_reports")
    .select("*")
    .order("reported_at", { ascending: false })
    .limit(200);

  if (status !== "all") query = (query as any).eq("ai_status", status);

  const { data: reports, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Fetch related questions separately (no FK defined, can't use embedded select)
  const questionIds = [...new Set((reports || []).map((r: any) => r.question_id).filter(Boolean))];
  let questionsMap: Record<string, any> = {};
  if (questionIds.length) {
    const { data: qs } = await adminDb
      .from("questions")
      .select("id, subject, topic, subtopic, question, options, answer_index, difficulty")
      .in("id", questionIds);
    (qs || []).forEach((q: any) => { questionsMap[q.id] = q; });
  }

  // Who reported each one: a student from the quiz, or an admin's AI check.
  const reporterIds = [...new Set((reports || []).map((r: any) => r.reported_by).filter(Boolean))];
  const reporters: Record<string, { name: string | null; is_admin: boolean }> = {};
  if (reporterIds.length) {
    const { data: ps } = await adminDb.from("profiles").select("id, display_name, is_admin").in("id", reporterIds);
    (ps || []).forEach((p: any) => { reporters[p.id] = { name: p.display_name, is_admin: !!p.is_admin }; });
  }

  const enriched = (reports || []).map((r: any) => ({
    ...r,
    questions: questionsMap[r.question_id] ?? null,
    reporter: r.reported_by ? reporters[r.reported_by] ?? null : null,
    source: r.reported_by && reporters[r.reported_by]?.is_admin ? "check" : "student",
  }));

  res.status(200).json({ reports: enriched });
});

export default router;
