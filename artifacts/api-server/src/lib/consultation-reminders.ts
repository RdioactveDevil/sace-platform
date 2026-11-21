/** Pure timing rules for consultation reminder emails (the job is in automated-emails.ts). */

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

type Recipient = "guest" | "parent" | "tutor";

/** A reminder more than this late isn't sent ("tomorrow" an hour before the call reads wrong). */
export const STALE_AFTER_MS = 30 * MIN;

type Planned = { minutes: number; recipient: string };

/**
 * What to do about reminders now. Each lead in `reminder_minutes` is due from
 * `start − lead` until the call starts, once per recipient (`sent` holds
 * "minutes:recipient" keys). `send` is the one reminder to email per recipient:
 * the smallest non-stale due lead. `skip` are due leads to claim without
 * sending: stale ones (more than 30 minutes past their time, e.g. the call was
 * moved sooner or the job was down), ones superseded by a smaller due lead, and
 * ones whose time had passed when the call was booked (the booking email covered it).
 */
export function dueConsultationReminders(
  s: { scheduled_at: string; created_at: string; reminder_minutes: number[] },
  sent: Set<string>,
  recipients: Recipient[],
  now: number,
): { send: Planned[]; skip: Planned[] } {
  const plan: { send: Planned[]; skip: Planned[] } = { send: [], skip: [] };
  const start = Date.parse(s.scheduled_at);
  const booked = Date.parse(s.created_at);
  if (!Number.isFinite(start) || now >= start) return plan;
  const leads = [...new Set(s.reminder_minutes)].sort((a, b) => a - b); // smallest first
  for (const recipient of recipients) {
    let sending = false;
    for (const minutes of leads) {
      if (sent.has(`${minutes}:${recipient}`)) continue;
      const at = start - minutes * MIN;
      if (now < at) continue;
      const sendable = now - at <= STALE_AFTER_MS && !(Number.isFinite(booked) && booked > at) && !sending;
      if (sendable) {
        plan.send.push({ minutes, recipient });
        sending = true;
      } else {
        plan.skip.push({ minutes, recipient });
      }
    }
  }
  return plan;
}

/** How long after a prospect completes a diagnostic we email them to book, and when we stop. */
export const BOOK_YOUR_CALL_AFTER_MS = DAY;
export const BOOK_YOUR_CALL_UNTIL_MS = 14 * DAY;

/** A link diagnostic finished a day ago, no call booked, the tutor takes bookings: one email. */
export function dueBookYourCall(
  d: { status: string; student_id: string | null; prospect_email: string | null; completed_at: string | null; booking_reminded_at: string | null },
  hasLiveBooking: boolean,
  tutorHasHours: boolean,
  now: number,
): boolean {
  if (d.status !== "completed" || d.student_id || !d.prospect_email || !d.completed_at) return false;
  if (d.booking_reminded_at || hasLiveBooking || !tutorHasHours) return false;
  const age = now - Date.parse(d.completed_at);
  return age >= BOOK_YOUR_CALL_AFTER_MS && age < BOOK_YOUR_CALL_UNTIL_MS;
}
