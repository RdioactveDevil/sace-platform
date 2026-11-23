import { Router, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { latexPromptRule } from "../lib/math-prompt";
import { logger } from "../lib/logger";
import { callClaude, extractJson } from "../lib/diagnostic-claude";
import { markAndStore, markAssessment, storeTimedSubmission, submitUnavailableReason, timedAnswers, type DiagnosticReport } from "../lib/diagnostic-marking";
import { waitUntil } from "@vercel/functions";
import { requireUser } from "../lib/auth";
import { requireTutorPlan } from "../lib/tutor-plan";
import { diagnosticScope, studentSummary, type ScopeTopic } from "../lib/student-diagnostic";
import { scopeOutline, subtopicFieldHint } from "../lib/diagnostic-outline";
import { signupState } from "../lib/prospect-signup";
import { DIAGNOSTIC_LIST_COLUMNS, PROSPECT_COLUMNS, canResend, diagnosticStatus, forViewer, hasNoTest, normaliseProspectEmail, resendResetFields, type ProspectRow } from "../lib/prospect-status";
import { testInput, usableGeneratedQuestions } from "../lib/new-consultation";
import { MCQ_COUNT, isEnglishOnly, sanitiseQuestionsForStudent, shuffleOptions, timeLimitFor, type DiagnosticQuestion } from "../lib/timed-diagnostic";
import { MARKED_MAX_COUNT, diagnosticShortAnswers, loadMarkedTarget, writeCheckedMarkedQuestions, type MarkedTarget } from "../lib/marked-questions";
import type { MarkPoint } from "../lib/marking";
import { prospectDiagnosticEmail, prospectLink, prospectSenderName } from "../lib/prospect-emails";
import { getResend, sendEmail } from "../lib/email";
import { DEFAULT_QUESTIONNAIRE, countRedFlags, questionnaireLinkFor, questionnaireStatus, snapshotFrom, validateQuestionnaire, type Answers, type Questionnaire } from "../lib/questionnaire";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthUser {
  id: string;
  email?: string;
}
interface SupabaseAdminAuth {
  getUser(jwt: string): Promise<{ data: { user: AuthUser | null }; error: { message: string } | null }>;
}
type AdminClient = SupabaseClient & { auth: SupabaseAdminAuth };

interface SubjectConfig {
  name: string;
  topics: string[];
  writingType?: "essay" | "paragraph";
  // A curriculum subject: its id and the subtopics chosen (none = the whole subject).
  curriculumId?: string;
  subtopicIds?: string[];
}

interface DiagnosticAssessment {
  id: string;
  token: string;
  tutor_id: string;
  student_name: string | null;
  year_level: string;
  subjects: SubjectConfig[];
  questions: DiagnosticQuestion[];
  status: "pending" | "completed";
  pre_call_form_url: string | null;
  created_at: string;
  completed_at: string | null;
  submitted_by_name: string | null;
  student_answers: Record<string, string> | null;
  report: DiagnosticReport | null;
  score_total: number | null;
  score_max: number;
  // Set for a tutor-included subject's diagnostic (lib/student-diagnostic.ts).
  student_id: string | null;
  curriculum_id: string | null;
  subtopic_ids: string[];
  generation_started_at: string | null;
  questions_ready_at: string | null;
  waived_at: string | null;
  // A link diagnostic emailed to a prospective student (lib/prospect-status.ts).
  prospect_email: string | null;
  sent_at: string | null;
  opened_at: string | null;
  started_at: string | null;
  reminded_at: string | null;
  cancelled_at: string | null;
  // A consultation's record (lib/new-consultation.ts): false until a test is added.
  has_test: boolean;
  // prospect_email is a parent's: emails to it use the parent wording.
  prospect_is_parent: boolean;
  parent_email: string | null;
  // Set for a timed (50-minute) test; null for the old untimed format.
  time_limit_minutes: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getAdminClient(): AdminClient {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  }) as AdminClient;
}

export async function requireTutor(req: Request, res: Response): Promise<{ admin: AdminClient; tutorId: string; tutorName: string; displayName: string | null; email: string | null } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const jwt = authHeader.slice(7);
  const admin = getAdminClient();

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }

  const { data: profile, error: profError } = await admin
    .from("profiles")
    .select("id, is_tutor, is_admin, display_name")
    .eq("id", userData.user.id)
    .single<{ id: string; is_tutor: boolean; is_admin: boolean | null; display_name: string | null }>();

  if (profError || !profile?.is_tutor) {
    res.status(403).json({ error: "Forbidden: caller is not a tutor" });
    return null;
  }
  if (!(await requireTutorPlan(admin, res, userData.user.id, !!profile.is_admin))) return null;

  return {
    admin, tutorId: userData.user.id, tutorName: profile.display_name ?? "Your tutor", displayName: profile.display_name?.trim() || null,
    email: userData.user.email ?? null,
  };
}

// ── Generate Questions (Claude) ────────────────────────────────────────────────

async function generateQuestions(
  yearLevel: string,
  subjects: SubjectConfig[],
  // For a curriculum subject: "- Topic: Sub; Sub" lines ("" = the whole course).
  outline?: string,
  // "timed": the multiple-choice part (20 one-mark questions) of the timed paper.
  format?: "timed",
): Promise<DiagnosticQuestion[]> {
  const englishOnly = isEnglishOnly(subjects);
  const mcqOnly = format === "timed" && !englishOnly;

  const subjectDesc = subjects.map((s) => {
    const base = outline === undefined
      ? `${s.name} — Topics: ${s.topics.join(", ")}`
      : outline
        ? `${s.name} — topics and subtopics (topic: subtopic; subtopic; …):\n${outline}\n`
        : `${s.name} — the whole course`;
    if (s.writingType) return `${base} (Writing type: ${s.writingType})`;
    return base;
  }).join("; ");

  const writingInstructions = mcqOnly
    ? `
For this ${subjects.map((s) => s.name).join("/")} assessment, write exactly ${MCQ_COUNT} multiple-choice questions, each worth 1 mark, and nothing else:
- About 7 easy, 7 moderate and 6 exam-style questions, ordered from easiest to hardest.
- Spread them across the topics and subtopics in scope rather than clustering on one.
`
    : englishOnly
    ? `
Since this is an English/Writing assessment:
- EASY (10 marks): 5 multiple-choice questions (2 marks each) on language features, grammar, punctuation, vocabulary, and literacy skills appropriate for ${yearLevel}.
- MODERATE (10 marks): 2 short-answer questions (5 marks each) requiring a written paragraph response with a specific prompt. Type = "short_answer". The correct_answer should be a detailed model paragraph answer.
- EXAM (10 marks): 1 extended writing task (10 marks) — a full essay or extended paragraph depending on year level. Type = "extended_response". The correct_answer should be a rubric/model answer guide.
`
    : `
For this ${subjects.map((s) => s.name).join("/")} assessment:
- EASY (10 marks): 5 multiple-choice questions (2 marks each) — straightforward recall and recognition.
- MODERATE (10 marks): Mix of multiple-choice (2 marks) and short-answer (3–4 marks) — application and analysis. Must total exactly 10 marks.
- EXAM (10 marks): Short-answer and/or extended short-response questions (4–5 marks each) — synthesis and exam-style reasoning. Must total exactly 10 marks.
`;

  const system = `You are an expert Australian curriculum test designer. You create high-quality diagnostic assessments aligned to the Australian Curriculum. Always return strict, parseable JSON — no markdown fences, no extra commentary.

${latexPromptRule("$$\\int_0^1 x^2\\,dx$$")}
Example question: "Given $f(x) = x^3 - 3x$, find $f'(x)$ and determine the nature of the stationary points."`;

  const user = mcqOnly ? `Create a ${MCQ_COUNT}-question multiple-choice quiz for ${yearLevel}.
Subject(s): ${subjectDesc}

${writingInstructions}

Each question object must have these exact fields:
{
  "id": <integer starting at 1>,
  "question": "<full question text with LaTeX math wrapped in $ or $$ delimiters>",
  "type": "multiple_choice",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],  (use LaTeX in options too)
  "correct_answer": "<letter e.g. 'B'>",
  "marks": 1,
  "difficulty": "easy" | "moderate" | "exam",
  "topic": "<topic name from the provided list>",
  "subtopic": "${subtopicFieldHint(outline)}",
  "solution_notes": "<brief explanation of the correct answer>"
}

STRICT RULES:
1. Exactly ${MCQ_COUNT} questions, each worth exactly 1 mark.
2. Questions must be appropriate for ${yearLevel} level, and exactly one option is correct.
3. Use real curriculum-aligned content for the given subject(s) and topics.${outline ? " Copy topic and subtopic names exactly as written in the list." : ""}
4. Exactly 4 options labelled A, B, C, D; correct_answer is a single uppercase letter.
5. ALL mathematical expressions MUST use LaTeX formatting with $ delimiters.

Return a JSON object: { "questions": [ ...array of question objects... ] }` : `Create a 30-mark diagnostic assessment for ${yearLevel}.
Subject(s): ${subjectDesc}

${writingInstructions}

Each question object must have these exact fields:
{
  "id": <integer starting at 1>,
  "question": "<full question text with LaTeX math wrapped in $ or $$ delimiters>",
  "type": "multiple_choice" | "short_answer" | "extended_response",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],  (only for multiple_choice, use LaTeX in options too)
  "correct_answer": "<letter for MC e.g. 'B', or full model answer for others>",
  "marks": <integer>,
  "difficulty": "easy" | "moderate" | "exam",
  "topic": "<topic name from the provided list>",
  "subtopic": "${subtopicFieldHint(outline)}",
  "solution_notes": "<brief explanation of the correct answer for marking>"
}

STRICT RULES:
1. Total marks across ALL questions MUST equal exactly 30.
2. Easy questions total exactly 10 marks.
3. Moderate questions total exactly 10 marks.
4. Exam questions total exactly 10 marks.
5. Questions must be appropriate for ${yearLevel} level — not too easy, not too hard.
6. Use real curriculum-aligned content for the given subject(s) and topics.${outline ? " Copy topic and subtopic names exactly as written in the list." : ""}
7. Multiple choice questions must have exactly 4 options labelled A, B, C, D.
8. correct_answer for multiple_choice must be a single uppercase letter (A/B/C/D).
9. ALL mathematical expressions MUST use LaTeX formatting with $ delimiters.

Return a JSON object: { "questions": [ ...array of question objects... ] }`;

  const raw = await callClaude(system, user, 10500, true);
  const parsed = extractJson(raw) as { questions?: DiagnosticQuestion[] } | DiagnosticQuestion[] | null;

  let questions: DiagnosticQuestion[];
  if (Array.isArray(parsed)) {
    questions = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { questions?: DiagnosticQuestion[] }).questions)) {
    questions = (parsed as { questions: DiagnosticQuestion[] }).questions;
  } else {
    throw new Error("Claude did not return valid question JSON. Please try again.");
  }

  // Text required, whole-number marks, ids from 1: what the tutor previews is what saves.
  questions = usableGeneratedQuestions(questions) as unknown as DiagnosticQuestion[];
  // The writer puts the right answer first: shuffle each MCQ's options (the key follows).
  questions = questions.map((q) => shuffleOptions(q));
  if (!questions.length) throw new Error("No questions were generated. Please try again.");

  if (mcqOnly) {
    const valid = questions
      .map((q) => validQuestion(q))
      .filter((q): q is DiagnosticQuestion => !!q && q.type === "multiple_choice")
      .map((q, i) => ({ ...q, id: i + 1, marks: 1 }));
    if (valid.length < MCQ_COUNT) throw new NotEnoughQuestions();
    return valid.slice(0, MCQ_COUNT);
  }

  return questions;
}

class NotEnoughQuestions extends Error {
  constructor() { super("Not enough questions came back. Try again."); }
}

// ── Curriculum diagnostic (tutor-included subjects) ───────────────────────────

/** Questions in a tutor-included subject's diagnostic, by section. */
const STUDENT_DIAGNOSTIC_SECTIONS = { easy: 8, moderate: 7, exam: 5 } as const;
const STUDENT_DIAGNOSTIC_QUESTIONS = 20;

const isWritingSubject = (name: string) => /english|writing|literature|essay|history|legal|humanities/i.test(name);

/** A generated question the student can actually answer and we can mark, or null. */
function validQuestion(q: Partial<DiagnosticQuestion>): DiagnosticQuestion | null {
  if (!q || typeof q.question !== "string" || !q.question.trim() || typeof q.topic !== "string") return null;
  if (!["multiple_choice", "short_answer", "extended_response"].includes(q.type ?? "")) return null;
  if (!["easy", "moderate", "exam"].includes(q.difficulty ?? "")) return null;
  const correct = String(q.correct_answer ?? "").trim();
  if (q.type === "multiple_choice" && (!Array.isArray(q.options) || q.options.length !== 4 || !/^[A-D]$/i.test(correct))) return null;
  if (!correct) return null;
  return {
    ...(q as DiagnosticQuestion),
    correct_answer: q.type === "multiple_choice" ? correct.toUpperCase() : correct,
    marks: Math.max(1, Math.round(Number(q.marks) || 1)),
  };
}

/**
 * Write a tutor-included subject's 20-question diagnostic, spread across the
 * curriculum topics and subtopics it covers. Each question carries the exact
 * topic and subtopic names, so the results point back to what to practise.
 */
async function generateCurriculumDiagnostic(subject: string, level: string, scope: ScopeTopic[]): Promise<DiagnosticQuestion[]> {
  if (!scope.length) throw new Error("This subject has no topics to build a diagnostic from yet.");
  const outline = scopeOutline(scope);
  const { easy, moderate, exam } = STUDENT_DIAGNOSTIC_SECTIONS;
  const writing = isWritingSubject(subject);

  const system = `You are an expert Australian curriculum test designer. You write diagnostic assessments that show a tutor exactly what a new student knows and where their gaps are. Always return strict, parseable JSON — no markdown fences, no extra commentary.

${latexPromptRule("$$\\int_0^1 x^2\\,dx$$")}`;

  const user = `Write a ${STUDENT_DIAGNOSTIC_QUESTIONS}-question diagnostic for a ${level} student in ${subject}, covering these topics and subtopics (topic: subtopic; subtopic; …):

${outline}

Exactly ${STUDENT_DIAGNOSTIC_QUESTIONS} questions in three sections, in this order:
- ${easy} "easy" questions: "multiple_choice", 1 mark each. Core facts, definitions and routine one-step skills.
- ${moderate} "moderate" questions: 2 marks each, "multiple_choice" or "short_answer". Applying a skill in a familiar context.
- ${exam} "exam" questions: 3 marks each, "short_answer"${writing ? ' or "extended_response" (a paragraph)' : ""}. Exam-style, multi-step reasoning.

Each question object has exactly these fields:
{
  "id": <integer starting at 1>,
  "question": "<full question text>",
  "type": "multiple_choice" | "short_answer" | "extended_response",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],  (multiple_choice only)
  "correct_answer": "<the letter for multiple_choice, else a full model answer>",
  "marks": <integer>,
  "difficulty": "easy" | "moderate" | "exam",
  "topic": "<topic name, copied exactly from the list>",
  "subtopic": "<subtopic name, copied exactly from the list>",
  "solution_notes": "<brief explanation of the correct answer, for marking>"
}

Rules:
1. Spread the questions across as many different subtopics as possible, every topic at least once. If there are more subtopics than questions, pick the most fundamental ones.
2. Copy topic and subtopic names exactly as written in the list.
3. Multiple choice: exactly 4 options labelled A–D, a single uppercase letter as correct_answer, and distractors based on common misconceptions.
4. Every question must stand alone: no diagrams, graphs or tables the student can't see.
5. Pitch each section at ${level}, as described above.
6. ALL mathematical expressions use LaTeX with $ delimiters.

Return a JSON object: { "questions": [ ... ] }`;

  const raw = await callClaude(system, user, 16000, true);
  const parsed = extractJson(raw) as { questions?: unknown } | unknown[] | null;
  const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { questions?: unknown })?.questions) ? (parsed as { questions: unknown[] }).questions : [];
  const order = { easy: 0, moderate: 1, exam: 2 } as const;
  const questions = list
    .map((q) => validQuestion(q as Partial<DiagnosticQuestion>))
    .filter((q): q is DiagnosticQuestion => !!q)
    .map((q) => shuffleOptions(q))
    .sort((a, b) => order[a.difficulty] - order[b.difficulty])
    .slice(0, STUDENT_DIAGNOSTIC_QUESTIONS)
    .map((q, i) => ({ ...q, id: i + 1 }));
  if (questions.length < 15) throw new Error("The diagnostic couldn't be written just now. Please try again.");
  return questions;
}

/** A tutor's master questionnaire (their saved one, else the default). */
export async function masterQuestionnaire(admin: AdminClient, tutorId: string): Promise<{ questionnaire: Questionnaire; isDefault: boolean }> {
  const { data, error } = await admin
    .from("tutor_questionnaires").select("intro, items").eq("tutor_id", tutorId)
    .maybeSingle<{ intro: string; items: Questionnaire["items"] }>();
  if (error) throw new Error(error.message);
  if (!data) return { questionnaire: DEFAULT_QUESTIONNAIRE, isDefault: true };
  return { questionnaire: { intro: data.intro, items: data.items }, isDefault: false };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** POST /tutor/diagnostic/generate — Preview AI-generated questions (no save) */
router.post("/tutor/diagnostic/generate", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin } = ctx;

    const { yearLevel, subjects, format } = req.body as {
      yearLevel: string;
      subjects: SubjectConfig[];
      format?: "timed";
    };

    if (!yearLevel?.trim()) return res.status(400).json({ error: "yearLevel is required" });
    if (!Array.isArray(subjects) || subjects.length === 0) return res.status(400).json({ error: "At least one subject is required" });

    const curriculumId = subjects[0]?.curriculumId;
    const outline = curriculumId
      ? scopeOutline((await diagnosticScope(admin, curriculumId, subjects[0].subtopicIds ?? [])).topics)
      : undefined;
    const timed = format === "timed" && !isEnglishOnly(subjects) ? ("timed" as const) : undefined;
    const questions = await generateQuestions(yearLevel.trim(), subjects, outline, timed);
    return res.json({ questions });
  } catch (err) {
    if (err instanceof NotEnoughQuestions) return res.status(502).json({ error: err.message });
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

/** POST /tutor/diagnostic/short-answers — Bank-format short answers for the timed paper (a curriculum subject's are saved to the bank) */
router.post("/tutor/diagnostic/short-answers", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin } = ctx;

    const { yearLevel, subject, subtopicId, topic, count } = req.body as {
      yearLevel?: string; subject?: SubjectConfig; subtopicId?: string; topic?: string; count?: number;
    };
    if (!subject || typeof subject.name !== "string" || !subject.name.trim()) return res.status(400).json({ error: "subject is required" });
    const n = Math.max(1, Math.min(MARKED_MAX_COUNT, Math.round(Number(count)) || 1));

    let target: MarkedTarget;
    if (subject.curriculumId) {
      const t = typeof subtopicId === "string" && subtopicId ? await loadMarkedTarget(admin, subtopicId) : null;
      if (!t || t.curriculumId !== subject.curriculumId) return res.status(404).json({ error: "Subtopic not found" });
      target = t;
    } else {
      const name = (typeof topic === "string" && topic.trim()) || subject.topics?.[0] || subject.name;
      target = {
        curriculumId: null, subtopicId: null, subject: subject.name,
        levelLabel: typeof yearLevel === "string" ? yearLevel.trim() : "", examContext: "", topic: name, subtopic: name,
      };
    }

    const { drafts, rejected } = await writeCheckedMarkedQuestions(admin, target, { count: n, difficulty: "mixed" });
    const questions = await diagnosticShortAnswers(admin, target, drafts);
    return res.json({ questions, rejected: rejected.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});


// The link shown to the tutor to copy (from the page they're on). Emailed links use prospectLink().
const linkFor = (req: Request, token: string) =>
  `${req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "https://app.gradefarm.com.au"}/diagnostic/${token}`;

/**
 * Email a link diagnostic to the prospect and record when. The sender is named
 * in full and never called their tutor: they aren't, until after the call.
 * When the prospect's address is a parent's (prospect_is_parent), or for the
 * parent's copy, the email names the student and asks them to pass it on.
 */
async function emailProspect(
  admin: AdminClient,
  d: { id: string; token: string; prospect_email: string; subjects: SubjectConfig[] | null; prospect_is_parent?: boolean | null; student_name?: string | null; time_limit_minutes?: number | null },
  displayName: string | null,
  o: { parentCopy?: string | null; replyTo?: string | null; reset?: { started_at?: null; opened_at?: null } } = {},
): Promise<{ error?: string; parent?: boolean }> {
  const resend = getResend();
  if (!resend) return { error: "Email isn't set up on this server.", ...(o.parentCopy ? { parent: false } : {}) };
  const base = {
    senderName: prospectSenderName(displayName), subject: d.subjects?.[0]?.name || "your subject", link: prospectLink(d.token),
    studentName: d.student_name?.trim() || undefined,
    ...(d.time_limit_minutes ? { timed: true } : {}),
  };
  const { subject, content } = prospectDiagnosticEmail({ ...base, ...(d.prospect_is_parent ? { audience: "parent" as const } : {}) });
  const sentAt = new Date().toISOString();
  const replyTo = o.replyTo ? { replyTo: o.replyTo } : {};
  const result = await sendEmail(resend, { to: d.prospect_email, subject, content, idempotencyKey: `prospect-diagnostic:${d.id}:${sentAt}`, ...replyTo });
  let parent: boolean | undefined;
  if (o.parentCopy) {
    const copy = prospectDiagnosticEmail({ ...base, audience: "parent" });
    const r = await sendEmail(resend, { to: o.parentCopy, ...copy, idempotencyKey: `prospect-diagnostic:${d.id}:${sentAt}:parent`, ...replyTo });
    if (r.error) logger.warn({ id: d.id, err: r.error }, "diagnostic: the parent's copy wasn't sent");
    parent = !r.error;
  }
  const withParent = parent === undefined ? {} : { parent };
  if (result.error) return { error: result.blocked ? "That address can't receive our emails (it bounced or reported spam before)." : "The email couldn't be sent. Try Resend.", ...withParent };
  const { error } = await admin.from("diagnostic_assessments").update({ sent_at: sentAt, reminded_at: null }).eq("id", d.id);
  if (error) logger.error({ err: error, id: d.id }, "diagnostic: emailed a prospect but couldn't record it");
  // A resent timed test starts afresh (only while it's still pending; a submitted one keeps its times).
  if (o.reset && Object.keys(o.reset).length) {
    const { error: resetErr } = await admin.from("diagnostic_assessments").update(o.reset)
      .eq("id", d.id).eq("status", "pending").is("student_id", null);
    if (resetErr) logger.error({ err: resetErr, id: d.id }, "diagnostic: resent a timed test but couldn't reset its clock");
  }
  return withParent;
}

/**
 * A curriculum subject's test keeps its scope (only subtopics of that
 * curriculum), so it can follow the student later. Columns to store; none for
 * a test that isn't from a curriculum.
 */
export async function testScopeFields(
  admin: SupabaseClient, subjects: Array<{ curriculumId?: string; subtopicIds?: string[] }>,
): Promise<{ curriculum_id?: string; subtopic_ids?: string[] }> {
  const curriculumId = Array.isArray(subjects) ? subjects[0]?.curriculumId : undefined;
  if (!curriculumId) return {};
  const scope = await diagnosticScope(admin, curriculumId, subjects[0].subtopicIds ?? []);
  return { curriculum_id: curriculumId, subtopic_ids: scope.subtopicIds };
}

/** POST /tutor/diagnostic/create — Save a generated assessment and return the unique link */
router.post("/tutor/diagnostic/create", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, tutorId } = ctx;

    const { studentName, preCallFormUrl, prospectEmail, parentEmail, questionnaire } = req.body as {
      studentName?: string;
      preCallFormUrl?: string;
      prospectEmail?: string;
      parentEmail?: string;
      questionnaire?: unknown;
    };

    const test = testInput(req.body);
    if ("error" in test) return res.status(400).json({ error: test.error });
    const subjects = test.subjects as unknown as SubjectConfig[];
    const checked = normaliseProspectEmail(prospectEmail);
    if ("error" in checked) return res.status(400).json({ error: checked.error });
    // Optional: a parent gets copies of the consultation call's emails.
    const parent = normaliseProspectEmail(parentEmail);
    if ("error" in parent) return res.status(400).json({ error: "Enter a valid email address for the parent." });

    // Every diagnostic made here is a link diagnostic (no student_id), so it gets a questionnaire
    // snapshot: the one sent with it, else the tutor's master. Never re-snapshotted later.
    let snapshot: Questionnaire | null = null;
    if (questionnaire !== undefined && questionnaire !== null) {
      const v = validateQuestionnaire(questionnaire);
      if ("error" in v) return res.status(400).json({ error: v.error });
      snapshot = snapshotFrom(v.questionnaire);
    } else {
      snapshot = snapshotFrom((await masterQuestionnaire(admin, tutorId)).questionnaire);
    }

    const { data, error } = await admin
      .from("diagnostic_assessments")
      .insert({
        tutor_id:          tutorId,
        year_level:        test.yearLevel,
        subjects:          subjects,
        questions:         test.questions,
        student_name:      studentName?.trim() || null,
        pre_call_form_url: preCallFormUrl?.trim() || null,
        questionnaire:     snapshot,
        status:            "pending",
        score_max:         test.scoreMax,
        time_limit_minutes: timeLimitFor(test.questions),
        ...(await testScopeFields(admin, subjects)),
        prospect_email:    checked.email,
        parent_email:      parent.email,
      })
      .select("id, token")
      .single<{ id: string; token: string }>();

    if (error) throw new Error(error.message);

    const link = linkFor(req, data.token);
    if (!checked.email) return res.json({ id: data.id, token: data.token, link, emailed: false });

    // The diagnostic is saved either way; a failed send leaves it to Resend.
    const sent = await emailProspect(admin, { id: data.id, token: data.token, prospect_email: checked.email, subjects, time_limit_minutes: timeLimitFor(test.questions) }, ctx.displayName);
    return res.json({ id: data.id, token: data.token, link, emailed: !sent.error, ...(sent.error ? { emailError: sent.error } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

/**
 * Ids of the students on this tutor's roster. Every tutor of a student can see
 * the student's diagnostics, whoever set them.
 */
async function rosterStudentIds(admin: AdminClient, tutorId: string): Promise<string[]> {
  const { data, error } = await admin.from("tutor_students").select("student_id").eq("tutor_id", tutorId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { student_id: string }[]).map((r) => r.student_id);
}

/** Ids split into groups small enough for an `in` filter in a request URL. */
function inBatches(ids: string[], size = 150): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** GET /tutor/diagnostic/list — the tutor's own assessments, plus any set for students on their roster */
router.get("/tutor/diagnostic/list", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, tutorId } = ctx;

    const columns = DIAGNOSTIC_LIST_COLUMNS;
    const studentIds = await rosterStudentIds(admin, tutorId);
    // Rosters can be long: look the students' diagnostics up in batches.
    const results = await Promise.all([
      admin.from("diagnostic_assessments").select(columns).eq("tutor_id", tutorId),
      ...inBatches(studentIds).map((ids) => admin.from("diagnostic_assessments").select(columns).in("student_id", ids)),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    type Row = Pick<DiagnosticAssessment, "id" | "token" | "tutor_id" | "student_name" | "submitted_by_name" | "curriculum_id"> & ProspectRow & {
      questionnaire: Questionnaire | null;
      questionnaire_answers: Answers | null;
      questionnaire_submitted_at: string | null;
    };
    const byId = new Map<string, Row>();
    for (const r of results) for (const row of (r.data ?? []) as Row[]) byId.set(row.id, row);
    const list = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));

    // Names for students' own diagnostics (no name typed in) and for other tutors who set one.
    const ids = [...new Set(list.flatMap((r) => [r.student_id, r.tutor_id !== tutorId ? r.tutor_id : null]).filter((x): x is string => !!x))];
    const names = new Map<string, string>();
    const profileResults = await Promise.all(inBatches(ids).map((batch) => admin.from("profiles").select("id, display_name").in("id", batch)));
    for (const r of profileResults) {
      for (const p of (r.data ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) names.set(p.id, p.display_name);
      }
    }

    // This tutor's booked consultation calls, for the "Booked" state on prospects' rows
    // (one live call per prospect email, whichever of their diagnostics it was booked from).
    const { data: calls, error: callsErr } = await admin
      .from("tutoring_sessions")
      .select("id, scheduled_at, diagnostic_id, guest_email, reminder_minutes")
      .eq("tutor_id", tutorId).eq("session_type", "consultation").eq("status", "scheduled");
    if (callsErr) throw new Error(callsErr.message);
    type Call = { id: string; scheduled_at: string; diagnostic_id: string | null; guest_email: string | null; reminder_minutes: number[] | null };
    const bookingFor = (row: Row) => {
      if (row.tutor_id !== tutorId || row.student_id) return null;
      const email = row.prospect_email?.toLowerCase() ?? null;
      const call = ((calls ?? []) as Call[]).find((c) => c.diagnostic_id === row.id || (!!email && c.guest_email?.toLowerCase() === email));
      return call ? { sessionId: call.id, start: call.scheduled_at, reminderMinutes: call.reminder_minutes ?? [] } : null;
    };

    // Sign-up state: this tutor's invites that carry one of these diagnostics across.
    type SignupInvite = { source_diagnostic_id: string; status: string; student_id: string | null; sent_at: string | null; created_at: string };
    const inviteResults = await Promise.all(inBatches(list.map((r) => r.id)).map((batch) =>
      admin.from("tutor_invites").select("source_diagnostic_id, status, student_id, sent_at, created_at")
        .eq("tutor_id", tutorId).in("source_diagnostic_id", batch)));
    const inviteFailed = inviteResults.find((r) => r.error);
    if (inviteFailed?.error) throw new Error(inviteFailed.error.message);
    const invites = inviteResults.flatMap((r) => (r.data ?? []) as SignupInvite[]);
    const acceptedIds = [...new Set(invites.filter((i) => i.status === "accepted" && i.student_id).map((i) => i.student_id!))]
      .filter((id) => !names.has(id));
    const signupNames = new Map(names);
    const signupProfiles = await Promise.all(inBatches(acceptedIds).map((batch) => admin.from("profiles").select("id, display_name").in("id", batch)));
    for (const r of signupProfiles) {
      for (const p of (r.data ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) signupNames.set(p.id, p.display_name);
      }
    }
    const signupFor = (row: Row) => signupState(
      invites.filter((i) => i.source_diagnostic_id === row.id)
        .map((i) => ({ ...i, student_name: i.student_id ? signupNames.get(i.student_id) ?? null : null })),
      now.getTime(),
    );

    const now = new Date();
    const rows = list.map((row) => {
      const booking = bookingFor(row);
      // Roster students' diagnostics never carry a questionnaire.
      const q = row.student_id ? null : row.questionnaire;
      return forViewer({
      ...row,
      booking,
      signup: signupFor(row),
      questionnaire_status: questionnaireStatus({ hasSnapshot: !!q, submittedAt: row.questionnaire_submitted_at, hasLiveBooking: !!booking }),
      red_flags: q && row.questionnaire_answers ? countRedFlags(q, row.questionnaire_answers) : 0,
      student_name: row.student_name || (row.student_id ? names.get(row.student_id) ?? null : null),
      set_by: row.tutor_id === tutorId ? null : names.get(row.tutor_id) ?? "Another tutor",
      link: linkFor(req, row.token),
      status_label: diagnosticStatus(row, now),
      // Only the tutor who sent it can resend or cancel it.
      can_resend: row.tutor_id === tutorId && canResend(row, now),
      can_cancel: row.tutor_id === tutorId && !row.student_id && ["sent", "opened", "in_progress", "link"].includes(diagnosticStatus(row, now)),
      }, tutorId);
    });

    return res.json({ assessments: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

/** A link diagnostic this tutor sent, with what resend, cancel and add-test need; null if it isn't theirs. */
async function ownLinkDiagnostic(admin: AdminClient, tutorId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await admin
    .from("diagnostic_assessments")
    .select(`id, token, tutor_id, subjects, student_name, parent_email, prospect_is_parent, time_limit_minutes, ${PROSPECT_COLUMNS}`)
    .eq("id", id)
    .maybeSingle<Pick<DiagnosticAssessment, "id" | "token" | "tutor_id" | "subjects" | "student_name" | "parent_email" | "prospect_is_parent"> & { time_limit_minutes: number | null } & ProspectRow>();
  if (error) throw new Error(error.message);
  return data && data.tutor_id === tutorId && !data.student_id ? data : null;
}

/** POST /tutor/diagnostic/:id/resend — email it to the prospect again (restarts its 30 days and its reminder) */
router.post("/tutor/diagnostic/:id/resend", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const d = await ownLinkDiagnostic(ctx.admin, ctx.tutorId, String(req.params.id));
    if (!d) return res.status(404).json({ error: "Diagnostic not found" });
    if (!d.prospect_email || !canResend(d, new Date())) return res.status(409).json({ error: "This diagnostic can't be resent." });
    const sent = await emailProspect(ctx.admin, { ...d, prospect_email: d.prospect_email }, ctx.displayName, { reset: resendResetFields(d) });
    if (sent.error) return res.status(502).json({ error: sent.error });
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /tutor/diagnostic/:id/add-test — a consultation's record that went out
 * without a test gets one: stored, then the diagnostic link is emailed to the
 * primary address (parent wording when it's a parent's) and the parent's copy.
 */
router.post("/tutor/diagnostic/:id/add-test", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const d = await ownLinkDiagnostic(ctx.admin, ctx.tutorId, String(req.params.id));
    if (!d) return res.status(404).json({ error: "Diagnostic not found" });
    if (!hasNoTest(d)) return res.status(409).json({ error: "This already has a test." });
    if (d.cancelled_at || d.status !== "pending") return res.status(409).json({ error: "This was cancelled." });
    const test = testInput(req.body);
    if ("error" in test) return res.status(400).json({ error: test.error });

    const { data: stored, error } = await ctx.admin
      .from("diagnostic_assessments")
      .update({
        year_level: test.yearLevel,
        subjects: test.subjects,
        questions: test.questions,
        score_max: test.scoreMax,
        time_limit_minutes: timeLimitFor(test.questions),
        has_test: true,
        ...(await testScopeFields(ctx.admin, test.subjects)),
      })
      .eq("id", d.id).eq("tutor_id", ctx.tutorId).eq("has_test", false).eq("status", "pending").is("cancelled_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!stored?.length) return res.status(409).json({ error: "This already has a test." });

    if (!d.prospect_email) return res.json({ emailed: {} });
    // sent_at is recorded once the primary address has it (a failed send leaves it to Resend).
    const sent = await emailProspect(
      ctx.admin,
      { ...d, prospect_email: d.prospect_email, subjects: test.subjects as unknown as SubjectConfig[], time_limit_minutes: timeLimitFor(test.questions) },
      ctx.displayName,
      { parentCopy: d.prospect_is_parent ? null : d.parent_email, replyTo: ctx.email },
    );
    const primary = !sent.error;
    const emailed = d.prospect_is_parent
      ? { parent: primary }
      : { student: primary, ...(sent.parent === undefined ? {} : { parent: sent.parent }) };
    return res.json({ emailed, ...(sent.error ? { emailError: sent.error } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

/** POST /tutor/diagnostic/:id/cancel — the link stops working */
router.post("/tutor/diagnostic/:id/cancel", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const d = await ownLinkDiagnostic(ctx.admin, ctx.tutorId, String(req.params.id));
    if (!d) return res.status(404).json({ error: "Diagnostic not found" });
    const { data: cancelled, error } = await ctx.admin
      .from("diagnostic_assessments").update({ cancelled_at: new Date().toISOString() })
      .eq("id", d.id).eq("status", "pending").is("cancelled_at", null).select("id");
    if (error) throw new Error(error.message);
    if (!cancelled?.length) return res.status(409).json({ error: "This diagnostic can't be cancelled." });
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /tutor/diagnostic/:id/mark — "Mark again" for a timed diagnostic whose
 * background marking failed: a fresh set of attempts, marked during the request.
 */
router.post("/tutor/diagnostic/:id/mark", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const d = await ownLinkDiagnostic(ctx.admin, ctx.tutorId, String(req.params.id));
    if (!d) return res.status(404).json({ error: "Diagnostic not found" });
    if (d.time_limit_minutes == null || d.status !== "completed") return res.status(409).json({ error: "This diagnostic can't be marked." });
    const { data: reset, error } = await ctx.admin
      .from("diagnostic_assessments").update({ marking_attempts: 0 })
      .eq("id", d.id).eq("status", "completed").is("report", null).select("id");
    if (error) throw new Error(error.message);
    if (!reset?.length) return res.status(409).json({ error: "This diagnostic has already been marked." });
    await markAndStore(ctx.admin, d.id);
    const { data: after, error: readErr } = await ctx.admin
      .from("diagnostic_assessments").select("report").eq("id", d.id).maybeSingle<{ report: unknown }>();
    if (readErr) throw new Error(readErr.message);
    return res.json({ ok: true, marked: after?.report != null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

/** GET /tutor/diagnostic/:id/report — Full report for a completed assessment (its tutor or any rostered tutor) */
router.get("/tutor/diagnostic/:id/report", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, tutorId } = ctx;

    const { id } = req.params;
    const { data, error } = await admin
      .from("diagnostic_assessments")
      .select("*")
      .eq("id", id)
      .maybeSingle<DiagnosticAssessment>();

    if (error || !data) return res.status(404).json({ error: "Assessment not found" });
    // Its tutor, or any tutor with the student on their roster.
    if (data.tutor_id !== tutorId) {
      const { data: rostered } = data.student_id
        ? await admin.from("tutor_students").select("student_id").eq("tutor_id", tutorId).eq("student_id", data.student_id).maybeSingle()
        : { data: null };
      if (!rostered) return res.status(404).json({ error: "Assessment not found" });
    }

    // Timed and submitted but not marked yet: nothing to show.
    if (data.status === "completed" && !data.report) {
      return res.status(409).json({ error: "Still marking. Try again in a minute." });
    }

    // The questions come back too (with answers and solution notes), so the
    // report can show each question in full beside the student's answer.
    return res.json({ assessment: forViewer(data, tutorId), report: data.report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── Public endpoints (no tutor auth required) ─────────────────────────────────

/** GET /diagnostic/:token — Student loads the assessment */
router.get("/diagnostic/:token", async (req: Request, res: Response) => {
  try {
    const admin = getAdminClient();
    const { token } = req.params;

    const { data, error } = await admin
      .from("diagnostic_assessments")
      .select(`id, token, year_level, subjects, questions, student_name, score_max, pre_call_form_url, completed_at, questions_ready_at, report, tutor_id, questionnaire, time_limit_minutes, ${PROSPECT_COLUMNS}`)
      .eq("token", token)
      .single<Pick<DiagnosticAssessment, "id" | "token" | "year_level" | "subjects" | "questions" | "student_name" | "score_max" | "pre_call_form_url" | "completed_at" | "questions_ready_at" | "report" | "tutor_id"> & ProspectRow & { questionnaire: Questionnaire | null; time_limit_minutes: number | null }>();

    // A consultation's record with no test yet: nothing to take.
    if (error || !data || hasNoTest(data)) return res.status(404).json({ error: "Assessment not found" });
    // A started timed test stays open past link expiry (as for submit), so it can be resumed and finished.
    const unavailable = submitUnavailableReason(data, new Date());
    if (unavailable) return res.status(410).json({ error: unavailable });
    // A prospect's link: note the first time it's opened.
    if (!data.student_id && data.status === "pending" && !data.opened_at) {
      const { error: openErr } = await admin.from("diagnostic_assessments")
        .update({ opened_at: new Date().toISOString() }).eq("id", data.id).is("opened_at", null);
      if (openErr) logger.warn({ err: openErr, id: data.id }, "diagnostic: couldn't record opened_at");
    }

    const { student_id, questions_ready_at, report, tutor_id, questionnaire, prospect_email: _pe, created_at: _ca, sent_at: _sa, opened_at: _oa, started_at, reminded_at: _ra, cancelled_at: _cx, has_test: _ht, ...rest } = data;
    // The tutor's display name, so the page can say who it goes to.
    let tutor_name: string | null = null;
    if (tutor_id) {
      const { data: tutor } = await admin.from("profiles").select("display_name").eq("id", tutor_id).maybeSingle<{ display_name: string | null }>();
      tutor_name = tutor?.display_name?.trim() || null;
    }
    // Never send correct answers to the student
    return res.json({
      assessment: {
        ...rest,
        questions: sanitiseQuestionsForStudent(data.questions),
        started_at: started_at ?? null,
        server_now: new Date().toISOString(),
        // A tutor-included subject's diagnostic: written on first use
        // (POST …/prepare), and the student sees a summary when it's done.
        linked: !!student_id,
        ready: !student_id || !!questions_ready_at,
        summary: student_id && report ? studentSummary(report) : null,
        tutor_name,
        // Who sent a link diagnostic, by full name (never "your tutor": a prospect isn't their student yet).
        sender_name: student_id ? null : tutor_name,
        // The built-in questionnaire's link when a snapshot exists (roster diagnostics never have one).
        questionnaire_url: student_id ? null : questionnaireLinkFor({ token: data.token, questionnaire, pre_call_form_url: null }),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

/** POST /diagnostic/:token/start — a prospect pressed Start (for the tutor's list) */
router.post("/diagnostic/:token/start", async (req: Request, res: Response) => {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("diagnostic_assessments").select(`id, time_limit_minutes, ${PROSPECT_COLUMNS}`)
      .eq("token", req.params.token).maybeSingle<{ id: string; time_limit_minutes: number | null } & ProspectRow>();
    if (error || !data || hasNoTest(data)) return res.status(404).json({ error: "Assessment not found" });
    const unavailable = submitUnavailableReason(data, new Date());
    if (unavailable) return res.status(410).json({ error: unavailable });
    if (!data.student_id && data.status === "pending" && !data.started_at) {
      const { error: upErr } = await admin.from("diagnostic_assessments")
        .update({ started_at: new Date().toISOString() }).eq("id", data.id).is("started_at", null);
      if (upErr) throw new Error(upErr.message);
    }
    // The stored value (set once), so a second press or a reload gets the same clock.
    const { data: stored, error: readErr } = await admin.from("diagnostic_assessments")
      .select("started_at, time_limit_minutes").eq("id", data.id)
      .maybeSingle<{ started_at: string | null; time_limit_minutes: number | null }>();
    if (readErr) throw new Error(readErr.message);
    return res.json({
      ok: true,
      startedAt: data.student_id ? null : stored?.started_at ?? null,
      timeLimitMinutes: stored?.time_limit_minutes ?? null,
      serverNow: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

/** POST /diagnostic/:token/submit — Student submits their answers */
router.post("/diagnostic/:token/submit", async (req: Request, res: Response) => {
  try {
    const admin = getAdminClient();
    const { token } = req.params;
    const { studentName, answers } = req.body as {
      studentName: string;
      answers: Record<string, string>;
    };

    if (!answers || typeof answers !== "object") return res.status(400).json({ error: "answers are required" });

    const { data, error } = await admin
      .from("diagnostic_assessments")
      .select("*")
      .eq("token", token)
      .single<DiagnosticAssessment>();

    if (error || !data || hasNoTest(data)) return res.status(404).json({ error: "Assessment not found" });
    // A timed (prospect) test: stored at once, marked after the response.
    const timed = data.time_limit_minutes != null && !data.student_id;
    if (data.status === "completed") {
      // The client treats already_submitted as success (a retry after a lost response).
      if (timed) return res.status(409).json({ error: "already_submitted" });
      return res.status(400).json({ error: "This assessment has already been submitted." });
    }
    if (!data.questions?.length) return res.status(409).json({ error: "This diagnostic isn't ready yet." });
    // A started timed test is accepted even after its link expires.
    const unavailable = submitUnavailableReason(data, new Date());
    if (unavailable) return res.status(410).json({ error: unavailable });

    const questionnaireUrl = questionnaireLinkFor({ token: data.token, questionnaire: (data as { questionnaire?: unknown }).questionnaire ?? null, pre_call_form_url: null });

    if (timed) {
      // Accepted even after the deadline: a lost connection mustn't lose the test.
      const stored = await storeTimedSubmission(admin, data.token, {
        student_answers: timedAnswers(data.questions, answers),
        submitted_by_name: (studentName || "").trim() || data.student_name || null,
        completed_at: new Date().toISOString(),
      });
      if (stored === "already_submitted") return res.status(409).json({ error: "already_submitted" });
      res.json({ submitted: true, preCallFormUrl: data.pre_call_form_url, questionnaireUrl });
      // markAndStore logs its own failures; the email cron re-runs a stalled one.
      waitUntil(markAndStore(admin, data.id));
      return;
    }

    // Run AI marking
    const report = await markAssessment(data.questions, answers, data.year_level, data.subjects);

    // Persist results
    const { error: updateError } = await admin
      .from("diagnostic_assessments")
      .update({
        status:            "completed",
        completed_at:      new Date().toISOString(),
        submitted_by_name: (studentName || "").trim() || data.student_name || null,
        student_answers:   answers,
        report:            report,
        score_total:       report.total_score,
      })
      .eq("token", token);

    if (updateError) throw new Error(updateError.message);

    // A student's own diagnostic: they get the summary; the tutor gets the report.
    if (data.student_id) return res.json({ linked: true, summary: studentSummary(report) });

    return res.json({
      score:    report.total_score,
      maxScore: report.max_score,
      percentage: report.percentage,
      band:     report.performance_band,
      report,
      preCallFormUrl: data.pre_call_form_url,
      questionnaireUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── Diagnostics for tutor-included subjects (lib/student-diagnostic.ts) ──────

/** GET /diagnostics/mine — the signed-in student's diagnostics, one per subject. */
router.get("/diagnostics/mine", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req, res);
    if (!caller) return;
    const { data, error } = await caller.admin
      .from("diagnostic_assessments")
      .select("token, curriculum_id, subjects, status, questions_ready_at, waived_at, completed_at, report")
      .eq("student_id", caller.userId);
    if (error) throw new Error(error.message);
    type Row = Pick<DiagnosticAssessment, "token" | "curriculum_id" | "subjects" | "status" | "questions_ready_at" | "waived_at" | "completed_at" | "report">;
    return res.json({
      diagnostics: ((data ?? []) as Row[]).map((d) => ({
        token: d.token,
        curriculum_id: d.curriculum_id,
        subject: d.subjects?.[0]?.name ?? null,
        status: d.status === "completed" ? "completed" : d.waived_at ? "waived" : "pending",
        ready: !!d.questions_ready_at,
        completed_at: d.completed_at,
        summary: d.report ? studentSummary(d.report) : null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

/** Someone else started writing the questions this recently: wait for them rather than start again. */
const GENERATION_CLAIM_MS = 5 * 60 * 1000;

/**
 * POST /diagnostic/:token/prepare — write a tutor-included subject's
 * diagnostic questions, once. { ready: true } when they're written (now or
 * before); 202 { ready: false } while another request is writing them.
 */
router.post("/diagnostic/:token/prepare", async (req: Request, res: Response) => {
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from("diagnostic_assessments")
      .select("id, student_id, curriculum_id, subtopic_ids, subjects, year_level, status, questions_ready_at")
      .eq("token", String(req.params.token))
      .maybeSingle<Pick<DiagnosticAssessment, "id" | "student_id" | "curriculum_id" | "subtopic_ids" | "subjects" | "year_level" | "status" | "questions_ready_at">>();
    if (!data) return res.status(404).json({ error: "Assessment not found" });
    if (!data.student_id || !data.curriculum_id) return res.status(400).json({ error: "This assessment is already written." });
    if (data.questions_ready_at || data.status === "completed") return res.json({ ready: true });

    const staleBefore = new Date(Date.now() - GENERATION_CLAIM_MS).toISOString();
    const { data: claimed, error: claimErr } = await admin
      .from("diagnostic_assessments")
      .update({ generation_started_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("questions_ready_at", null)
      .or(`generation_started_at.is.null,generation_started_at.lt."${staleBefore}"`)
      .select("id");
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed?.length) return res.status(202).json({ ready: false });

    try {
      const { topics } = await diagnosticScope(admin, data.curriculum_id, data.subtopic_ids ?? []);
      const questions = await generateCurriculumDiagnostic(data.subjects?.[0]?.name || "this subject", data.year_level, topics);
      const { error } = await admin
        .from("diagnostic_assessments")
        .update({ questions, score_max: questions.reduce((n, q) => n + q.marks, 0), questions_ready_at: new Date().toISOString() })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } catch (err) {
      await admin.from("diagnostic_assessments").update({ generation_started_at: null }).eq("id", data.id);
      throw err;
    }
    return res.json({ ready: true });
  } catch (err) {
    logger.error({ err }, "diagnostic: could not prepare a student diagnostic");
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(502).json({ error: message });
  }
});

export default router;
