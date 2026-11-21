/**
 * Link diagnostics a tutor sends to a prospective student (no account, so
 * student_id is null): where each one is up to, whether its link still works,
 * and when the email job reminds them. Roster students' diagnostics
 * (student_id set) never expire here and get no prospect reminder.
 */

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
};

export type DiagnosticStatus = "finished" | "cancelled" | "expired" | "in_progress" | "opened" | "sent" | "link";

const DAY_MS = 24 * 3_600_000;
/** A link diagnostic's link works for this long after it was (last) sent, or created. */
export const PROSPECT_TTL_MS = 30 * DAY_MS;
/** Remind a prospect who hasn't started this long after it was sent, once. */
export const PROSPECT_REMINDER_AFTER_MS = 2 * DAY_MS;

const isProspect = (r: ProspectRow) => !r.student_id;

function expired(r: ProspectRow, now: Date): boolean {
  if (!isProspect(r) || r.status === "completed") return false;
  return now.getTime() - Date.parse(r.sent_at ?? r.created_at) > PROSPECT_TTL_MS;
}

export function diagnosticStatus(r: ProspectRow, now: Date): DiagnosticStatus {
  if (r.status === "completed") return "finished";
  if (r.cancelled_at) return "cancelled";
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

export function dueForProspectReminder(r: ProspectRow, now: Date): boolean {
  if (!isProspect(r) || !r.prospect_email || !r.sent_at) return false;
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
