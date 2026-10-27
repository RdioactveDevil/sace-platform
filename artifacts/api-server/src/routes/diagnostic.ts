import { Router, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL, CLAUDE_THINKING } from "../lib/anthropic-model";
import { latexPromptRule } from "../lib/math-prompt";
import { repairLatexJson } from "../lib/json-latex";
import { logger } from "../lib/logger";
import { requireUser } from "../lib/auth";
import { requireTutorPlan } from "../lib/tutor-plan";
import { diagnosticScope, studentSummary, type ScopeTopic } from "../lib/student-diagnostic";

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

interface DiagnosticQuestion {
  id: number;
  question: string;
  type: "multiple_choice" | "short_answer" | "extended_response";
  options?: string[];
  correct_answer: string;
  marks: number;
  difficulty: "easy" | "moderate" | "exam";
  topic: string;
  subtopic?: string;
  solution_notes?: string;
}

interface SubjectConfig {
  name: string;
  topics: string[];
  writingType?: "essay" | "paragraph";
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
}

interface QuestionResult {
  id: number;
  correct: boolean;
  marks_awarded: number;
  marks_possible: number;
  student_answer: string;
  correct_answer: string;
  feedback: string;
}

interface TopicBreakdown {
  topic: string;
  marks_awarded: number;
  marks_possible: number;
  percentage: number;
}

interface SubtopicBreakdown extends TopicBreakdown {
  subtopic: string;
}

interface DiagnosticReport {
  total_score: number;
  max_score: number;
  percentage: number;
  performance_band: string;
  easy_score: number;
  easy_max: number;
  moderate_score: number;
  moderate_max: number;
  exam_score: number;
  exam_max: number;
  question_results: QuestionResult[];
  topic_breakdown: TopicBreakdown[];
  subtopic_breakdown?: SubtopicBreakdown[];
  pain_points: string[];
  patterns: string[];
  recommendations: string[];
  summary: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAdminClient(): AdminClient {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  }) as AdminClient;
}

function getBaseUrl(): string {
  return process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
}

function getApiKey(): string {
  return process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
}

async function callClaude(system: string, user: string, maxTokens = 4000, jsonOnly = false): Promise<string> {
  // Claude Haiku 5.5 rejects assistant prefill, so ask for bare JSON in the
  // user turn instead; extractJson() still strips any fences or stray prose.
  const content = jsonOnly
    ? `${user}\n\nRespond with ONLY the JSON object, starting with { — no markdown fences or commentary.`
    : user;
  const messages = [{ role: "user", content }];

  const res = await fetch(`${getBaseUrl()}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      thinking: CLAUDE_THINKING,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { content?: { text: string }[]; stop_reason?: string };
  if (data?.stop_reason && data.stop_reason !== "end_turn") {
    logger.warn({ stop_reason: data.stop_reason, maxTokens }, "diagnostic: Claude response did not finish normally");
  }
  return data?.content?.[0]?.text || "";
}

/** JSON.parse that first re-escapes single-backslash LaTeX (\sqrt, \frac ...) the model writes inside strings. */
function parseLatexJson(text: string): unknown {
  for (const candidate of [repairLatexJson(text), text]) {
    try { return JSON.parse(candidate); } catch { /* try next */ }
  }
  throw new Error("unparseable JSON");
}

function extractJson(text: string): unknown {
  try { return parseLatexJson(text); } catch { /* continue */ }
  // Strip markdown fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return parseLatexJson(fenced[1].trim()); } catch { /* continue */ }
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return parseLatexJson(text.slice(start, end + 1)); } catch { /* continue */ }
  }
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return parseLatexJson(text.slice(arrStart, arrEnd + 1)); } catch { /* continue */ }
  }
  logger.warn({ length: text.length, head: text.slice(0, 300), tail: text.slice(-300) }, "diagnostic: could not parse Claude JSON");
  return null;
}

async function requireTutor(req: Request, res: Response): Promise<{ admin: AdminClient; tutorId: string; tutorName: string } | null> {
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

  return { admin, tutorId: userData.user.id, tutorName: profile.display_name ?? "Your tutor" };
}

function performanceBand(pct: number): string {
  if (pct >= 90) return "Outstanding";
  if (pct >= 75) return "High";
  if (pct >= 60) return "Satisfactory";
  if (pct >= 40) return "Developing";
  return "Beginning";
}

// Strip correct answers before sending to student
function sanitiseQuestionsForStudent(questions: DiagnosticQuestion[]): Omit<DiagnosticQuestion, "correct_answer" | "solution_notes">[] {
  return questions.map(({ correct_answer: _ca, solution_notes: _sn, ...rest }) => rest);
}

// ── Generate Questions (Claude) ────────────────────────────────────────────────

async function generateQuestions(
  yearLevel: string,
  subjects: SubjectConfig[],
): Promise<DiagnosticQuestion[]> {
  const isEnglishOnly = subjects.every((s) =>
    s.name.toLowerCase().includes("english") || s.name.toLowerCase().includes("writing")
  );

  const subjectDesc = subjects.map((s) => {
    const base = `${s.name} — Topics: ${s.topics.join(", ")}`;
    if (s.writingType) return `${base} (Writing type: ${s.writingType})`;
    return base;
  }).join("; ");

  const writingInstructions = isEnglishOnly
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

  const user = `Create a 30-mark diagnostic assessment for ${yearLevel}.
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
  "subtopic": "<specific subtopic or concept>",
  "solution_notes": "<brief explanation of the correct answer for marking>"
}

STRICT RULES:
1. Total marks across ALL questions MUST equal exactly 30.
2. Easy questions total exactly 10 marks.
3. Moderate questions total exactly 10 marks.
4. Exam questions total exactly 10 marks.
5. Questions must be appropriate for ${yearLevel} level — not too easy, not too hard.
6. Use real curriculum-aligned content for the given subject(s) and topics.
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

  if (!questions.length) throw new Error("No questions were generated. Please try again.");

  // Normalise IDs
  questions = questions.map((q, i) => ({ ...q, id: i + 1 }));

  return questions;
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
  const outline = scope.map((t) => (t.subtopics.length ? `- ${t.topic}: ${t.subtopics.join("; ")}` : `- ${t.topic}`)).join("\n");
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
    .sort((a, b) => order[a.difficulty] - order[b.difficulty])
    .slice(0, STUDENT_DIAGNOSTIC_QUESTIONS)
    .map((q, i) => ({ ...q, id: i + 1 }));
  if (questions.length < 15) throw new Error("The diagnostic couldn't be written just now. Please try again.");
  return questions;
}

// ── AI Marking ────────────────────────────────────────────────────────────────

async function markAssessment(
  questions: DiagnosticQuestion[],
  answers: Record<string, string>,
  yearLevel: string,
  subjects: SubjectConfig[],
): Promise<DiagnosticReport> {
  // Auto-mark MC questions
  const mcResults: QuestionResult[] = [];
  const aiMarkingQueue: { q: DiagnosticQuestion; studentAnswer: string }[] = [];

  for (const q of questions) {
    const studentAnswer = (answers[String(q.id)] || "").trim();
    if (q.type === "multiple_choice") {
      const correct = studentAnswer.toUpperCase() === q.correct_answer.toUpperCase();
      mcResults.push({
        id: q.id,
        correct,
        marks_awarded: correct ? q.marks : 0,
        marks_possible: q.marks,
        student_answer: studentAnswer,
        correct_answer: q.correct_answer,
        feedback: correct ? "Correct." : `Incorrect. The correct answer is ${q.correct_answer}. ${q.solution_notes || ""}`.trim(),
      });
    } else {
      aiMarkingQueue.push({ q, studentAnswer });
    }
  }

  // AI-mark short_answer and extended_response questions
  let aiResults: QuestionResult[] = [];
  if (aiMarkingQueue.length > 0) {
    const markingPayload = aiMarkingQueue.map(({ q, studentAnswer }) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      marks_available: q.marks,
      difficulty: q.difficulty,
      topic: q.topic,
      model_answer: q.correct_answer,
      solution_notes: q.solution_notes || "",
      student_answer: studentAnswer,
    }));

    const system = `You are a professional Australian curriculum marker. Mark student responses fairly and accurately. Return strict JSON only — no markdown.`;
    const user = `Mark each student response below. For each, assign marks_awarded (0 to marks_available), give a brief feedback comment (1–2 sentences), and indicate if the student clearly understood the concept.

Year level: ${yearLevel}
Subject(s): ${subjects.map((s) => s.name).join(", ")}

Questions to mark:
${JSON.stringify(markingPayload, null, 2)}

Return JSON: { "results": [ { "id": <int>, "marks_awarded": <int>, "feedback": "<string>" }, ... ] }`;

    const raw = await callClaude(system, user, 4000, true);
    const parsed = extractJson(raw) as { results?: { id: number; marks_awarded: number; feedback: string }[] } | null;
    const rawResults = parsed && typeof parsed === "object" && Array.isArray((parsed as { results?: unknown[] }).results)
      ? (parsed as { results: { id: number; marks_awarded: number; feedback: string }[] }).results
      : [];

    aiResults = aiMarkingQueue.map(({ q, studentAnswer }) => {
      const found = rawResults.find((r) => r.id === q.id);
      const marksAwarded = Math.min(q.marks, Math.max(0, found?.marks_awarded ?? 0));
      return {
        id: q.id,
        correct: marksAwarded >= q.marks,
        marks_awarded: marksAwarded,
        marks_possible: q.marks,
        student_answer: studentAnswer,
        correct_answer: q.correct_answer,
        feedback: found?.feedback || (marksAwarded > 0 ? "Partially correct." : "Incorrect or incomplete response."),
      };
    });
  }

  const allResults = [...mcResults, ...aiResults].sort((a, b) => a.id - b.id);

  // Score breakdown by difficulty
  const easyResults   = allResults.filter((r) => questions.find((q) => q.id === r.id)?.difficulty === "easy");
  const modResults    = allResults.filter((r) => questions.find((q) => q.id === r.id)?.difficulty === "moderate");
  const examResults   = allResults.filter((r) => questions.find((q) => q.id === r.id)?.difficulty === "exam");

  const sum = (arr: QuestionResult[], key: "marks_awarded" | "marks_possible") => arr.reduce((s, r) => s + r[key], 0);

  const totalScore = sum(allResults, "marks_awarded");
  const maxScore   = sum(allResults, "marks_possible");
  const pct        = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  // Topic breakdown
  const topicMap: Record<string, { awarded: number; possible: number }> = {};
  for (const r of allResults) {
    const q = questions.find((q) => q.id === r.id);
    if (!q) continue;
    const key = q.topic;
    if (!topicMap[key]) topicMap[key] = { awarded: 0, possible: 0 };
    topicMap[key].awarded  += r.marks_awarded;
    topicMap[key].possible += r.marks_possible;
  }
  const topicBreakdown: TopicBreakdown[] = Object.entries(topicMap).map(([topic, { awarded, possible }]) => ({
    topic,
    marks_awarded: awarded,
    marks_possible: possible,
    percentage: possible > 0 ? Math.round((awarded / possible) * 100) : 0,
  }));

  const subtopicMap: Record<string, SubtopicBreakdown> = {};
  for (const r of allResults) {
    const q = questions.find((q) => q.id === r.id);
    if (!q?.subtopic) continue;
    const key = `${q.topic}\u0000${q.subtopic}`;
    subtopicMap[key] ??= { topic: q.topic, subtopic: q.subtopic, marks_awarded: 0, marks_possible: 0, percentage: 0 };
    subtopicMap[key].marks_awarded  += r.marks_awarded;
    subtopicMap[key].marks_possible += r.marks_possible;
  }
  const subtopicBreakdown = Object.values(subtopicMap).map((s) => ({
    ...s,
    percentage: s.marks_possible > 0 ? Math.round((s.marks_awarded / s.marks_possible) * 100) : 0,
  }));

  // Generate AI report narrative
  const weakTopics = topicBreakdown.filter((t) => t.percentage < 60).map((t) => t.topic);
  const reportSystem = `You are an expert educational diagnostician. Write a concise, actionable diagnostic report for a tutor based on a student's assessment results. Be specific and practical.`;
  const reportUser = `Write a diagnostic report for a ${yearLevel} student who scored ${totalScore}/${maxScore} (${pct}%) on a ${subjects.map((s) => s.name).join("/")} diagnostic assessment.

Score breakdown:
- Easy section: ${sum(easyResults, "marks_awarded")}/${sum(easyResults, "marks_possible")}
- Moderate section: ${sum(modResults, "marks_awarded")}/${sum(modResults, "marks_possible")}
- Exam section: ${sum(examResults, "marks_awarded")}/${sum(examResults, "marks_possible")}

Topic performance: ${JSON.stringify(topicBreakdown)}

Weak topics (below 60%): ${weakTopics.join(", ") || "None — student performed well across all topics"}

Question results summary:
${allResults.map((r) => {
  const q = questions.find((qq) => qq.id === r.id);
  return `Q${r.id} [${q?.difficulty}/${q?.topic}]: ${r.marks_awarded}/${r.marks_possible} — ${r.feedback}`;
}).join("\n")}

Return JSON with exactly these fields:
{
  "pain_points": ["<specific concept or topic the student struggled with>", ...],
  "patterns": ["<observable learning pattern or gap>", ...],
  "recommendations": ["<specific, actionable teaching recommendation>", ...],
  "summary": "<2–3 sentence overall summary for the tutor>"
}

Be specific. Reference actual topics and marks. Limit to 4–5 items per array.`;

  const reportRaw = await callClaude(reportSystem, reportUser, 2600, true);
  const reportParsed = extractJson(reportRaw) as {
    pain_points?: string[];
    patterns?: string[];
    recommendations?: string[];
    summary?: string;
  } | null;

  return {
    total_score: totalScore,
    max_score: maxScore,
    percentage: pct,
    performance_band: performanceBand(pct),
    easy_score:    sum(easyResults,  "marks_awarded"),
    easy_max:      sum(easyResults,  "marks_possible"),
    moderate_score: sum(modResults,  "marks_awarded"),
    moderate_max:   sum(modResults,  "marks_possible"),
    exam_score:    sum(examResults,  "marks_awarded"),
    exam_max:      sum(examResults,  "marks_possible"),
    question_results: allResults,
    topic_breakdown: topicBreakdown,
    subtopic_breakdown: subtopicBreakdown,
    pain_points:      reportParsed?.pain_points      || weakTopics.map((t) => `Needs work on ${t}`),
    patterns:         reportParsed?.patterns         || [],
    recommendations:  reportParsed?.recommendations  || [],
    summary:          reportParsed?.summary          || `Student scored ${pct}% overall.`,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** POST /tutor/diagnostic/generate — Preview AI-generated questions (no save) */
router.post("/tutor/diagnostic/generate", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;

    const { yearLevel, subjects } = req.body as {
      yearLevel: string;
      subjects: SubjectConfig[];
    };

    if (!yearLevel?.trim()) return res.status(400).json({ error: "yearLevel is required" });
    if (!Array.isArray(subjects) || subjects.length === 0) return res.status(400).json({ error: "At least one subject is required" });

    const questions = await generateQuestions(yearLevel.trim(), subjects);
    return res.json({ questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

/** POST /tutor/diagnostic/create — Save a generated assessment and return the unique link */
router.post("/tutor/diagnostic/create", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, tutorId } = ctx;

    const { yearLevel, subjects, questions, studentName, preCallFormUrl } = req.body as {
      yearLevel: string;
      subjects: SubjectConfig[];
      questions: DiagnosticQuestion[];
      studentName?: string;
      preCallFormUrl?: string;
    };

    if (!yearLevel?.trim()) return res.status(400).json({ error: "yearLevel is required" });
    if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: "questions are required" });

    const { data, error } = await admin
      .from("diagnostic_assessments")
      .insert({
        tutor_id:          tutorId,
        year_level:        yearLevel.trim(),
        subjects:          subjects,
        questions:         questions,
        student_name:      studentName?.trim() || null,
        pre_call_form_url: preCallFormUrl?.trim() || null,
        status:            "pending",
        score_max:         questions.reduce((s, q) => s + q.marks, 0),
      })
      .select("id, token")
      .single<{ id: string; token: string }>();

    if (error) throw new Error(error.message);

    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "https://app.gradefarm.com.au";
    const link = `${origin}/diagnostic/${data.token}`;

    return res.json({ id: data.id, token: data.token, link });
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

    const columns = "id, token, tutor_id, student_id, year_level, subjects, status, student_name, submitted_by_name, score_total, score_max, created_at, completed_at, pre_call_form_url";
    const studentIds = await rosterStudentIds(admin, tutorId);
    // Rosters can be long: look the students' diagnostics up in batches.
    const results = await Promise.all([
      admin.from("diagnostic_assessments").select(columns).eq("tutor_id", tutorId),
      ...inBatches(studentIds).map((ids) => admin.from("diagnostic_assessments").select(columns).in("student_id", ids)),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    type Row = Pick<DiagnosticAssessment, "id" | "token" | "tutor_id" | "student_id" | "student_name" | "submitted_by_name" | "created_at">;
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

    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "https://app.gradefarm.com.au";
    const rows = list.map((row) => ({
      ...row,
      student_name: row.student_name || (row.student_id ? names.get(row.student_id) ?? null : null),
      set_by: row.tutor_id === tutorId ? null : names.get(row.tutor_id) ?? "Another tutor",
      link: `${origin}/diagnostic/${row.token}`,
    }));

    return res.json({ assessments: rows });
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

    // The questions come back too (with answers and solution notes), so the
    // report can show each question in full beside the student's answer.
    return res.json({ assessment: data, report: data.report });
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
      .select("id, token, year_level, subjects, questions, status, student_name, score_max, pre_call_form_url, completed_at, student_id, questions_ready_at, report")
      .eq("token", token)
      .single<Pick<DiagnosticAssessment, "id" | "token" | "year_level" | "subjects" | "questions" | "status" | "student_name" | "score_max" | "pre_call_form_url" | "completed_at" | "student_id" | "questions_ready_at" | "report">>();

    if (error || !data) return res.status(404).json({ error: "Assessment not found" });

    const { student_id, questions_ready_at, report, ...rest } = data;
    // Never send correct answers to the student
    return res.json({
      assessment: {
        ...rest,
        questions: sanitiseQuestionsForStudent(data.questions),
        // A tutor-included subject's diagnostic: written on first use
        // (POST …/prepare), and the student sees a summary when it's done.
        linked: !!student_id,
        ready: !student_id || !!questions_ready_at,
        summary: student_id && report ? studentSummary(report) : null,
      },
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

    if (error || !data) return res.status(404).json({ error: "Assessment not found" });
    if (data.status === "completed") {
      return res.status(400).json({ error: "This assessment has already been submitted." });
    }
    if (!data.questions?.length) return res.status(409).json({ error: "This diagnostic isn't ready yet." });

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
