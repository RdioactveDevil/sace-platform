/**
 * The I/O half of consultation booking (routes/consultations.ts): a tutor's
 * settings, their open times (weekly hours minus GradeFarm sessions and their
 * calendar's busy times), live bookings, and the emails with calendar
 * invites. Pure rules live in consultation-access.ts.
 */
import { questionnaireLinkFor } from "./questionnaire";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resend } from "resend";
import { openSlots, type Interval } from "./booking-slots";
import { fetchBusy } from "./busy-calendar";
import { consultationIcs } from "./consultation-ics";
import {
  consultationBookedEmail,
  consultationCancelledEmail,
  consultationChangedEmail,
  consultationInviteEmail,
} from "./consultation-emails";
import { SETTINGS_COLUMNS, defaultSettingsRow, hasHours, settingsFromRow, type SettingsRow } from "./consultation-access";
import { appUrl, EMAIL_FROM, getResend, sendEmail } from "./email";
import { logger } from "./logger";
import { prospectLink, prospectSenderName } from "./prospect-emails";

const DAY = 86_400_000;
const MIN = 60_000;

export async function loadSettings(admin: SupabaseClient, tutorId: string): Promise<SettingsRow> {
  const { data, error } = await admin
    .from("tutor_booking_settings").select(SETTINGS_COLUMNS).eq("tutor_id", tutorId).maybeSingle<SettingsRow>();
  if (error) throw new Error(error.message);
  return data ?? defaultSettingsRow(tutorId);
}

/** Record how reading the tutor's calendar went (shown in their settings). Never throws. */
export async function recordCalendarRead(
  admin: SupabaseClient,
  row: SettingsRow,
  result: { error: string } | { busy: Interval[] },
  now: number,
): Promise<SettingsRow> {
  let patch: Partial<SettingsRow> | null = null;
  if ("error" in result) {
    if (row.busy_ical_error !== result.error) patch = { busy_ical_error: result.error };
  } else {
    const last = row.busy_ical_checked_at ? Date.parse(row.busy_ical_checked_at) : 0;
    // Don't write on every page view: only when it was failing, or the last good read is getting old.
    if (row.busy_ical_error || !(now - last < 10 * MIN)) {
      patch = { busy_ical_checked_at: new Date(now).toISOString(), busy_ical_error: null };
    }
  }
  if (!patch) return row;
  const { error } = await admin.from("tutor_booking_settings").update(patch).eq("tutor_id", row.tutor_id);
  if (error) logger.warn({ err: error, tutorId: row.tutor_id }, "consultations: couldn't record the calendar read");
  return { ...row, ...patch };
}

/** The tutor's sessions that still take up time (lessons and consultations), as intervals. */
async function existingSessions(admin: SupabaseClient, tutorId: string, from: number, to: number): Promise<Interval[]> {
  const { data, error } = await admin
    .from("tutoring_sessions")
    .select("scheduled_at, duration_minutes")
    .eq("tutor_id", tutorId)
    .in("status", ["scheduled", "active"])
    // A session that started up to a day before `from` may still be running.
    .gte("scheduled_at", new Date(from - DAY).toISOString())
    .lt("scheduled_at", new Date(to).toISOString());
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ scheduled_at: string; duration_minutes: number | null }>)
    .map((s) => {
      const start = Date.parse(s.scheduled_at);
      return { start, end: start + (s.duration_minutes ?? 60) * MIN };
    })
    .filter((i) => Number.isFinite(i.start) && i.end > from);
}

/** Read the tutor's calendar (if they gave one) for the booking window and record how it went. */
export async function readCalendar(
  admin: SupabaseClient,
  row: SettingsRow,
  now: number,
): Promise<{ busy: Interval[]; row: SettingsRow }> {
  if (!row.busy_ical_url) return { busy: [], row };
  const s = settingsFromRow(row);
  const result = await fetchBusy(row.busy_ical_url, now, now + (s.maxDaysAhead + 1) * DAY, s.timeZone);
  const updated = await recordCalendarRead(admin, row, result, now);
  return { busy: "busy" in result ? result.busy : [], row: updated };
}

/**
 * Open times for a tutor: weekly hours, minus their sessions (with the gap)
 * and their calendar's busy times, within the notice window. A calendar that
 * can't be read is recorded and skipped, never an error.
 */
export async function openTimes(admin: SupabaseClient, row: SettingsRow, now = Date.now()): Promise<string[]> {
  const settings = settingsFromRow(row);
  if (!hasHours(settings.weeklyHours)) return [];
  const to = now + (settings.maxDaysAhead + 1) * DAY;
  const [{ busy }, existing] = await Promise.all([readCalendar(admin, row, now), existingSessions(admin, row.tutor_id, now, to)]);
  return openSlots({ settings, now, busy, existing });
}

/** The columns a consultation's emails and invites need. */
export const CALL_COLUMNS =
  "id, tutor_id, session_type, status, scheduled_at, duration_minutes, diagnostic_id, guest_email, guest_name, guest_parent_email, guest_time_zone, guest_token, reminder_minutes, ics_sequence, guest_is_parent";

export type CallRow = {
  id: string;
  tutor_id: string;
  session_type: string;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  diagnostic_id: string | null;
  guest_email: string | null;
  guest_name: string | null;
  guest_parent_email: string | null;
  guest_time_zone: string | null;
  guest_token: string | null;
  reminder_minutes: number[] | null;
  ics_sequence: number;
  /** guest_email is a parent's (a call booked for a parent only): they get the parent wording. */
  guest_is_parent?: boolean | null;
};

/**
 * The tutor's live (scheduled) consultation for this diagnostic, or for any of
 * these emails. `trusted` is false when it was found only by an email the
 * caller typed in: they get told one exists, not its details.
 */
export async function liveBooking(
  admin: SupabaseClient,
  tutorId: string,
  /** null: no diagnostic yet (a new consultation), so by email only. */
  diagnosticId: string | null,
  emails: { trusted: string[]; typed?: string | null },
): Promise<{ call: CallRow; trusted: boolean } | null> {
  const base = () =>
    admin.from("tutoring_sessions").select(CALL_COLUMNS)
      .eq("tutor_id", tutorId).eq("session_type", "consultation").eq("status", "scheduled").limit(1);
  if (diagnosticId) {
    const byDiagnostic = await base().eq("diagnostic_id", diagnosticId);
    if (byDiagnostic.error) throw new Error(byDiagnostic.error.message);
    if (byDiagnostic.data?.[0]) return { call: byDiagnostic.data[0] as CallRow, trusted: true };
  }
  const trusted = [...new Set(emails.trusted.map((e) => e.toLowerCase()))];
  const typed = emails.typed?.toLowerCase();
  for (const [email, isTrusted] of [...trusted.map((e) => [e, true] as const), ...(typed && !trusted.includes(typed) ? [[typed, false] as const] : [])]) {
    const r = await base().eq("guest_email", email);
    if (r.error) throw new Error(r.error.message);
    if (r.data?.[0]) return { call: r.data[0] as CallRow, trusted: isTrusted };
  }
  return null;
}

/** The guest's join link (the guest token is only ever sent inside this, by email or to the person who booked). */
export const guestJoinUrl = (guestToken: string) => `${appUrl()}/call/${encodeURIComponent(guestToken)}`;

/** The tutor's own way in: the session in their Lessons tab, signed in. */
export const tutorJoinUrl = (sessionId: string) => `${appUrl()}/session/${encodeURIComponent(sessionId)}`;

/** The address in EMAIL_FROM ("Name <a@b>" or "a@b"). */
function fromAddress(): string {
  const m = EMAIL_FROM.match(/<([^>]+)>/);
  return (m ? m[1] : EMAIL_FROM).trim();
}

export type TutorContact = {
  /** Display name as prospects see it (prospectSenderName). */
  name: string;
  /** Sign-in email: Reply-To on every guest and parent email. */
  signInEmail: string | null;
  /** Where the tutor's own copy and invite go. */
  inviteEmail: string | null;
  timeZone: string;
};

export async function tutorContact(
  admin: SupabaseClient & { auth: { admin: { getUserById(id: string): Promise<{ data: { user: { email?: string } | null } }> } } },
  tutorId: string,
  row: SettingsRow,
  signInEmail?: string | null,
): Promise<TutorContact> {
  const [{ data: profile }, email] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", tutorId).maybeSingle<{ display_name: string | null }>(),
    signInEmail !== undefined
      ? Promise.resolve(signInEmail)
      : admin.auth.admin.getUserById(tutorId).then((r) => r.data?.user?.email ?? null, () => null),
  ]);
  return {
    name: prospectSenderName(profile?.display_name),
    signInEmail: email || null,
    inviteEmail: row.invite_email || email || null,
    timeZone: settingsFromRow(row).timeZone,
  };
}

export async function questionnaireUrl(admin: SupabaseClient, diagnosticId: string | null): Promise<string | null> {
  if (!diagnosticId) return null;
  const { data } = await admin
    .from("diagnostic_assessments").select("token, questionnaire, pre_call_form_url").eq("id", diagnosticId)
    .maybeSingle<{ token: string; questionnaire: unknown | null; pre_call_form_url: string | null }>();
  return data ? questionnaireLinkFor(data) : null;
}

export type ConsultationLinks = {
  /** The guest's join link. */
  call: string | null;
  questionnaire: { url: string; done: boolean } | null;
  test: { url: string; done: boolean } | null;
};

/**
 * The links a prospect was sent for a call, for the tutor to copy and pass on
 * by hand when the email went astray. Only for the call's own tutor: the
 * caller checks that before this runs.
 */
export async function consultationLinks(
  admin: SupabaseClient,
  call: Pick<CallRow, "guest_token" | "diagnostic_id">,
): Promise<ConsultationLinks> {
  const out: ConsultationLinks = { call: call.guest_token ? guestJoinUrl(call.guest_token) : null, questionnaire: null, test: null };
  if (!call.diagnostic_id) return out;
  const { data, error } = await admin
    .from("diagnostic_assessments")
    .select("token, questionnaire, pre_call_form_url, has_test, status, cancelled_at, questionnaire_submitted_at")
    .eq("id", call.diagnostic_id)
    .limit(1);
  if (error) throw new Error(error.message);
  const d = (data as Array<{
    token: string; questionnaire: unknown | null; pre_call_form_url: string | null; has_test: boolean | null;
    status: string; cancelled_at: string | null; questionnaire_submitted_at: string | null;
  }> | null)?.[0];
  if (!d) return out;
  const q = questionnaireLinkFor(d);
  if (q) out.questionnaire = { url: q, done: !!d.questionnaire_submitted_at };
  if (d.has_test !== false && !d.cancelled_at) out.test = { url: prospectLink(d.token), done: d.status === "completed" };
  return out;
}

/** Which of a call's emails went (true), failed (false) or had no one to go to (left out). */
export type ConsultationSends = Partial<Record<"guest" | "parent" | "tutor", boolean>>;

/**
 * Email the guest, their parent (if any) and the tutor about a booking, a
 * move or a cancellation, each with a calendar invite (same UID; the
 * session's current ics_sequence). Failures are logged; the booking stands.
 * A guest who is a parent (guest_is_parent) gets the parent wording.
 */
export async function sendConsultationEmails(o: {
  kind: "booked" | "changed" | "cancelled";
  call: CallRow;
  tutor: TutorContact;
  previousStart?: string;
  questionnaireUrl?: string | null;
  /**
   * A new consultation (booked by the tutor with what to send ticked): the
   * guest and parent get the one combined email instead of the booking
   * confirmation, with the diagnostic link when a test was included.
   */
  invite?: { testUrl: string | null; timed?: boolean };
  /** Default: the configured Resend client. */
  resend?: Resend | null;
}): Promise<ConsultationSends> {
  const resend = o.resend === undefined ? getResend() : o.resend;
  if (!resend) {
    logger.warn({ sessionId: o.call.id }, "consultations: email isn't set up; no invites sent");
    return {};
  }
  const { call, tutor } = o;
  if (!call.guest_token || !call.guest_email) {
    logger.error({ sessionId: call.id }, "consultations: booking has no guest email or token");
    return {};
  }
  const studentName = call.guest_name?.trim() || "";
  const guestZone = call.guest_time_zone || tutor.timeZone;
  const method = o.kind === "cancelled" ? "CANCEL" : "REQUEST";
  const guests = [
    { name: studentName || undefined, email: call.guest_email },
    ...(call.guest_parent_email ? [{ email: call.guest_parent_email }] : []),
  ];
  // The tutor is an attendee on their own copy (so Gmail adds it to that calendar);
  // the prospect's and parent's copies don't carry the tutor's invite address.
  const invite = (summary: string, url: string, attendees: Array<{ name?: string; email: string }>) => ({
    filename: "invite.ics",
    contentType: `text/calendar; method=${method}`,
    content: consultationIcs({
      uid: `consultation-${call.id}@gradefarm.com.au`,
      sequence: call.ics_sequence,
      method,
      start: Date.parse(call.scheduled_at),
      minutes: call.duration_minutes,
      summary,
      description: `Join the call: ${url}`,
      url,
      organizerName: tutor.name,
      organizerEmail: fromAddress(),
      attendees,
    }),
  });

  const guestUrl = guestJoinUrl(call.guest_token);
  const tutorUrl = tutorJoinUrl(call.id);
  const reportUrl = `${appUrl()}/tutor?tab=diagnostic`;
  const forWho = (who: "guest" | "parent" | "tutor") => {
    const to = who === "guest" && call.guest_is_parent ? "parent" : who;
    const tz = to === "tutor" ? tutor.timeZone : guestZone;
    const joinUrl = to === "tutor" ? tutorUrl : guestUrl;
    if (o.invite && o.kind === "booked" && to !== "tutor") {
      return consultationInviteEmail({
        audience: to === "parent" ? "parent" : "student",
        tutorName: tutor.name, studentName, start: call.scheduled_at, timeZone: tz, minutes: call.duration_minutes,
        joinUrl, questionnaireUrl: o.questionnaireUrl ?? null, testUrl: o.invite.testUrl,
        ...(o.invite.timed ? { timed: true } : {}),
      });
    }
    const common = { to, tutorName: tutor.name, studentName, start: call.scheduled_at, timeZone: tz };
    if (o.kind === "cancelled") return consultationCancelledEmail(common);
    const booked = {
      ...common,
      minutes: call.duration_minutes,
      joinUrl,
      questionnaireUrl: o.questionnaireUrl ?? null,
      reportUrl: to === "tutor" ? reportUrl : undefined,
    };
    return o.kind === "changed"
      ? consultationChangedEmail({ ...booked, previousStart: o.previousStart ?? call.scheduled_at })
      : consultationBookedEmail(booked);
  };

  const guestSummary = `Consultation call with ${tutor.name}`;
  const tutorSummary = `Consultation call: ${studentName || call.guest_email}`;
  const sends: Array<{ who: "guest" | "parent" | "tutor"; to: string | null }> = [
    { who: "guest", to: call.guest_email },
    { who: "parent", to: call.guest_parent_email },
    { who: "tutor", to: tutor.inviteEmail },
  ];
  const result: ConsultationSends = {};
  for (const { who, to } of sends) {
    if (!to) continue;
    const { subject, content } = forWho(who);
    const toTutor = who === "tutor";
    const sent = await sendEmail(resend, {
      to,
      subject,
      content,
      idempotencyKey: `consultation-${o.invite ? "invite" : o.kind}:${call.id}:${call.ics_sequence}:${who}`,
      // Replies from the prospect or parent reach the tutor.
      ...(!toTutor && tutor.signInEmail ? { replyTo: tutor.signInEmail } : {}),
      attachments: [
        toTutor ? invite(tutorSummary, tutorUrl, [{ name: tutor.name, email: to }, ...guests]) : invite(guestSummary, guestUrl, guests),
      ],
    }).catch((err: unknown) => ({ id: null, error: err instanceof Error ? err.message : String(err) }));
    if (sent.error) logger.warn({ sessionId: call.id, who, kind: o.kind, err: sent.error }, "consultations: email not sent");
    result[who] = !sent.error;
  }
  return result;
}

/**
 * Email everyone once a booking, move or cancellation has been written. The
 * write stands whatever happens here: each step's failure is logged and
 * swallowed, so the route still answers with success. Returns whether the
 * emails were handed to `send`.
 */
export async function notifyAfterWrite(o: {
  kind: "booked" | "changed" | "cancelled";
  sessionId: string;
  previousStart?: string;
  loadCall: () => Promise<CallRow | null>;
  loadTutor: () => Promise<TutorContact>;
  loadQuestionnaire: (diagnosticId: string | null) => Promise<string | null>;
  send?: (x: Parameters<typeof sendConsultationEmails>[0]) => Promise<unknown>;
  log?: (err: unknown, msg: string) => void;
}): Promise<boolean> {
  const log = o.log ?? ((err: unknown, msg: string) => logger.error({ err, sessionId: o.sessionId, kind: o.kind }, msg));
  let call: CallRow | null;
  let tutor: TutorContact;
  try {
    call = await o.loadCall();
    if (!call) throw new Error("call not found after writing it");
    tutor = await o.loadTutor();
  } catch (err) {
    log(err, "consultations: written, but couldn't load what the emails need; none sent");
    return false;
  }
  let questionnaire: string | null = null;
  if (o.kind !== "cancelled") {
    try {
      questionnaire = await o.loadQuestionnaire(call.diagnostic_id);
    } catch (err) {
      log(err, "consultations: couldn't read the questionnaire link; sending without it");
    }
  }
  try {
    await (o.send ?? sendConsultationEmails)({ kind: o.kind, call, tutor, previousStart: o.previousStart, questionnaireUrl: questionnaire });
  } catch (err) {
    log(err, "consultations: written, but the emails failed");
    return false;
  }
  return true;
}
