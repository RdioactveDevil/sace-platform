/**
 * Marking a diagnostic: multiple choice by key, bank-format `marked` short
 * answers with markAnswer() (mark point by mark point, totals added up here),
 * the old short_answer / extended_response questions in one Claude batch, then
 * the narrative (pain points, patterns, recommendations, summary).
 *
 * A timed diagnostic is stored at submit and marked afterwards: markAndStore()
 * claims the row, marks it and writes `report` + `score_total`; the email cron
 * re-runs stalled ones (remarkStaleDiagnostics) up to MAX_MARKING_ATTEMPTS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaude, extractJson } from "./diagnostic-claude";
import { logger } from "./logger";
import { unavailableReason, type ProspectRow } from "./prospect-status";
import { MAX_RESPONSE_CHARS, markAnswer, type MarkableQuestion, type MarkingResult, type PointResult } from "./marking";
import { MAX_MARKING_ATTEMPTS, REMARK_AFTER_MS, type DiagnosticQuestion } from "./timed-diagnostic";

export interface QuestionResult {
  id: number;
  correct: boolean;
  marks_awarded: number;
  marks_possible: number;
  student_answer: string;
  correct_answer: string;
  feedback: string;
  /** A `marked` question's point-by-point result. */
  points?: PointResult[];
}

export interface TopicBreakdown {
  topic: string;
  marks_awarded: number;
  marks_possible: number;
  percentage: number;
}

export interface SubtopicBreakdown extends TopicBreakdown {
  subtopic: string;
}

export interface DiagnosticReport {
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

/** What marking calls out to; tests stub both. */
export interface MarkingDeps {
  /** Marks one `marked` short answer. */
  markAnswer: (q: MarkableQuestion, answer: string) => Promise<MarkingResult>;
  /** Writes the report narrative: returns the model's raw (JSON) text. */
  narrate: (system: string, user: string) => Promise<string>;
}

const DEFAULT_DEPS: MarkingDeps = {
  markAnswer,
  narrate: (system, user) => callClaude(system, user, 2600, true),
};

export function performanceBand(pct: number): string {
  if (pct >= 90) return "Outstanding";
  if (pct >= 75) return "High";
  if (pct >= 60) return "Satisfactory";
  if (pct >= 40) return "Developing";
  return "Beginning";
}

export async function markAssessment(
  questions: DiagnosticQuestion[],
  answers: Record<string, string>,
  yearLevel: string,
  subjects: { name: string }[],
  deps: MarkingDeps = DEFAULT_DEPS,
): Promise<DiagnosticReport> {
  // Auto-mark MC questions
  const mcResults: QuestionResult[] = [];
  const markedQueue: { q: DiagnosticQuestion; studentAnswer: string }[] = [];
  const aiMarkingQueue: { q: DiagnosticQuestion; studentAnswer: string }[] = [];

  for (const q of questions) {
    const studentAnswer = String(answers[String(q.id)] ?? "").trim();
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
    } else if (q.type === "marked") {
      markedQueue.push({ q, studentAnswer });
    } else {
      aiMarkingQueue.push({ q, studentAnswer });
    }
  }

  // Bank-format short answers, mark point by mark point, in parallel. Any
  // failure rejects the whole marking (never a silently zeroed question).
  const subject = subjects[0]?.name ?? null;
  const markedResults: QuestionResult[] = await Promise.all(markedQueue.map(async ({ q, studentAnswer }) => {
    const base = { id: q.id, marks_possible: q.marks, student_answer: studentAnswer, correct_answer: q.correct_answer };
    if (!studentAnswer) {
      return { ...base, correct: false, marks_awarded: 0, feedback: "No answer given.", points: [] };
    }
    const result = await deps.markAnswer({
      subject,
      question: q.question,
      total_marks: q.marks,
      marking_scheme: q.marking_scheme,
      solution: q.solution ?? null,
      table_data: q.table_data,
      diagram: q.diagram,
    }, studentAnswer);
    const awarded = Math.min(q.marks, Math.max(0, result.awarded));
    return { ...base, correct: awarded >= q.marks, marks_awarded: awarded, feedback: result.summary, points: result.marks };
  }));

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

  const allResults = [...mcResults, ...markedResults, ...aiResults].sort((a, b) => a.id - b.id);

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

  const reportRaw = await deps.narrate(reportSystem, reportUser);
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

// ── Timed diagnostics: store at submit, mark afterwards ──────────────────────

/** A timed submission's answers: string answers to this test's questions only, each capped like any marked answer. */
export function timedAnswers(questions: { id: number }[], answers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of questions) {
    const a = answers[String(q.id)];
    if (typeof a === "string") out[String(q.id)] = a.slice(0, MAX_RESPONSE_CHARS);
  }
  return out;
}

/**
 * Store a timed submission: one conditional update that completes the row only
 * while it is still pending, so a double submit (or a lost race) stores nothing.
 */
export async function storeTimedSubmission(
  admin: SupabaseClient,
  token: string,
  fields: { student_answers: Record<string, string>; submitted_by_name: string | null; completed_at: string },
): Promise<"stored" | "already_submitted"> {
  const { data, error } = await admin
    .from("diagnostic_assessments")
    .update({ status: "completed", ...fields })
    .eq("token", token).eq("status", "pending")
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ? "stored" : "already_submitted";
}

/**
 * Why the test page, its start or a submit is refused, or null. As
 * unavailableReason(), except that a timed test the student has started can
 * still be loaded, resumed and submitted after its link expires (a lost
 * connection mustn't lose the test); a cancelled one is still refused.
 */
export function submitUnavailableReason(r: ProspectRow & { time_limit_minutes: number | null }, now: Date): string | null {
  if (r.time_limit_minutes != null && !r.student_id && r.started_at && !r.cancelled_at) return null;
  return unavailableReason(r, now);
}

export interface MarkingStateRow {
  time_limit_minutes: number | null;
  status: string;
  report: unknown;
  marking_started_at: string | null;
  marking_attempts: number;
}

/** A timed, completed diagnostic with no report whose marking never started or stalled, with attempts left. */
export function needsRemark(row: MarkingStateRow, now: Date): boolean {
  if (row.time_limit_minutes == null || row.status !== "completed" || row.report != null) return false;
  if ((row.marking_attempts ?? 0) >= MAX_MARKING_ATTEMPTS) return false;
  if (!row.marking_started_at) return true;
  return now.getTime() - new Date(row.marking_started_at).getTime() > REMARK_AFTER_MS;
}

type MarkRow = MarkingStateRow & {
  id: string;
  questions: DiagnosticQuestion[];
  student_answers: Record<string, string> | null;
  year_level: string;
  subjects: { name: string }[];
};

/**
 * Claim a completed diagnostic's marking, mark it and store the report. The
 * claim is a conditional update on the attempt count read here, so two runners
 * never both mark it. Errors are logged, never thrown (attempts stay counted).
 * Resolves to whether this run stored a report.
 */
export async function markAndStore(admin: SupabaseClient, id: string, deps: MarkingDeps = DEFAULT_DEPS): Promise<boolean> {
  try {
    const { data: rows, error } = await admin
      .from("diagnostic_assessments")
      .select("id, status, time_limit_minutes, report, marking_started_at, marking_attempts, questions, student_answers, year_level, subjects")
      .eq("id", id).limit(1);
    if (error) throw new Error(error.message);
    const row = (rows as MarkRow[] | null)?.[0];
    if (!row || row.status !== "completed" || row.report != null) return false;
    const attempts = row.marking_attempts ?? 0;
    if (attempts >= MAX_MARKING_ATTEMPTS) return false;

    const { data: claimed, error: claimErr } = await admin
      .from("diagnostic_assessments")
      .update({ marking_started_at: new Date().toISOString(), marking_attempts: attempts + 1 })
      .eq("id", id).is("report", null).eq("marking_attempts", attempts)
      .select("id");
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed?.length) return false; // another runner has it

    const report = await markAssessment(row.questions ?? [], row.student_answers ?? {}, row.year_level, row.subjects ?? [], deps);
    const { data: stored, error: storeErr } = await admin
      .from("diagnostic_assessments")
      .update({ report, score_total: report.total_score })
      .eq("id", id).is("report", null)
      .select("id");
    if (storeErr) throw new Error(storeErr.message);
    return !!stored?.length;
  } catch (err) {
    logger.error({ err, id }, "diagnostic: marking failed");
    return false;
  }
}

/** The cron re-marks at most this many diagnostics a run (each is several model calls). */
const REMARK_BATCH = 2;
/** It starts no new one once this long has passed since the cron handler began (the function has 300 s). */
export const REMARK_BUDGET_MS = 90_000;

/**
 * The cron's safety net: mark up to 2 timed diagnostics whose marking never
 * finished, one at a time, starting none once REMARK_BUDGET_MS has passed
 * since `startedAt` (the cron handler's start; default: now).
 */
export async function remarkStaleDiagnostics(
  admin: SupabaseClient,
  now: Date,
  opts: { startedAt?: number; clock?: () => number; deps?: MarkingDeps } = {},
): Promise<{ marked: number }> {
  const clock = opts.clock ?? Date.now;
  const startedAt = opts.startedAt ?? clock();
  const { data, error } = await admin
    .from("diagnostic_assessments")
    .select("id, time_limit_minutes, status, report, marking_started_at, marking_attempts")
    .not("time_limit_minutes", "is", null)
    .eq("status", "completed")
    .is("report", null)
    .lt("marking_attempts", MAX_MARKING_ATTEMPTS)
    .order("completed_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  const due = ((data ?? []) as (MarkingStateRow & { id: string })[]).filter((r) => needsRemark(r, now)).slice(0, REMARK_BATCH);
  let marked = 0;
  for (const r of due) {
    if (clock() - startedAt >= REMARK_BUDGET_MS) break;
    if (await markAndStore(admin, r.id, opts.deps)) marked++;
  }
  return { marked };
}
