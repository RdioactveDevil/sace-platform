/**
 * Consultation calls (a `tutoring_sessions` row with session_type
 * 'consultation'): who can join, the guest's link, and checking what a tutor
 * or a prospect sends the booking routes. Pure: no I/O.
 */
import { randomBytes } from "node:crypto";
import { DEFAULT_BOOKING, validateWeeklyHours, type BookingSettings, type WeeklyHours } from "./booking-slots";
import { checkIcalUrl } from "./busy-calendar";
import { normaliseProspectEmail } from "./prospect-status";

const MIN = 60_000;
/** The guest's join link opens this long before the start… */
export const GUEST_JOIN_EARLY_MS = 10 * MIN;
/** …and closes this long after it. */
export const GUEST_JOIN_LATE_MS = 120 * MIN;

/**
 * The "no participants means anyone with the link can join" rule for lessons.
 * It never applies to a consultation: only its tutor (by account) and its
 * guest (by token) get in.
 */
export function openSessionAllowed(sessionType: string, participantCount: number): boolean {
  if (sessionType === "consultation") return false;
  return participantCount === 0;
}

/** Whether a consultation's guest link can get a room token now. */
export function guestJoinAllowed(
  s: { status: string; scheduled_at: string; duration_minutes: number },
  now: number,
): boolean {
  if (s.status === "cancelled" || s.status === "completed") return false;
  const start = Date.parse(s.scheduled_at);
  if (!Number.isFinite(start)) return false;
  return now >= start - GUEST_JOIN_EARLY_MS && now <= start + GUEST_JOIN_LATE_MS;
}

/**
 * The LiveKit identity for one guest join. Unique per join: the student and a
 * parent share the link, and LiveKit disconnects an earlier participant when
 * a second one joins with the same identity.
 */
export function guestIdentity(sessionId: string): string {
  return `guest-${sessionId}-${randomBytes(6).toString("base64url")}`;
}

/**
 * Whether opening a session (POST /sessions/:id/token) marks it active.
 * Lessons: always, as before. A consultation only from when its join window
 * opens: the tutor opening it early must leave the booking live (it stays
 * reschedulable, cancellable and blocks a second booking).
 */
export function shouldMarkActive(sessionType: string, scheduledAt: string, _durationMinutes: number, now: number): boolean {
  if (sessionType !== "consultation") return true;
  const start = Date.parse(scheduledAt);
  return Number.isFinite(start) && now >= start - GUEST_JOIN_EARLY_MS;
}

/**
 * Whether the tutor ending a session (POST /sessions/:id/end) marks it
 * completed. Lessons: always, as before. A consultation only once its join
 * window has opened: a tutor who opens the room early and leaves must not
 * close the booking (the guest still has the call).
 */
export function shouldMarkCompleted(sessionType: string, scheduledAt: string, durationMinutes: number, now: number): boolean {
  return shouldMarkActive(sessionType, scheduledAt, durationMinutes, now);
}

/** A consultation's LiveKit room: unique even for two bookings in the same millisecond. */
export function consultationRoomName(tutorId: string, now = Date.now()): string {
  return `session-${tutorId.slice(0, 8)}-${now}-${randomBytes(6).toString("base64url").slice(0, 6)}`;
}

/** A guest's join token: 32 random bytes, base64url (43 characters). */
export function newGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

// ── Settings ────────────────────────────────────────────────────────────────

/** The zones a tutor can set their hours in. */
export const TUTOR_TIME_ZONES = [
  "Australia/Adelaide",
  "Australia/Darwin",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Hobart",
  "Australia/Perth",
] as const;

const isTutorZone = (z: unknown): z is string => typeof z === "string" && (TUTOR_TIME_ZONES as readonly string[]).includes(z);

/** A prospect's browser zone, if it's a real IANA zone; otherwise the tutor's. */
export function guestTimeZone(raw: unknown, fallback: string): string {
  if (typeof raw !== "string" || !raw || raw.length > 64) return fallback;
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: raw });
    return raw;
  } catch {
    return fallback;
  }
}

/**
 * Where the student is, as the tutor picked it when booking or moving a call
 * (a real IANA zone), or null when nothing usable was sent. The student's and
 * parent's emails give the call's time in this zone.
 */
export function chosenGuestZone(raw: unknown): string | null {
  const zone = guestTimeZone(raw, "");
  return zone || null;
}

export const DEFAULT_REMINDERS = [1440, 60];

/** Reminder offsets in minutes before the call: 1–5 of them, each 5 minutes to 7 days. Largest first, no repeats. */
export function checkReminders(raw: unknown): { reminders: number[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length < 1) return { error: "Choose at least one reminder." };
  if (!raw.every((n) => Number.isInteger(n) && n >= 5 && n <= 10080)) {
    return { error: "Each reminder must be between 5 minutes and 7 days before the call." };
  }
  const reminders = [...new Set(raw as number[])].sort((a, b) => b - a);
  if (reminders.length > 5) return { error: "Choose at most 5 reminders." };
  return { reminders };
}

/** A tutor_booking_settings row. */
export type SettingsRow = {
  tutor_id: string;
  time_zone: string;
  weekly_hours: WeeklyHours;
  call_minutes: number;
  gap_minutes: number;
  min_notice_hours: number;
  max_days_ahead: number;
  reminder_minutes: number[];
  busy_ical_url: string | null;
  busy_ical_checked_at: string | null;
  busy_ical_error: string | null;
  invite_email: string | null;
};

export const SETTINGS_COLUMNS =
  "tutor_id, time_zone, weekly_hours, call_minutes, gap_minutes, min_notice_hours, max_days_ahead, reminder_minutes, busy_ical_url, busy_ical_checked_at, busy_ical_error, invite_email";

/** The row a tutor without one has. */
export function defaultSettingsRow(tutorId: string): SettingsRow {
  return {
    tutor_id: tutorId,
    time_zone: DEFAULT_BOOKING.timeZone,
    weekly_hours: {},
    call_minutes: DEFAULT_BOOKING.callMinutes,
    gap_minutes: DEFAULT_BOOKING.gapMinutes,
    min_notice_hours: DEFAULT_BOOKING.minNoticeHours,
    max_days_ahead: DEFAULT_BOOKING.maxDaysAhead,
    reminder_minutes: [...DEFAULT_REMINDERS],
    busy_ical_url: null,
    busy_ical_checked_at: null,
    busy_ical_error: null,
    invite_email: null,
  };
}

/** What openSlots needs, plus the default reminders. A zone that isn't a tutor zone reads as Adelaide. */
export function settingsFromRow(row: SettingsRow | null): BookingSettings & { reminderMinutes: number[] } {
  const r = row ?? defaultSettingsRow("");
  const hours = validateWeeklyHours(r.weekly_hours ?? {}, r.call_minutes);
  return {
    timeZone: isTutorZone(r.time_zone) ? r.time_zone : DEFAULT_BOOKING.timeZone,
    weeklyHours: "hours" in hours ? hours.hours : {},
    callMinutes: r.call_minutes,
    gapMinutes: r.gap_minutes,
    minNoticeHours: r.min_notice_hours,
    maxDaysAhead: r.max_days_ahead,
    reminderMinutes: r.reminder_minutes?.length ? [...r.reminder_minutes] : [...DEFAULT_REMINDERS],
  };
}

/** Whether any weekly hours are set (booking is offered only then). */
export const hasHours = (h: WeeklyHours): boolean => Object.values(h).some((blocks) => (blocks?.length ?? 0) > 0);

/** The settings as the tutor sees them: never the calendar address itself. */
export function publicSettings(row: SettingsRow, signInEmail: string) {
  const s = settingsFromRow(row);
  return {
    timeZone: s.timeZone,
    weeklyHours: s.weeklyHours,
    callMinutes: s.callMinutes,
    gapMinutes: s.gapMinutes,
    minNoticeHours: s.minNoticeHours,
    maxDaysAhead: s.maxDaysAhead,
    reminderMinutes: s.reminderMinutes,
    hasCalendar: !!row.busy_ical_url,
    calendarCheckedAt: row.busy_ical_checked_at,
    calendarError: row.busy_ical_error,
    /** Where calendar invites go; null = the sign-in email. */
    inviteEmail: row.invite_email,
    defaultInviteEmail: signInEmail,
  };
}

type SettingsUpdate = Omit<SettingsRow, "tutor_id" | "busy_ical_url" | "busy_ical_checked_at" | "busy_ical_error"> &
  Partial<Pick<SettingsRow, "busy_ical_url" | "busy_ical_checked_at" | "busy_ical_error">>;

function intIn(v: unknown, lo: number, hi: number): boolean {
  return Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
}

/**
 * Check a PUT /tutor/booking-settings body against the current row. Omitted
 * fields keep their values; `busyIcalUrl: null` (or "") clears the calendar.
 * Returns the full set of columns to write.
 */
export function checkSettingsInput(body: unknown, current: SettingsRow): { update: SettingsUpdate } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Send the settings as an object." };
  const b = body as Record<string, unknown>;
  const pick = <T>(key: string, cur: T): unknown => (b[key] === undefined ? cur : b[key]);

  const timeZone = pick("timeZone", current.time_zone);
  if (!isTutorZone(timeZone)) return { error: "Choose an Australian time zone." };
  const callMinutes = pick("callMinutes", current.call_minutes);
  if (!intIn(callMinutes, 15, 180)) return { error: "Call length must be 15 to 180 minutes." };
  const gapMinutes = pick("gapMinutes", current.gap_minutes);
  if (!intIn(gapMinutes, 0, 120)) return { error: "The gap between calls must be 0 to 120 minutes." };
  const minNoticeHours = pick("minNoticeHours", current.min_notice_hours);
  if (!intIn(minNoticeHours, 0, 168)) return { error: "Earliest booking must be 0 to 168 hours ahead." };
  const maxDaysAhead = pick("maxDaysAhead", current.max_days_ahead);
  if (!intIn(maxDaysAhead, 1, 90)) return { error: "Furthest ahead must be 1 to 90 days." };

  const hours = validateWeeklyHours(pick("weeklyHours", current.weekly_hours ?? {}), callMinutes as number);
  if ("error" in hours) return { error: hours.error };

  const reminders = checkReminders(pick("reminderMinutes", current.reminder_minutes));
  if ("error" in reminders) return { error: reminders.error };

  let inviteEmail = current.invite_email;
  if (b.inviteEmail !== undefined) {
    const checked = normaliseProspectEmail(b.inviteEmail);
    if ("error" in checked) return { error: "Enter a valid email address for calendar invites." };
    inviteEmail = checked.email;
  }

  const update: SettingsUpdate = {
    time_zone: timeZone,
    weekly_hours: hours.hours,
    call_minutes: callMinutes as number,
    gap_minutes: gapMinutes as number,
    min_notice_hours: minNoticeHours as number,
    max_days_ahead: maxDaysAhead as number,
    reminder_minutes: reminders.reminders,
    invite_email: inviteEmail,
  };

  if (b.busyIcalUrl !== undefined) {
    const checked = checkIcalUrl(b.busyIcalUrl);
    if ("error" in checked) return { error: checked.error };
    if (checked.url !== current.busy_ical_url) {
      update.busy_ical_url = checked.url;
      update.busy_ical_checked_at = null;
      update.busy_ical_error = null;
    }
  }
  return { update };
}

// ── Booking ─────────────────────────────────────────────────────────────────

/** The unique index that allows one live consultation per tutor and prospect email. */
const ONE_LIVE_CONSULTATION = "tutoring_sessions_one_live_consultation";

/**
 * Postgres errors from book_consultation / reschedule_consultation that mean
 * "pick another time" or "this prospect already has a call". Any other unique
 * clash (a room name, a guest token) is a plain failure the caller can retry.
 */
export function bookingError(
  err: { message?: string; code?: string; details?: string } | null | undefined,
): "slot_taken" | "duplicate" | null {
  if (!err) return null;
  if (err.message?.includes("slot_taken")) return "slot_taken";
  if (err.code === "23505" && `${err.message ?? ""} ${err.details ?? ""}`.includes(ONE_LIVE_CONSULTATION)) return "duplicate";
  return null;
}

/**
 * The parent email a booking is made with. Left out of the request: the one
 * on the diagnostic. Sent empty or null: the person booking cleared it, so no
 * parent (never the diagnostic's).
 */
export function bookingParentEmail(raw: unknown, diagnosticParent: string | null): { email: string | null } | { error: string } {
  return normaliseProspectEmail(raw === undefined ? diagnosticParent : raw);
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** A start time sent by a client: an ISO date-time with its zone. Epoch ms, or null. */
export function parseStart(raw: unknown): number | null {
  if (typeof raw !== "string" || !ISO.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function startIsOffered(start: number, slots: string[]): boolean {
  return slots.some((s) => Date.parse(s) === start);
}

/** Offsets that were on a booking and aren't any more (their "sent" rows are cleared). */
export function removedReminders(previous: number[] | null | undefined, next: number[]): number[] {
  return (previous ?? []).filter((m) => !next.includes(m));
}
