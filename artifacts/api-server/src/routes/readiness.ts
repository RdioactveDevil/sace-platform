import { Router, type Request, type Response } from "express";
import { createHmac, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "../lib/auth";
import { appUrl, getResend, sendEmail } from "../lib/email";
import {
  CHECK_SUBJECTS, CHECK_YEARS, buildReport, pickCheckQuestions, readinessEmail,
  type CheckSubject, type MarkQuestion, type PoolQuestion, type ReadinessReport,
} from "../lib/readiness";
import { logger } from "../lib/logger";

/**
 * The free readiness check (/readiness-check), for parents without an account.
 *
 *   POST /readiness/start          { parentEmail, childName, yearLevel, subject, updates }
 *                                  → { token, questions }
 *   GET  /readiness/:token         → the questions while it's in progress, the report once done
 *   POST /readiness/:token/submit  { answers: { <question id>: <option index> } }
 *                                  → the report; also emailed to the parent
 *
 * The token is the only key, so the answer keys never leave the server until
 * the check is marked. Rate limits are counted from the table itself, since
 * the API runs as serverless functions with no shared memory.
 */

const router = Router();

const fail = (res: Response, status: number, error: string) => void res.status(status).json({ error });

/** Checks one email address can start in a day. */
const PER_EMAIL_PER_DAY = 5;
/** Checks one IP address can start in an hour (a school or library shares one). */
const PER_REQUESTER_PER_HOUR = 20;
/** How long a started check can be finished. */
const CHECK_TTL_MS = 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;
const NAME_RE = /^[\p{L}][\p{L}' -]{0,39}$/u;

type CheckRow = {
  id: string;
  token: string;
  parent_email: string;
  child_name: string;
  year_level: string;
  subject: string;
  question_ids: string[];
  report: ReadinessReport | null;
  created_at: string;
  completed_at: string | null;
  report_emailed_at: string | null;
};

const CHECK_COLS = "id, token, parent_email, child_name, year_level, subject, question_ids, report, created_at, completed_at, report_emailed_at";

/** HMAC of the caller's IP: enough to rate-limit, without storing the address. */
function requesterHash(req: Request): string | null {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  const ip = forwarded || req.socket.remoteAddress || "";
  const secret = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ip || !secret) return null;
  return createHmac("sha256", secret).update(`readiness:${ip}`).digest("base64url");
}

const subjectKey = (bankSubject: string): CheckSubject =>
  bankSubject === CHECK_SUBJECTS.english.subject ? "english" : "maths";

/** The questions as the child sees them: no answer key, solution or tip. */
async function questionsForChild(admin: SupabaseClient, ids: string[]) {
  const { data, error } = await admin
    .from("questions")
    .select("id, topic, difficulty, question, options, graph, diagram, table_data, passage:passages(id, title, kind, body)")
    .in("id", ids);
  if (error) throw new Error(error.message);
  const byId = new Map((data ?? []).map((q) => [q.id as string, q]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function loadCheck(admin: SupabaseClient, token: string): Promise<CheckRow | null> {
  if (!TOKEN_RE.test(token)) return null;
  const { data, error } = await admin.from("readiness_checks").select(CHECK_COLS).eq("token", token).maybeSingle();
  if (error) throw new Error(error.message);
  return data as CheckRow | null;
}

function done(check: CheckRow) {
  return {
    status: "completed" as const,
    childName: check.child_name,
    yearLevel: check.year_level,
    subject: subjectKey(check.subject),
    parentEmail: check.parent_email,
    emailed: !!check.report_emailed_at,
    report: check.report,
  };
}

router.post("/readiness/start", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const parentEmail = String(body.parentEmail ?? "").trim().toLowerCase();
  const childName = String(body.childName ?? "").trim().replace(/\s+/g, " ");
  const yearLevel = String(body.yearLevel ?? "");
  const subject = String(body.subject ?? "") as CheckSubject;

  if (!EMAIL_RE.test(parentEmail) || parentEmail.length > 254) return fail(res, 400, "Enter a valid email address.");
  if (!NAME_RE.test(childName)) return fail(res, 400, "Enter your child's first name (letters only).");
  if (!(CHECK_YEARS as readonly string[]).includes(yearLevel)) return fail(res, 400, "Choose your child's year level.");
  if (!(subject in CHECK_SUBJECTS)) return fail(res, 400, "Choose Maths or English.");
  if (body.parentConfirmed !== true) return fail(res, 400, "Please confirm you're their parent or guardian.");

  try {
    const admin = getServiceClient();
    const requester = requesterHash(req);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [byEmail, byRequester] = await Promise.all([
      admin.from("readiness_checks").select("id", { count: "exact", head: true }).eq("parent_email", parentEmail).gte("created_at", dayAgo),
      requester
        ? admin.from("readiness_checks").select("id", { count: "exact", head: true }).eq("requester_hash", requester).gte("created_at", hourAgo)
        : Promise.resolve({ count: 0, error: null }),
    ]);
    if (byEmail.error || byRequester.error) throw new Error((byEmail.error ?? byRequester.error)!.message);
    if ((byEmail.count ?? 0) >= PER_EMAIL_PER_DAY) {
      return fail(res, 429, `You've started ${PER_EMAIL_PER_DAY} checks with this email today. Carry on with one you've started on this device, or try again tomorrow.`);
    }
    if ((byRequester.count ?? 0) >= PER_REQUESTER_PER_HOUR) return fail(res, 429, "Too many checks from here just now. Try again in an hour.");

    const bankSubject = CHECK_SUBJECTS[subject].subject;
    const { data: pool, error: poolErr } = await admin
      .from("questions")
      .select("id, topic, difficulty, passage_id")
      .eq("subject", bankSubject)
      .eq("question_type", "mcq")
      .not("answer_index", "is", null)
      .is("image_url", null);
    if (poolErr) throw new Error(poolErr.message);
    const picked = pickCheckQuestions(subject, (pool ?? []) as PoolQuestion[]);
    if (picked.length < 10) throw new Error(`only ${picked.length} questions for ${bankSubject}`);
    const questionIds = picked.map((q) => q.id);

    const token = randomBytes(24).toString("base64url");
    const { error: insErr } = await admin.from("readiness_checks").insert({
      token, parent_email: parentEmail, child_name: childName, year_level: yearLevel, subject: bankSubject,
      question_ids: questionIds, requester_hash: requester, updates_opt_in: body.updates === true,
    });
    if (insErr) throw new Error(insErr.message);

    res.json({ token, childName, subject, questions: await questionsForChild(admin, questionIds) });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "readiness: start failed");
    fail(res, 500, "We couldn't start the check just now. Please try again.");
  }
});

router.get("/readiness/:token", async (req: Request, res: Response) => {
  try {
    const admin = getServiceClient();
    const check = await loadCheck(admin, String(req.params.token));
    if (!check) return fail(res, 404, "We couldn't find that check. The link may be incomplete.");
    if (check.completed_at) return void res.json(done(check));
    if (Date.now() - Date.parse(check.created_at) > CHECK_TTL_MS) return fail(res, 410, "This check has expired. Start a new one; it only takes two minutes to set up.");
    res.json({
      status: "in_progress",
      childName: check.child_name,
      subject: subjectKey(check.subject),
      questions: await questionsForChild(admin, check.question_ids),
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "readiness: load failed");
    fail(res, 500, "We couldn't load the check just now. Please try again.");
  }
});

router.post("/readiness/:token/submit", async (req: Request, res: Response) => {
  const answers = (req.body as { answers?: unknown } | undefined)?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return fail(res, 400, "Missing answers.");

  try {
    const admin = getServiceClient();
    const check = await loadCheck(admin, String(req.params.token));
    if (!check) return fail(res, 404, "We couldn't find that check.");
    // Submitted twice (a double tap, or a retry after a dropped connection).
    if (check.completed_at) return void res.json(done(check));
    if (Date.now() - Date.parse(check.created_at) > CHECK_TTL_MS) return fail(res, 410, "This check has expired. Start a new one; it only takes two minutes to set up.");

    const { data, error } = await admin
      .from("questions")
      .select("id, topic, difficulty, question, options, answer_index, solution, passage:passages(title)")
      .in("id", check.question_ids);
    if (error) throw new Error(error.message);
    const byId = new Map((data ?? []).map((q) => [q.id as string, q]));
    const questions: MarkQuestion[] = check.question_ids.flatMap((id) => {
      const q = byId.get(id);
      if (!q || !Array.isArray(q.options) || !Number.isInteger(q.answer_index)) return [];
      const passage = q.passage as { title?: string } | { title?: string }[] | null;
      return [{
        id, topic: q.topic as string, difficulty: q.difficulty as number | null, question: q.question as string,
        options: (q.options as unknown[]).map(String), answer_index: q.answer_index as number,
        solution: (q.solution as string | null) ?? null,
        passage_title: (Array.isArray(passage) ? passage[0]?.title : passage?.title) || null,
      }];
    });
    const kept = Object.fromEntries(check.question_ids.map((id) => [id, (answers as Record<string, unknown>)[id]]));
    const report = buildReport(check.child_name, questions, kept);

    const completedAt = new Date().toISOString();
    const { data: claimed, error: upErr } = await admin
      .from("readiness_checks")
      .update({ answers: kept, report, score: report.score, max_score: report.max, completed_at: completedAt })
      .eq("id", check.id)
      .is("completed_at", null)
      .select("id");
    if (upErr) throw new Error(upErr.message);
    if (!claimed?.length) {
      // Another submit of the same check got there first.
      const latest = await loadCheck(admin, check.token);
      return void res.json(done(latest ?? check));
    }

    // Send before replying: a serverless function can be frozen once it has.
    let emailedAt: string | null = null;
    const resend = getResend();
    if (resend) {
      const label = CHECK_SUBJECTS[subjectKey(check.subject)].label;
      const { subject, content } = readinessEmail({
        childName: check.child_name, subjectLabel: label, report,
        reportUrl: `${appUrl()}/readiness-check/report/${check.token}`,
      });
      const sent = await sendEmail(resend, { to: check.parent_email, subject, content, idempotencyKey: `readiness:${check.id}` });
      if (sent.error) logger.warn({ checkId: check.id, error: sent.error }, "readiness: report email failed");
      else {
        emailedAt = new Date().toISOString();
        await admin.from("readiness_checks").update({ report_emailed_at: emailedAt }).eq("id", check.id);
      }
    } else {
      logger.warn("readiness: RESEND_API_KEY not set, report not emailed");
    }

    res.json(done({ ...check, report, completed_at: completedAt, report_emailed_at: emailedAt }));
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "readiness: submit failed");
    fail(res, 500, "We couldn't mark the check just now. Your answers are saved on this device, so try again.");
  }
});

export default router;
