/**
 * Link diagnostics a tutor sends to a prospective student (no account, so
 * student_id is null): where each one is up to, whether its link still works,
 * and when the email job reminds them. Roster students' diagnostics
 * (student_id set) never expire here and get no prospect reminder.
 */

import { MAX_MARKING_ATTEMPTS } from "./timed-diagnostic";

export type ProspectRow = {
  status: "pending" | "completed";
  student_id: string | null;
  prospect_email: string | null;
  created_at: string;
  sent_at: string | null;
  opened_at: string | null;
  started_at: string | null;
  reminded_at: string | null;
  cancelled_at: string | null;
  /** false: a consultation's record with no test yet (left out or null: it has one, as every older row). */
  has_test?: boolean | null;
  /** Timed diagnostics only (50): marked in the background after the student submits. */
  time_limit_minutes?: number | null;
  score_total?: number | null;
  marking_attempts?: number | null;
};

export type DiagnosticStatus = "finished" | "marking" | "marking_failed" | "cancelled" | "no_test" | "expired" | "in_progress" | "opened" | "sent" | "link";

const DAY_MS = 24 * 3_600_000;

/** A link diagnostic's link works for this long after it was (last) sent, or created. */
export const PROSPECT_TTL_MS = 30 * DAY_MS;
/** Remind a prospect who hasn't started this long after it was sent, once. */
export const PROSPECT_REMINDER_AFTER_MS = 2 * DAY_MS;

const isProspect = (r: ProspectRow) => !r.student_id;
/** A consultation's record with no test (yet): nothing to take, send or remind about. */
export const hasNoTest = (r: { has_test?: boolean | null }) => r.has_test === false;

function expired(r: ProspectRow, now: Date): boolean {
  if (!isProspect(r) || r.status === "completed") return false;
  return now.getTime() - Date.parse(r.sent_at ?? r.created_at) > PROSPECT_TTL_MS;
}

export function diagnosticStatus(r: ProspectRow, now: Date): DiagnosticStatus {
  if (r.status === "completed") {
    // Only a timed row is marked after submitting; older rows always have a score.
    if (r.time_limit_minutes != null && r.score_total == null) {
      return (r.marking_attempts ?? 0) >= MAX_MARKING_ATTEMPTS ? "marking_failed" : "marking";
    }
    return "finished";
  }
  if (r.cancelled_at) return "cancelled";
  if (hasNoTest(r)) return "no_test";
  if (expired(r, now)) return "expired";
  if (r.started_at) return "in_progress";
  if (r.opened_at) return "opened";
  return r.prospect_email && r.sent_at ? "sent" : "link";
}

/** Why the test page can't be taken, for the person opening it; null when it can. */
export function unavailableReason(r: ProspectRow, now: Date): string | null {
  if (r.status === "completed") return null;
  if (r.cancelled_at) return "This diagnostic was cancelled.";
  if (expired(r, now)) return "This link has expired. Ask the person who sent it for a new one.";
  return null;
}

/** Whether the tutor can email it again (which also revives an expired one). */
export function canResend(r: ProspectRow, now: Date): boolean {
  if (!isProspect(r) || !r.prospect_email) return false;
  return ["sent", "opened", "in_progress", "expired", "link"].includes(diagnosticStatus(r, now));
}

/**
 * What a resend clears besides the reminder: a pending timed prospect test
 * gets a fresh time limit (its clock and opened mark are reset), so a started
 * one isn't submitted as soon as it's reopened. Untimed rows keep both.
 */
export function resendResetFields(r: Pick<ProspectRow, "status" | "student_id" | "time_limit_minutes">): { started_at?: null; opened_at?: null } {
  if (r.student_id || r.status !== "pending" || !r.time_limit_minutes) return {};
  return { started_at: null, opened_at: null };
}

export function dueForProspectReminder(r: ProspectRow, now: Date): boolean {
  if (!isProspect(r) || !r.prospect_email || !r.sent_at || hasNoTest(r)) return false;
  if (r.status !== "pending" || r.reminded_at || r.started_at || r.cancelled_at || expired(r, now)) return false;
  return now.getTime() - Date.parse(r.sent_at) >= PROSPECT_REMINDER_AFTER_MS;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The prospect's email from the create form: optional; trimmed and lower-cased when given. */
export function normaliseProspectEmail(raw: unknown): { email: string | null } | { error: string } {
  if (raw === undefined || raw === null) return { email: null };
  if (typeof raw !== "string") return { error: "Enter a valid email address." };
  const email = raw.trim().toLowerCase();
  if (!email) return { email: null };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  return { email };
}

/**
 * Who hears that a diagnostic is finished: for a prospect's (no student
 * account) only the tutor who sent it; for a roster student's, the setter and
 * the student's other tutors, once each.
 */
export function doneRecipients(setterId: string, studentId: string | null, rosterTutorIds: string[] | undefined): string[] {
  return studentId ? [...new Set([setterId, ...(rosterTutorIds ?? [])])] : [setterId];
}

/** Columns that tell where a diagnostic is up to (shared by the list and the sign-up flow). */
export const PROSPECT_COLUMNS = "status, student_id, prospect_email, created_at, sent_at, opened_at, started_at, reminded_at, cancelled_at, has_test";

/** What GET /tutor/diagnostic/list selects. The client reads curriculum_id to pre-tick the sign-up subject. */
export const DIAGNOSTIC_LIST_COLUMNS = `id, token, tutor_id, year_level, subjects, curriculum_id, student_name, submitted_by_name, score_total, score_max, time_limit_minutes, marking_attempts, completed_at, pre_call_form_url, parent_email, questionnaire, questionnaire_answers, questionnaire_submitted_at, prospect_is_parent, ${PROSPECT_COLUMNS}`;

const PRIVATE_FIELDS = [
  "questionnaire", "questionnaire_answers", "questionnaire_submitted_at", "questionnaire_reminded_at",
  "prospect_email", "parent_email", "prospect_is_parent", "questionnaire_status", "red_flags",
] as const;

/**
 * A diagnostic as another tutor may see it. The questionnaire and the
 * prospect's and parent's addresses belong to the tutor who set it, even after
 * the prospect joins and other tutors have the student on their roster.
 */
export function forViewer<T extends { tutor_id: string }>(row: T, viewerId: string): T {
  if (row.tutor_id === viewerId) return row;
  const out: Record<string, unknown> = { ...row };
  for (const k of PRIVATE_FIELDS) if (k in out) out[k] = null;
  return out as T;
}
