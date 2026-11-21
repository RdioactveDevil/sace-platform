/** Pure timing rules for consultation reminder emails (the job is in automated-emails.ts). */

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

type Recipient = "guest" | "parent" | "tutor";

/**
 * Reminders to send now: each lead in `reminder_minutes` is due from
 * `start − lead` until the call starts, once per recipient. One whose time had
 * already passed when the call was booked is skipped (the booking email
 * covered it). `sent` holds "minutes:recipient" keys.
 */
export function dueConsultationReminders(
  s: { scheduled_at: string; created_at: string; reminder_minutes: number[] },
  sent: Set<string>,
  recipients: Recipient[],
  now: number,
): Array<{ minutes: number; recipient: string }> {
  const start = Date.parse(s.scheduled_at);
  const booked = Date.parse(s.created_at);
  const out: Array<{ minutes: number; recipient: string }> = [];
  if (!Number.isFinite(start) || now >= start) return out;
  for (const minutes of [...s.reminder_minutes].sort((a, b) => b - a)) {
    const at = start - minutes * MIN;
    if (now < at) continue;
    if (Number.isFinite(booked) && booked > at) continue;
    for (const recipient of recipients) {
      if (!sent.has(`${minutes}:${recipient}`)) out.push({ minutes, recipient });
    }
  }
  return out;
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
