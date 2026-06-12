import { Router, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL } from "../lib/anthropic-model";
import { latexPromptRule } from "../lib/math-prompt";

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

async function callClaude(system: string, user: string, maxTokens = 4000, prefill?: string): Promise<string> {
  const messages: { role: string; content: string }[] = [{ role: "user", content: user }];
  if (prefill) messages.push({ role: "assistant", content: prefill });

  const res = await fetch(`${getBaseUrl()}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { content?: { text: string }[] };
  const text = data?.content?.[0]?.text || "";
  // Prepend the prefill so the full response is parseable
  return prefill ? prefill + text : text;
}

function extractJson(text: string): unknown {
  try { return JSON.parse(text); } catch { /* continue */ }
  // Strip markdown fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* continue */ }
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* continue */ }
  }
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(text.slice(arrStart, arrEnd + 1)); } catch { /* continue */ }
  }
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
    .select("id, is_tutor, display_name")
    .eq("id", userData.user.id)
    .single<{ id: string; is_tutor: boolean; display_name: string | null }>();

  if (profError || !profile?.is_tutor) {
    res.status(403).json({ error: "Forbidden: caller is not a tutor" });
    return null;
  }

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

  const raw = await callClaude(system, user, 8000, "{");
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

    const raw = await callClaude(system, user, 3000, "{");
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

  const reportRaw = await callClaude(reportSystem, reportUser, 2000, "{");
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

/** GET /tutor/diagnostic/list — All assessments for this tutor */
router.get("/tutor/diagnostic/list", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, tutorId } = ctx;

    const { data, error } = await admin
      .from("diagnostic_assessments")
      .select("id, token, year_level, subjects, status, student_name, submitted_by_name, score_total, score_max, created_at, completed_at, pre_call_form_url")
      .eq("tutor_id", tutorId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "https://app.gradefarm.com.au";
    const rows = (data || []).map((row) => ({
      ...row,
      link: `${origin}/diagnostic/${row.token}`,
    }));

    return res.json({ assessments: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

/** GET /tutor/diagnostic/:id/report — Full report for a completed assessment */
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
      .eq("tutor_id", tutorId)
      .single<DiagnosticAssessment>();

    if (error || !data) return res.status(404).json({ error: "Assessment not found" });

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
      .select("id, token, year_level, subjects, questions, status, student_name, score_max, pre_call_form_url, completed_at")
      .eq("token", token)
      .single<Pick<DiagnosticAssessment, "id" | "token" | "year_level" | "subjects" | "questions" | "status" | "student_name" | "score_max" | "pre_call_form_url" | "completed_at">>();

    if (error || !data) return res.status(404).json({ error: "Assessment not found" });

    // Never send correct answers to the student
    return res.json({
      assessment: {
        ...data,
        questions: sanitiseQuestionsForStudent(data.questions),
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

    // Run AI marking
    const report = await markAssessment(data.questions, answers, data.year_level, data.subjects);

    // Persist results
    const { error: updateError } = await admin
      .from("diagnostic_assessments")
      .update({
        status:            "completed",
        completed_at:      new Date().toISOString(),
        submitted_by_name: (studentName || "").trim() || null,
        student_answers:   answers,
        report:            report,
        score_total:       report.total_score,
      })
      .eq("token", token);

    if (updateError) throw new Error(updateError.message);

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

export default router;
