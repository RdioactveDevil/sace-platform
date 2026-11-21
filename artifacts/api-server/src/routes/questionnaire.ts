/**
 * The pre-call questionnaire.
 *
 * Tutor (signed in):
 *   GET/PUT /tutor/questionnaire     their master questionnaire
 * Prospect (no account; the diagnostic's token is the key):
 *   GET  /questionnaire/:token       the snapshot taken when the diagnostic was made
 *   POST /questionnaire/:token       send answers (once)
 *
 * Nothing public ever returns answers: the page only learns whether they are in.
 */
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { prospectSenderName } from "../lib/prospect-emails";
import {
  publicQuestionnaire,
  questionnaireOpen,
  snapshotFrom,
  validateAnswers,
  validateQuestionnaire,
  type Questionnaire,
} from "../lib/questionnaire";
import { getAdminClient, masterQuestionnaire, requireTutor } from "./diagnostic";

const router = Router();

router.get("/tutor/questionnaire", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    return res.json(await masterQuestionnaire(ctx.admin, ctx.tutorId));
  } catch (err) {
    logger.error({ err }, "questionnaire: couldn't load the master");
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

router.put("/tutor/questionnaire", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const body = (req.body ?? {}) as { intro?: unknown; items?: unknown };
    const v = validateQuestionnaire({ intro: body.intro, items: body.items });
    if ("error" in v) return res.status(400).json({ error: v.error });
    const q = snapshotFrom(v.questionnaire);
    const { error } = await ctx.admin
      .from("tutor_questionnaires")
      .upsert({ tutor_id: ctx.tutorId, intro: q.intro, items: q.items, updated_at: new Date().toISOString() }, { onConflict: "tutor_id" });
    if (error) throw new Error(error.message);
    return res.json({ questionnaire: q });
  } catch (err) {
    logger.error({ err }, "questionnaire: couldn't save the master");
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

type Row = {
  id: string;
  tutor_id: string;
  student_id: string | null;
  student_name: string | null;
  submitted_by_name: string | null;
  cancelled_at: string | null;
  questionnaire: Questionnaire | null;
  questionnaire_submitted_at: string | null;
};

/** The diagnostic behind a questionnaire link, its calls and whether the form is open; null = 404. */
async function load(token: string) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return null;
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("diagnostic_assessments")
    .select("id, tutor_id, student_id, student_name, submitted_by_name, cancelled_at, questionnaire, questionnaire_submitted_at")
    .eq("token", token)
    .maybeSingle<Row>();
  if (error) throw new Error(error.message);
  // Roster students' diagnostics never carry a questionnaire.
  if (!data || data.student_id || !data.questionnaire) return null;
  const { data: calls, error: callsErr } = await admin
    .from("tutoring_sessions")
    .select("status, scheduled_at, duration_minutes")
    .eq("diagnostic_id", data.id).eq("session_type", "consultation");
  if (callsErr) throw new Error(callsErr.message);
  const open = questionnaireOpen({
    cancelledAt: data.cancelled_at,
    calls: (calls ?? []) as Array<{ status: string; scheduled_at: string; duration_minutes: number }>,
    now: Date.now(),
  });
  return { admin, row: data as Row & { questionnaire: Questionnaire }, open };
}

router.get("/questionnaire/:token", async (req: Request, res: Response) => {
  try {
    const found = await load(String(req.params.token));
    if (!found) return res.status(404).json({ error: "Not found" });
    const { admin, row, open } = found;
    const { data: tutor } = await admin.from("profiles").select("display_name").eq("id", row.tutor_id).maybeSingle<{ display_name: string | null }>();
    const pub = publicQuestionnaire(row.questionnaire);
    return res.json({
      intro: pub.intro,
      items: pub.items,
      senderName: prospectSenderName(tutor?.display_name),
      studentName: (row.submitted_by_name || row.student_name || "").trim() || null,
      submitted: !!row.questionnaire_submitted_at,
      open,
    });
  } catch (err) {
    logger.error({ err }, "questionnaire: couldn't load the form");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/questionnaire/:token", async (req: Request, res: Response) => {
  try {
    const found = await load(String(req.params.token));
    if (!found) return res.status(404).json({ error: "Not found" });
    const { admin, row, open } = found;
    if (row.questionnaire_submitted_at) return res.status(409).json({ error: "These answers have already been sent." });
    if (!open) return res.status(410).json({ error: "This questionnaire is closed." });
    const v = validateAnswers(row.questionnaire, (req.body as { answers?: unknown } | undefined)?.answers);
    if ("error" in v) return res.status(400).json({ error: v.error });
    const { data: stored, error } = await admin
      .from("diagnostic_assessments")
      .update({ questionnaire_answers: v.answers, questionnaire_submitted_at: new Date().toISOString() })
      .eq("id", row.id).is("questionnaire_submitted_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!stored?.length) return res.status(409).json({ error: "These answers have already been sent." });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "questionnaire: couldn't save answers");
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
