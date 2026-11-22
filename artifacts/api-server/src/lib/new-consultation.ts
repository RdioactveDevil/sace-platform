/**
 * The "New consultation" form (POST /tutor/consultations/new): the tutor books
 * a call first and ticks who gets it and what goes with it. Pure checks only;
 * the route does the writing and sending.
 *
 * Every existing prospect flow is keyed on one address, so each consultation
 * has a primary recipient: the student if "Send to student" is ticked, else
 * the parent. The parent gets a copy only when both are ticked. A typed but
 * unticked address is not kept.
 */
import { checkReminders, parseStart } from "./consultation-access";
import { normaliseProspectEmail } from "./prospect-status";
import { validateQuestionnaire, type Questionnaire } from "./questionnaire";

export const MAX_STUDENT_NAME = 100;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A generated test, as the Diagnostic tab's create form sends it. */
export type TestInput = {
  yearLevel: string;
  subjects: Array<Record<string, unknown> & { name: string; curriculumId?: string; subtopicIds?: string[] }>;
  questions: Array<Record<string, unknown> & { marks: number }>;
  /** Total marks (the record's score_max). */
  scoreMax: number;
};

/**
 * A test from a create form (Diagnostic tab, New consultation, Send a test):
 * a year level, at least one subject, and the previewed questions.
 */
export function testInput(raw: unknown): TestInput | { error: string } {
  if (!isObj(raw)) return { error: "yearLevel is required" };
  const { yearLevel, subjects, questions } = raw;
  if (typeof yearLevel !== "string" || !yearLevel.trim()) return { error: "yearLevel is required" };
  if (!Array.isArray(questions) || questions.length === 0) return { error: "questions are required" };
  if (!questions.every((q) => isObj(q) && typeof q.question === "string" && Number.isFinite(q.marks) && (q.marks as number) >= 0)) {
    return { error: "Every question needs its text and marks." };
  }
  if (!Array.isArray(subjects) || subjects.length === 0 || !subjects.every((s) => isObj(s) && typeof s.name === "string")) {
    return { error: "At least one subject is required" };
  }
  return {
    yearLevel: yearLevel.trim(),
    subjects: subjects as TestInput["subjects"],
    questions: questions as TestInput["questions"],
    scoreMax: (questions as Array<{ marks: number }>).reduce((n, q) => n + q.marks, 0),
  };
}

export type NewConsultation = {
  studentName: string;
  primary: { email: string; isParent: boolean };
  /** The parent's copy: only when both are ticked (and the addresses differ). */
  parentCopy: string | null;
  /** Epoch ms. */
  start: number;
  /** Left out: the tutor's defaults. */
  reminderMinutes?: number[];
  /** "default": a snapshot of the tutor's own; null: no questionnaire. */
  questionnaire: Questionnaire | null | "default";
  test: TestInput | null;
};

export function newConsultationInput(raw: unknown, now = Date.now()): { ok: NewConsultation } | { error: string } {
  const body = isObj(raw) ? raw : {};
  const studentName = typeof body.studentName === "string" ? body.studentName.trim().slice(0, MAX_STUDENT_NAME) : "";
  if (!studentName) return { error: "Enter the student's name." };

  const toStudent = body.sendToStudent === true;
  const toParent = body.sendToParent === true;
  if (!toStudent && !toParent) return { error: "Choose who to send it to: the student, the parent or both." };
  let studentEmail: string | null = null;
  if (toStudent) {
    const e = normaliseProspectEmail(body.studentEmail);
    if ("error" in e || !e.email) return { error: "Enter a valid email address for the student." };
    studentEmail = e.email;
  }
  let parentEmail: string | null = null;
  if (toParent) {
    const e = normaliseProspectEmail(body.parentEmail);
    if ("error" in e || !e.email) return { error: "Enter a valid email address for the parent." };
    parentEmail = e.email;
  }
  const primary = studentEmail ? { email: studentEmail, isParent: false } : { email: parentEmail!, isParent: true };
  const parentCopy = studentEmail && parentEmail && parentEmail !== studentEmail ? parentEmail : null;

  const start = parseStart(body.start);
  if (start === null) return { error: "Choose a date and time." };
  if (start <= now) return { error: "Choose a time in the future." };

  let reminderMinutes: number[] | undefined;
  if (body.reminderMinutes !== undefined) {
    const r = checkReminders(body.reminderMinutes);
    if ("error" in r) return { error: r.error };
    reminderMinutes = r.reminders;
  }

  let questionnaire: NewConsultation["questionnaire"] = "default";
  if (body.questionnaire === null) questionnaire = null;
  else if (body.questionnaire !== undefined && body.questionnaire !== "default") {
    const v = validateQuestionnaire(body.questionnaire);
    if ("error" in v) return { error: v.error };
    questionnaire = v.questionnaire;
  }

  let test: TestInput | null = null;
  if (body.test !== undefined && body.test !== null) {
    const t = testInput(body.test);
    if ("error" in t) return { error: t.error };
    test = t;
  }

  return {
    ok: { studentName, primary, parentCopy, start, ...(reminderMinutes ? { reminderMinutes } : {}), questionnaire, test },
  };
}
