import { Router, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL, CLAUDE_THINKING } from "../lib/anthropic-model";
import { EMAIL_FROM, appUrl, escapeHtml, getResend } from "../lib/email";
import { logger } from "../lib/logger";
import { rosterTutorIds, tutorsToNotify } from "../lib/student-tutors";

// Assignment reports: what a student did on a tutor's assignment, question by
// question, with an AI write-up for the tutor; and the email that tells the
// student's tutors an assignment has finished.

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

interface AuthUser { id: string; email?: string }
interface AdminAuth {
  getUser(jwt: string): Promise<{ data: { user: AuthUser | null }; error: { message: string } | null }>;
  admin: { getUserById(id: string): Promise<{ data: { user: AuthUser | null }; error: { message: string } | null }> };
}
type AdminClient = SupabaseClient & { auth: AdminAuth };

function getAdminClient(): AdminClient {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } }) as AdminClient;
}

interface Caller { admin: AdminClient; userId: string; isTutor: boolean; isAdmin: boolean }

async function getCaller(req: Request, res: Response): Promise<Caller | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(authHeader.slice(7));
  if (error || !data?.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("is_tutor, is_admin")
    .eq("id", data.user.id)
    .maybeSingle<{ is_tutor: boolean | null; is_admin: boolean | null }>();
  return { admin, userId: data.user.id, isTutor: !!profile?.is_tutor, isAdmin: !!profile?.is_admin };
}

interface AssignmentRow {
  id: string;
  tutor_id: string;
  student_id: string;
  type: string;
  subject: string;
  topics: string[];
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  question_count: number | null;
  difficulty: string;
  min_accuracy: number | null;
  pass_mode: string;
  remediation: boolean;
  progress_count: number;
  recent_results: boolean[];
  passed: boolean | null;
  report_summary: ReportSummary | null;
  tutor_notified_at: string | null;
}

interface ReportSummary {
  overview: string;
  strengths: string[];
  went_wrong: string[];
  improve: string[];
  next_steps: string[];
  generated_at: string;
}

interface QuestionRow {
  id: string;
  question: string;
  options: unknown;
  answer_index: number | null;
  question_type: string | null;
  solution: string | null;
  topic: string | null;
  subtopic: string | null;
  difficulty: number | null;
  concept_tag: string | null;
}

interface ReportAnswer {
  question_id: string | null;
  correct: boolean;
  response: unknown;
  time_taken_ms: number | null;
  answered_at: string;
  question: QuestionRow | null;
}

const ASSIGNMENT_COLUMNS =
  "id, tutor_id, student_id, type, subject, topics, due_date, created_at, completed_at, question_count, difficulty, " +
  "min_accuracy, pass_mode, remediation, progress_count, recent_results, passed, report_summary, tutor_notified_at";

/** Score over the answers that count toward the goal (the most recent question_count). */
function scoreOf(a: AssignmentRow) {
  const recent = a.recent_results ?? [];
  const correct = recent.filter(Boolean).length;
  return { correct, total: recent.length, pct: recent.length ? Math.round((correct / recent.length) * 100) : null };
}

/** The assignment, if the caller is its tutor, has the student on their roster, or is an admin. */
async function loadForTutor(caller: Caller, id: string, res: Response): Promise<AssignmentRow | null> {
  if (!caller.isTutor && !caller.isAdmin) {
    res.status(403).json({ error: "Forbidden: caller is not a tutor" });
    return null;
  }
  const { data: a, error } = await caller.admin
    .from("assignments").select(ASSIGNMENT_COLUMNS).eq("id", id).maybeSingle<AssignmentRow>();
  if (error) { res.status(500).json({ error: error.message }); return null; }
  if (!a) { res.status(404).json({ error: "Assignment not found." }); return null; }
  if (!caller.isAdmin && a.tutor_id !== caller.userId) {
    const { data: rostered } = await caller.admin
      .from("tutor_students").select("student_id")
      .eq("tutor_id", caller.userId).eq("student_id", a.student_id).maybeSingle();
    if (!rostered) { res.status(404).json({ error: "Assignment not found." }); return null; }
  }
  return a;
}

async function loadAnswers(admin: AdminClient, assignmentId: string): Promise<ReportAnswer[]> {
  const { data: rows } = await admin
    .from("assignment_answers")
    .select("question_id, correct, response, time_taken_ms, answered_at")
    .eq("assignment_id", assignmentId)
    .order("answered_at", { ascending: true });
  const answers = (rows ?? []) as Omit<ReportAnswer, "question">[];
  const ids = [...new Set(answers.map((r) => r.question_id).filter((x): x is string => !!x))];
  const byId = new Map<string, QuestionRow>();
  if (ids.length) {
    const { data: qs } = await admin
      .from("questions")
      .select("id, question, options, answer_index, question_type, solution, topic, subtopic, difficulty, concept_tag")
      .in("id", ids);
    for (const q of (qs ?? []) as QuestionRow[]) byId.set(q.id, q);
  }
  return answers.map((r) => ({ ...r, question: r.question_id ? byId.get(r.question_id) ?? null : null }));
}

async function displayName(admin: AdminClient, id: string, fallback: string): Promise<string> {
  const { data } = await admin.from("profiles").select("display_name").eq("id", id).maybeSingle<{ display_name: string | null }>();
  return data?.display_name || fallback;
}

/** GET /tutor/assignments/:id/report — score, every answer and the cached AI write-up. */
router.get("/tutor/assignments/:id/report", async (req: Request, res: Response) => {
  try {
    const caller = await getCaller(req, res);
    if (!caller) return;
    const a = await loadForTutor(caller, String(req.params.id), res);
    if (!a) return;
    const [answers, studentName] = await Promise.all([
      loadAnswers(caller.admin, a.id),
      displayName(caller.admin, a.student_id, "Student"),
    ]);
    const { report_summary, tutor_notified_at: _n, ...assignment } = a;
    return res.json({
      assignment,
      student: { id: a.student_id, name: studentName },
      score: scoreOf(a),
      answers,
      summary: report_summary,
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// ── AI write-up ──────────────────────────────────────────────────────────────

function optionText(q: QuestionRow, index: unknown): string | null {
  const opts = Array.isArray(q.options) ? q.options : null;
  return opts && typeof index === "number" && opts[index] != null ? String(opts[index]) : null;
}

function describeAnswer(r: ReportAnswer, n: number): string {
  const q = r.question;
  if (!q) return `${n}. [question no longer in the bank] — ${r.correct ? "correct" : "incorrect"}`;
  const correctText = q.answer_index != null ? optionText(q, q.answer_index) : null;
  const chosen = optionText(q, r.response) ?? (r.response == null ? "—" : JSON.stringify(r.response).slice(0, 200));
  const secs = r.time_taken_ms != null ? `${Math.round(r.time_taken_ms / 1000)}s` : "time unknown";
  return [
    `${n}. [${r.correct ? "CORRECT" : "INCORRECT"}] (${q.topic ?? "?"} › ${q.subtopic ?? "?"}, difficulty ${q.difficulty ?? "?"}/5, ${secs})`,
    `   Q: ${q.question.slice(0, 600)}`,
    correctText ? `   Correct answer: ${correctText.slice(0, 200)}` : null,
    `   Student answered: ${String(chosen).slice(0, 200)}`,
    !r.correct && q.solution ? `   Worked solution: ${q.solution.slice(0, 500)}` : null,
  ].filter(Boolean).join("\n");
}

function parseSummary(text: string): Omit<ReportSummary, "generated_at"> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const o = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 6) : []);
    if (typeof o.overview !== "string") return null;
    return { overview: o.overview, strengths: list(o.strengths), went_wrong: list(o.went_wrong), improve: list(o.improve), next_steps: list(o.next_steps) };
  } catch {
    return null;
  }
}

/** POST /tutor/assignments/:id/report/summary — generate (or return the cached) AI write-up. */
router.post("/tutor/assignments/:id/report/summary", async (req: Request, res: Response) => {
  try {
    const caller = await getCaller(req, res);
    if (!caller) return;
    const a = await loadForTutor(caller, String(req.params.id), res);
    if (!a) return;
    const refresh = !!(req.body as { refresh?: boolean } | undefined)?.refresh;
    if (a.report_summary && !refresh) return res.json({ summary: a.report_summary });

    const answers = await loadAnswers(caller.admin, a.id);
    if (answers.length === 0) {
      return res.status(400).json({ error: "There are no recorded answers for this assignment yet." });
    }
    const studentName = await displayName(caller.admin, a.student_id, "the student");
    const score = scoreOf(a);
    const allCorrect = answers.filter((r) => r.correct).length;
    const passLine = a.min_accuracy == null
      ? "No pass mark was set."
      : `Pass mark ${a.min_accuracy}% (${a.pass_mode === "one_attempt" ? "one attempt" : "keep practising until passed"}): ${a.passed == null ? "not finished yet" : a.passed ? "PASSED" : "NOT PASSED"}.`;

    const system =
      "You are an experienced tutor writing a short, specific report for another tutor about one student's assignment. " +
      "Base every point on the answers given: name the topics, the kind of mistake (misconception, misread question, " +
      "careless slip, rushed, guessed) and the evidence. Be constructive and practical, in Australian English. " +
      "Write any maths in LaTeX inside $...$.";
    const user = `Assignment: ${a.type} — ${a.subject}; topics: ${(a.topics ?? []).join(", ") || a.subject}.
Student: ${studentName}. Goal: ${a.question_count ?? "?"} questions, difficulty ${a.difficulty}. ${passLine}
${a.remediation ? "Wrong answers were followed by similar practice questions (not counted below)." : "Run as a straight quiz: no help or practice questions between answers."}
Score on the counted answers: ${score.correct}/${score.total}${score.pct != null ? ` (${score.pct}%)` : ""}. All answers recorded: ${allCorrect}/${answers.length} correct.

Answers in order:
${answers.map((r, i) => describeAnswer(r, i + 1)).join("\n")}

Return ONLY a JSON object, no markdown fences:
{"overview": "2–3 sentences on how they went overall",
 "strengths": ["what they did well, with evidence"],
 "went_wrong": ["each distinct problem: the topic, what they got wrong and the likely reason"],
 "improve": ["what could have been better in how they approached the work"],
 "next_steps": ["concrete things to practise or cover in the next lesson"]}
Use 1–4 items per list; leave a list empty rather than invent something.`;

    const resp = await fetch(`${process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        thinking: CLAUDE_THINKING,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!resp.ok) {
      logger.warn({ status: resp.status, body: (await resp.text()).slice(0, 300) }, "assignment report: Claude error");
      return res.status(502).json({ error: "Couldn't write the report right now. Please try again." });
    }
    const data = (await resp.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    const parsed = parseSummary(text);
    if (!parsed) {
      logger.warn({ head: text.slice(0, 300) }, "assignment report: unparseable summary");
      return res.status(502).json({ error: "Couldn't write the report right now. Please try again." });
    }
    const summary: ReportSummary = { ...parsed, generated_at: new Date().toISOString() };
    await caller.admin.from("assignments").update({ report_summary: summary }).eq("id", a.id);
    return res.json({ summary });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// ── Tutor email when an assignment finishes ─────────────────────────────────

/** POST /assignments/:id/finished — called by the student's app once an assignment completes. */
router.post("/assignments/:id/finished", async (req: Request, res: Response) => {
  try {
    const caller = await getCaller(req, res);
    if (!caller) return;
    // Claim the notification once: only the student, only once it's complete.
    const { data: claimed, error } = await caller.admin
      .from("assignments")
      .update({ tutor_notified_at: new Date().toISOString() })
      .eq("id", String(req.params.id))
      .eq("student_id", caller.userId)
      .not("completed_at", "is", null)
      .is("tutor_notified_at", null)
      .select(ASSIGNMENT_COLUMNS)
      .maybeSingle<AssignmentRow>();
    if (error) return res.status(500).json({ error: error.message });
    if (!claimed) return res.json({ ok: true, notified: false });

    const resend = getResend();
    if (!resend) return res.json({ ok: true, notified: false });

    // The tutor who set it and every other tutor with the student on their roster.
    const roster = await rosterTutorIds(caller.admin, [claimed.student_id]);
    const tutorIds = tutorsToNotify(claimed.tutor_id, roster.get(claimed.student_id));
    const [studentName, setterName] = await Promise.all([
      displayName(caller.admin, claimed.student_id, "Your student"),
      displayName(caller.admin, claimed.tutor_id, "another tutor"),
    ]);
    const score = scoreOf(claimed);
    const outcome = claimed.passed == null ? "finished" : claimed.passed ? "passed" : "did not pass";
    const scoreText = score.pct != null ? `${score.correct}/${score.total} (${score.pct}%)` : "—";
    const markText = claimed.min_accuracy != null ? `${claimed.min_accuracy}%` : "None";
    const reportUrl = `${appUrl()}/tutor?tab=assignments&report=${encodeURIComponent(claimed.id)}`;
    const row = (label: string, value: string, color = "#f0f4ff") =>
      `<tr><td style="padding: 6px 0; color: #a3aec2; font-size: 13px; width: 110px;">${label}</td><td style="padding: 6px 0; color: ${color}; font-size: 13px; font-weight: 700;">${escapeHtml(value)}</td></tr>`;

    let notified = false;
    for (const tutorId of tutorIds) {
      const setter = tutorId === claimed.tutor_id;
      const [{ data: tutorUser }, { data: tutorProfile }] = await Promise.all([
        caller.admin.auth.admin.getUserById(tutorId),
        caller.admin.from("profiles").select("display_name, deactivated_at").eq("id", tutorId)
          .maybeSingle<{ display_name: string | null; deactivated_at: string | null }>(),
      ]);
      if (!tutorUser?.user?.email || tutorProfile?.deactivated_at) continue;
      const tutorName = tutorProfile?.display_name || "there";
      const setBy = setter ? "you set" : `${setterName} set`;

      const { error: sendErr } = await resend.emails.send({
        from: EMAIL_FROM,
        to: tutorUser.user.email,
        subject: `${studentName} ${outcome} their ${claimed.type} — ${claimed.subject}`,
        html: `
        <div style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0c1037; color: #f0f4ff; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #f1be43, #f9d87a); padding: 28px 32px;">
            <h1 style="margin: 0; font-size: 24px; color: #0c1037; font-weight: 900; letter-spacing: -0.5px;">gradefarm.</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 800; color: #f0f4ff;">Assignment ${escapeHtml(outcome)}</h2>
            <p style="margin: 0 0 24px; color: #a3aec2; font-size: 15px;">Hi ${escapeHtml(tutorName)}, ${escapeHtml(studentName)} has finished the ${escapeHtml(claimed.type.toLowerCase())} ${escapeHtml(setBy)}.</p>
            <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                ${row("Subject", claimed.subject)}
                ${row("Topics", (claimed.topics ?? []).join(", ") || claimed.subject)}
                ${row("Score", scoreText, "#f1be43")}
                ${row("Pass mark", markText)}
                ${claimed.passed != null ? row("Result", claimed.passed ? "Passed" : "Not passed", claimed.passed ? "#4ade80" : "#f87171") : ""}
              </table>
            </div>
            <a href="${reportUrl}" style="display: inline-block; background: linear-gradient(135deg, #f1be43, #f9d87a); color: #0c1037; font-weight: 800; font-size: 14px; padding: 13px 26px; border-radius: 9px; text-decoration: none;">View the report</a>
          </div>
          <div style="padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.08); color: #5a6480; font-size: 11px;">
            ${setter ? "You're receiving this because you set this assignment on gradefarm." : `You're receiving this because ${escapeHtml(studentName)} is one of your students on gradefarm.`}
          </div>
        </div>
      `,
      });
      if (sendErr) logger.warn({ err: sendErr.message, tutorId }, "assignment finished: email failed");
      else notified = true;
    }
    return res.json({ ok: true, notified });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

export default router;
