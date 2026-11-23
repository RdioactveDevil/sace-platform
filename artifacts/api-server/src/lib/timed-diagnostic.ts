/**
 * The timed diagnostic: a 50-mark, 50-minute paper of 20 one-mark multiple
 * choice questions plus 30 marks of bank-format "marked" short answers.
 * A test is timed exactly when it contains a `marked` question; tests without
 * one keep the old, untimed format.
 */

import type { MarkPoint } from "./marking";

export interface DiagnosticQuestion {
  id: number;
  question: string;
  type: "multiple_choice" | "short_answer" | "extended_response" | "marked";
  options?: string[];
  correct_answer: string;
  marks: number;
  difficulty: "easy" | "moderate" | "exam";
  topic: string;
  subtopic?: string;
  solution_notes?: string;
  marking_scheme?: MarkPoint[];
  solution?: string;
  table_data?: unknown;
  diagram?: unknown;
  bank_question_id?: string;
}

export const TIME_LIMIT_MINUTES = 50;
export const MCQ_COUNT = 20;
export const SHORT_ANSWER_MARKS = 30;
/** A marking run older than this is treated as stalled and may be re-run. */
export const REMARK_AFTER_MS = 10 * 60_000;
/** Background marking gives up after this many failed attempts. */
export const MAX_MARKING_ATTEMPTS = 3;

/** True when every subject is an English or Writing subject. */
export function isEnglishOnly(subjects: { name: string }[]): boolean {
  return subjects.every((s) => {
    const n = s.name.toLowerCase();
    return n.includes("english") || n.includes("writing");
  });
}

/** Null when the questions are 20 one-mark MC plus `marked` questions totalling 30; else the problem. */
export function checkTimedTest(questions: { type?: unknown; marks: number }[]): string | null {
  const mc = questions.filter((q) => q.type === "multiple_choice");
  const marked = questions.filter((q) => q.type === "marked");
  if (mc.length !== MCQ_COUNT) return `A timed test needs exactly ${MCQ_COUNT} multiple-choice questions (found ${mc.length}).`;
  if (mc.some((q) => q.marks !== 1)) return "Every multiple-choice question in a timed test is worth 1 mark.";
  const total = marked.reduce((n, q) => n + q.marks, 0);
  if (total !== SHORT_ANSWER_MARKS) return `The short-answer questions must total ${SHORT_ANSWER_MARKS} marks (found ${total}).`;
  if (questions.length !== mc.length + marked.length) return "A timed test has only multiple-choice and marked short-answer questions.";
  return null;
}

/** The time limit in minutes, or null for an untimed (old-format) test. */
export function timeLimitFor(questions: readonly object[]): number | null {
  return questions.some((q) => (q as { type?: unknown }).type === "marked") ? TIME_LIMIT_MINUTES : null;
}

/** Bank difficulty (1-5) mapped to the diagnostic's labels. */
export function diagnosticDifficulty(bankDifficulty: number): "moderate" | "exam" {
  return bankDifficulty >= 4 ? "exam" : "moderate";
}

const HIDDEN_FROM_STUDENT = ["correct_answer", "solution_notes", "marking_scheme", "solution", "bank_question_id"] as const;

/** Strip the answers and marking material before a question reaches the student. */
export function sanitiseQuestionsForStudent<T extends object>(
  questions: T[],
): Omit<T, (typeof HIDDEN_FROM_STUDENT)[number]>[] {
  return questions.map((q) => {
    const rest = { ...q } as Record<string, unknown>;
    for (const k of HIDDEN_FROM_STUDENT) delete rest[k];
    return rest as Omit<T, (typeof HIDDEN_FROM_STUDENT)[number]>;
  });
}

/** A bank short answer as a diagnostic question (the id is assigned when the test is assembled). */
export function toDiagnosticShortAnswer(
  row: {
    id?: string; question: string; total_marks: number; marking_scheme: MarkPoint[]; solution: string;
    difficulty: number; table_data?: unknown; diagram?: unknown;
  },
  topic: string,
  subtopic: string,
): DiagnosticQuestion {
  return {
    id: 0,
    question: row.question,
    type: "marked",
    correct_answer: row.solution,
    marks: row.total_marks,
    difficulty: diagnosticDifficulty(row.difficulty),
    topic,
    subtopic,
    marking_scheme: row.marking_scheme,
    solution: row.solution,
    ...(row.table_data ? { table_data: row.table_data } : {}),
    ...(row.diagram ? { diagram: row.diagram } : {}),
    ...(row.id ? { bank_question_id: row.id } : {}),
  };
}

const LETTERS = ["A", "B", "C", "D"] as const;
// An option that points at the others ("All of the above", "Both A and B") has to stay where it is.
const REFERS_TO_OTHERS = /\b(?:all|none|both|neither)\s+of\s+(?:the\s+)?(?:above|these|them)\b|\b[A-D]\s+(?:and|or|&)\s+[A-D]\b/i;
// "Option A", "answer (B)", "choice C" in the marking notes follow the shuffle.
const LETTER_REFERENCE = /\b(option|answer|choice)(\s*\(?)([A-D])(\)?)(?![A-Za-z])/gi;

/**
 * A multiple-choice question with its four options in random order and the
 * answer key (and any "option X" in the notes) moved to match. The question
 * writer tends to put the right answer first, so without this almost every
 * answer would be A. Anything that isn't a well-formed four-option MCQ, or
 * whose options refer to each other, comes back unchanged.
 */
export function shuffleOptions<T extends { type?: unknown; options?: unknown; correct_answer?: unknown; solution_notes?: unknown }>(
  q: T, rand: () => number = Math.random,
): T {
  if (q.type !== "multiple_choice" || !Array.isArray(q.options) || q.options.length !== 4) return q;
  const correct = String(q.correct_answer ?? "").trim().toUpperCase();
  const from = LETTERS.indexOf(correct as (typeof LETTERS)[number]);
  if (from < 0) return q;
  const texts = (q.options as unknown[]).map((o) => String(o ?? "").replace(/^\s*[A-D]\s*[.)]\s*/i, ""));
  if (texts.some((t) => REFERS_TO_OTHERS.test(t))) return q;

  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // order[newIndex] = oldIndex
  const newIndexOf = (oldIndex: number) => order.indexOf(oldIndex);
  const notes = typeof q.solution_notes === "string"
    ? q.solution_notes.replace(LETTER_REFERENCE, (_m, word: string, open: string, letter: string, close: string) =>
      `${word}${open}${LETTERS[newIndexOf(LETTERS.indexOf(letter.toUpperCase() as (typeof LETTERS)[number]))]}${close}`)
    : q.solution_notes;
  return {
    ...q,
    options: order.map((oldIndex, i) => `${LETTERS[i]}. ${texts[oldIndex]}`),
    correct_answer: LETTERS[newIndexOf(from)],
    ...(notes === undefined ? {} : { solution_notes: notes }),
  };
}
