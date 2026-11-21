/**
 * Automated emails, sent by the /api/cron/emails job:
 *   • welcome               – once, after a new account confirms its email
 *   • session_reminder_24h  – students, about a day before a booked session
 *   • session_reminder_1h   – students and the tutor, about an hour before
 *   • assignment_due        – the day before an unfinished assignment is due
 *   • assignment_overdue    – the day after, if it is still unfinished
 *   • assignment_set        – a recurring assignment was set for the student
 *                             today (lib/recurring-assignments.ts)
 *   • invite_reminder       – once, if a tutor's invite isn't accepted after a
 *                             few days (recorded on the invite: the invitee may
 *                             have no account, so no email_log row)
 *   • diagnostic_reminder   – once, if a student hasn't done the diagnostic on a
 *                             tutor-included subject after a couple of days
 *   • prospect_reminder     – once, if a prospective student emailed a link
 *                             diagnostic hasn't started it 2 days later
 *                             (recorded on the diagnostic: no account, so no
 *                             email_log row; lib/prospect-status.ts)
 *   • consultation_reminder – a consultation call's guest, their parent and the
 *                             tutor, at the tutor's reminder times (claimed in
 *                             consultation_reminders_sent: guests have no account)
 *   • book_your_call        – once, a day after a prospect finishes a link
 *                             diagnostic, if they haven't booked a call and the
 *                             tutor takes bookings (booking_reminded_at)
 *   • diagnostic_done       – the student's tutors (the one who set it and any
 *                             others on their roster), when they finish one
 *   • parent_report         – Sunday evening, a student's week to the parent
 *                             their tutor added (recorded on the roster row:
 *                             parents have no account; lib/parent-reports.ts),
 *                             or to the confirmed parent on the student's own
 *                             account (recorded on the profile)
 *
 * The job is safe to run at any cadence: each email is claimed in email_log
 * (claim_email RPC) before it is sent, so it goes out at most once. Reminders
 * respect profiles.emails_unsubscribed_at. An address that bounced or reported
 * us as spam isn't sent to (lib/email-blocks.ts): those count as `blocked`
 * and aren't retried.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resend } from "resend";
import { logger } from "./logger";
import { accountParentUnsubscribeUrl, appUrl, parentUnsubscribeUrl, sendEmail, unsubscribeUrl, type EmailContent, type PrebuiltEmail } from "./email";
import { isFamilyLogin } from "./family";
import { needsParentConsent } from "./parent-consent";
import { freeAllowance, studentWelcomeEmail, tutorWelcomeEmail } from "./welcome-email";
import { subjectLabel } from "./included-subject";
import { studentSummary } from "./student-diagnostic";
import { rosterTutorIds } from "./student-tutors";
import { doneRecipients, dueForProspectReminder, PROSPECT_TTL_MS, type ProspectRow } from "./prospect-status";
import { prospectFinishedEmail, prospectLink, prospectReminderEmail, prospectSenderName } from "./prospect-emails";
import { dueBookYourCall, dueConsultationReminders, BOOK_YOUR_CALL_AFTER_MS, BOOK_YOUR_CALL_UNTIL_MS } from "./consultation-reminders";
import { bookYourCallEmail, consultationReminderEmail } from "./consultation-emails";
import { hasHours, type SettingsRow } from "./consultation-access";
import { guestJoinUrl, tutorJoinUrl } from "./consultation-service";
import { loadParentReport, parentReportEmail } from "./parent-reports";
import { planIsLive, tutorBillingRow, tutorPlanOptions, type TutorBillingRow } from "./tutor-plan";

export const TIME_ZONE = "Australia/Adelaide";

export type EmailKind =
  | "welcome"
  | "session_reminder_24h"
  | "session_reminder_1h"
  | "assignment_due"
  | "assignment_overdue"
  | "assignment_set"
  | "invite_reminder"
  | "diagnostic_reminder"
  | "diagnostic_done"
  | "prospect_reminder"
  | "consultation_reminder"
  | "book_your_call"
  | "parent_report";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Only welcome accounts created this recently, so launch doesn't email everyone. */
const WELCOME_WINDOW = 48 * HOUR;
/** A session within this lead time gets the 1-hour reminder. */
const SOON_WINDOW = 75 * MINUTE;
/** The day-before reminder is only sent while the session is at least this far off. */
const DAY_REMINDER_MIN_LEAD = 2 * HOUR;
/**
 * Skip a reminder when the booking itself was recent: the booking email
 * already told them. 24h reminder: booked ≥ 36h ahead. 1h: booked ≥ 2h ahead.
 */
const DAY_REMINDER_MIN_BOOKING_LEAD = 36 * HOUR;
const SOON_REMINDER_MIN_BOOKING_LEAD = 2 * HOUR;
/** Assignment, invite and diagnostic reminders only go out during the day, Adelaide time. */
const ASSIGNMENT_SEND_HOURS = { from: 8, to: 20 };
const DAY = 24 * HOUR;
/** Remind an invitee this long after the invite was (last) sent… */
const INVITE_REMINDER_AFTER = 3 * DAY;
/** …while the invite still works (invites expire 30 days after sending). */
const INVITE_TTL = 30 * DAY;
/** Remind a student about an undone diagnostic this long after it was set, once. */
const DIAGNOSTIC_REMINDER_AFTER = 2 * DAY;
/** Don't remind about diagnostics set longer ago than this (or tell tutors about old results). */
const DIAGNOSTIC_LOOKBACK = 30 * DAY;
const DIAGNOSTIC_DONE_LOOKBACK = 2 * DAY;
/** Parent reports go out on Sunday between these hours, Adelaide time. */
const PARENT_REPORT_HOURS = { from: 17, to: 20 };

const daytime = (job: Job) => {
  const hour = localHour(job.now);
  return hour >= ASSIGNMENT_SEND_HOURS.from && hour < ASSIGNMENT_SEND_HOURS.to;
};

export interface RunOptions {
  now?: Date;
  /** Report what would be sent without sending or recording anything. */
  dryRun?: boolean;
  /** Stop after this many emails; the rest go out on the next run. */
  maxEmails?: number;
}

export interface RunSummary {
  dryRun: boolean;
  sent: Partial<Record<EmailKind, number>>;
  failed: Partial<Record<EmailKind, number>>;
  /** Not sent: the address bounced or reported us as spam. */
  blocked: Partial<Record<EmailKind, number>>;
  /** Dry run only: the emails a real run would send now. */
  planned?: Array<{ kind: EmailKind; to: string; subject: string }>;
  budgetExhausted: boolean;
}

interface Recipient {
  id: string;
  email: string;
  name: string;
  unsubscribed: boolean;
}

interface Job {
  admin: SupabaseClient;
  resend: Resend | null;
  now: Date;
  dryRun: boolean;
  budget: number;
  summary: RunSummary;
  emailCache: Map<string, { email: string | null; confirmed: boolean }>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function bump(map: Partial<Record<EmailKind, number>>, kind: EmailKind) {
  map[kind] = (map[kind] ?? 0) + 1;
}

/** YYYY-MM-DD for `date` in Adelaide. */
export function localDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function localHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(date));
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "long", day: "numeric", month: "long",
    hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE, timeZoneName: "short",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE, timeZoneName: "short",
  });
}

function formatDueDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
}

async function authEmail(job: Job, userId: string): Promise<{ email: string | null; confirmed: boolean }> {
  const cached = job.emailCache.get(userId);
  if (cached) return cached;
  const { data } = await job.admin.auth.admin.getUserById(userId);
  const entry = {
    email: data?.user?.email ?? null,
    confirmed: !!(data?.user?.email_confirmed_at ?? data?.user?.confirmed_at),
  };
  job.emailCache.set(userId, entry);
  return entry;
}

/** Profiles + emails for active users; deactivated or email-less users are dropped. */
async function loadRecipients(job: Job, ids: string[]): Promise<Map<string, Recipient>> {
  const out = new Map<string, Recipient>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  const { data, error } = await job.admin
    .from("profiles")
    .select("id, display_name, deactivated_at, emails_unsubscribed_at")
    .in("id", unique);
  if (error) throw new Error(`profiles: ${error.message}`);
  for (const p of (data ?? []) as Array<{ id: string; display_name: string | null; deactivated_at: string | null; emails_unsubscribed_at: string | null }>) {
    if (p.deactivated_at) continue;
    const { email } = await authEmail(job, p.id);
    if (!email) continue;
    out.set(p.id, { id: p.id, email, name: p.display_name || "there", unsubscribed: !!p.emails_unsubscribed_at });
  }
  return out;
}

/**
 * `${refId}:${recipientId}` pairs claim_email would refuse: sent, out of
 * retries, or being sent by another run right now. Saves a claim per email.
 */
async function loadDone(job: Job, kind: EmailKind, refIds: string[]): Promise<Set<string>> {
  const done = new Set<string>();
  if (refIds.length === 0) return done;
  const { data, error } = await job.admin
    .from("email_log")
    .select("ref_id, recipient_id, status, attempts, updated_at")
    .eq("kind", kind)
    .in("ref_id", [...new Set(refIds)]);
  if (error) throw new Error(`email_log: ${error.message}`);
  const staleBefore = job.now.getTime() - 10 * MINUTE;
  for (const r of (data ?? []) as Array<{ ref_id: string; recipient_id: string; status: string; attempts: number; updated_at: string }>) {
    const inFlight = r.status === "pending" && new Date(r.updated_at).getTime() >= staleBefore;
    // Only a failed send is tried again; sent, blocked, bounced or reported ones are done.
    const retryable = r.status === "failed" || r.status === "pending";
    if (!retryable || r.attempts >= 3 || inFlight) done.add(`${r.ref_id}:${r.recipient_id}`);
  }
  return done;
}

/**
 * Claim, send and record one email covering `refIds` (several assignments can
 * share one email). `build` receives the refs actually claimed, so a ref
 * another run already sent is left out.
 */
async function deliver(
  job: Job,
  kind: EmailKind,
  recipient: Recipient,
  refIds: string[],
  build: (claimed: string[]) => { subject: string; content: EmailContent | PrebuiltEmail },
): Promise<void> {
  if (job.budget <= 0) {
    job.summary.budgetExhausted = true;
    return;
  }

  if (job.dryRun) {
    const { subject } = build(refIds);
    job.summary.planned!.push({ kind, to: recipient.email, subject });
    job.budget--;
    return;
  }

  const claimed: string[] = [];
  for (const refId of refIds) {
    const { data, error } = await job.admin.rpc("claim_email", {
      p_kind: kind, p_ref_id: refId, p_recipient_id: recipient.id,
    });
    if (error) throw new Error(`claim_email: ${error.message}`);
    if (data === true) claimed.push(refId);
  }
  if (claimed.length === 0) return;

  const { subject, content } = build(claimed);
  job.budget--;
  const result = await sendEmail(job.resend!, {
    to: recipient.email,
    subject,
    content,
    idempotencyKey: `${kind}:${recipient.id}:${claimed.slice().sort().join(",")}`,
  });

  const { error: logErr } = await job.admin
    .from("email_log")
    .update(
      result.error
        // 'blocked' isn't retried: claim_email only takes back 'failed' rows.
        ? { status: result.blocked ? "blocked" : "failed", error: result.error.slice(0, 500), updated_at: new Date().toISOString() }
        : { status: "sent", provider_id: result.id, updated_at: new Date().toISOString() },
    )
    .eq("kind", kind)
    .eq("recipient_id", recipient.id)
    .in("ref_id", claimed);
  if (logErr) logger.error({ err: logErr, kind }, "emails: could not record send result");

  if (result.blocked) {
    bump(job.summary.blocked, kind);
  } else if (result.error) {
    bump(job.summary.failed, kind);
    logger.warn({ kind, recipient: recipient.id, error: result.error }, "emails: send failed");
  } else {
    bump(job.summary.sent, kind);
  }
}

/** First word of a display name, for greetings ("Hi Mia,"). */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// ── Welcome ─────────────────────────────────────────────────────────────────

type WelcomeRow = {
  id: string;
  is_tutor: boolean;
  tutor_application_status: string | null;
  account_holder: string | null;
  parent_name: string | null;
  parent_consent_at: string | null;
  dob: string | null;
  year_level: number | null;
};

async function readPricingSetting(job: Job): Promise<Record<string, unknown>> {
  const { data, error } = await job.admin.from("platform_settings").select("value").eq("key", "pricing").maybeSingle();
  // The defaults match the pricing page's, so a failed read still sends a correct email.
  if (error) logger.warn({ err: error }, "emails: could not read pricing, using the defaults");
  return ((data as { value?: Record<string, unknown> } | null)?.value) ?? {};
}

/** The student's active subjects, and whether any is paid, included by a tutor or beta. */
async function welcomeSubjects(job: Job, userId: string): Promise<{ subjects: string[]; hasPlan: boolean }> {
  const { data, error } = await job.admin
    .from("user_subscriptions")
    .select("subject_name, source, beta")
    .eq("user_id", userId)
    .eq("active", true);
  if (error) throw new Error(`user_subscriptions: ${error.message}`);
  const rows = (data ?? []) as Array<{ subject_name: string | null; source: string | null; beta: boolean | null }>;
  return {
    subjects: rows.map((s) => s.subject_name ?? "").filter(Boolean),
    hasPlan: rows.some((s) => s.beta === true || (s.source ?? "free") !== "free"),
  };
}

async function runWelcome(job: Job) {
  const since = new Date(job.now.getTime() - WELCOME_WINDOW).toISOString();
  const { data, error } = await job.admin
    .from("profiles")
    .select("id, is_tutor, tutor_application_status, account_holder, parent_name, parent_consent_at, dob, year_level")
    .gte("created_at", since)
    .is("deactivated_at", null)
    .limit(500);
  if (error) throw new Error(`profiles: ${error.message}`);
  const rows = (data ?? []) as WelcomeRow[];
  if (rows.length === 0) return;

  const done = await loadDone(job, "welcome", rows.map((r) => r.id));
  const pending = rows.filter((r) => !done.has(`${r.id}:${r.id}`));
  const recipients = await loadRecipients(job, pending.map((r) => r.id));

  let pricing: Record<string, unknown> | null = null;
  for (const row of pending) {
    const r = recipients.get(row.id);
    if (!r || r.unsubscribed) continue;
    // Wait until the address is confirmed so we don't mail typos.
    if (!(await authEmail(job, row.id)).confirmed) continue;
    pricing ??= await readPricingSetting(job);
    const unsubscribe = unsubscribeUrl(row.id);

    const status = row.tutor_application_status ?? "none";
    const approved = row.is_tutor || status === "approved";
    if (approved || status === "pending") {
      const billing = approved ? await tutorBillingRow(job.admin, row.id).catch(() => null) : null;
      const { plans, annualDiscount } = tutorPlanOptions(pricing);
      await deliver(job, "welcome", r, [row.id], () => tutorWelcomeEmail({
        name: r.name, approved, portalOpen: approved && planIsLive(billing), plans, annualDiscount, unsubscribeUrl: unsubscribe,
      }));
      continue;
    }

    // A parent reads it when they hold the account, or for a child added to
    // their family (that mail goes to the parent).
    const reader = row.account_holder === "parent" || isFamilyLogin(r.email) ? "parent" : "student";
    const { subjects, hasPlan } = await welcomeSubjects(job, row.id);
    await deliver(job, "welcome", r, [row.id], () => studentWelcomeEmail({
      name: r.name,
      reader,
      parentName: row.parent_name,
      subjects,
      yearLevel: row.year_level,
      hasPlan,
      awaitingParent: reader === "student" && !row.parent_consent_at && needsParentConsent(row.dob, row.year_level, job.now),
      free: freeAllowance(pricing),
      unsubscribeUrl: unsubscribe,
    }));
  }
}

// ── Session reminders ───────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  tutor_id: string;
  scheduled_at: string;
  duration_minutes: number;
  title: string | null;
  session_type: string;
  series_id: string | null;
  livekit_room_name: string;
  created_at: string | null;
}

async function runSessionReminders(job: Job) {
  const nowMs = job.now.getTime();
  const { data, error } = await job.admin
    .from("tutoring_sessions")
    .select("id, tutor_id, scheduled_at, duration_minutes, title, session_type, series_id, livekit_room_name, created_at")
    .eq("status", "scheduled")
    .neq("session_type", "consultation") // consultations have their own reminders (runConsultationReminders)
    .gt("scheduled_at", job.now.toISOString())
    .lte("scheduled_at", new Date(nowMs + 24 * HOUR).toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`tutoring_sessions: ${error.message}`);
  const sessions = (data ?? []) as SessionRow[];
  if (sessions.length === 0) return;

  const day: SessionRow[] = [];
  const soon: SessionRow[] = [];
  for (const s of sessions) {
    const start = new Date(s.scheduled_at).getTime();
    const bookedAhead = s.created_at ? start - new Date(s.created_at).getTime() : Infinity;
    const lead = start - nowMs;
    if (lead <= SOON_WINDOW) {
      if (bookedAhead >= SOON_REMINDER_MIN_BOOKING_LEAD) soon.push(s);
    } else if (lead >= DAY_REMINDER_MIN_LEAD) {
      if (bookedAhead >= DAY_REMINDER_MIN_BOOKING_LEAD) day.push(s);
    }
  }
  const relevant = [...day, ...soon];
  if (relevant.length === 0) return;

  const { data: parts, error: partErr } = await job.admin
    .from("session_participants")
    .select("session_id, student_id")
    .in("session_id", relevant.map((s) => s.id));
  if (partErr) throw new Error(`session_participants: ${partErr.message}`);
  const studentsBySession = new Map<string, string[]>();
  for (const p of (parts ?? []) as Array<{ session_id: string; student_id: string }>) {
    const list = studentsBySession.get(p.session_id) ?? [];
    list.push(p.student_id);
    studentsBySession.set(p.session_id, list);
  }

  const people = await loadRecipients(job, [
    ...relevant.map((s) => s.tutor_id),
    ...[...studentsBySession.values()].flat(),
  ]);

  const send = async (kind: EmailKind, list: SessionRow[], includeTutor: boolean) => {
    if (list.length === 0) return;
    const done = await loadDone(job, kind, list.map((s) => s.id));
    for (const s of list) {
      const studentIds = studentsBySession.get(s.id) ?? [];
      const tutor = people.get(s.tutor_id);
      const tutorName = tutor?.name ?? "your tutor";
      for (const sid of studentIds) {
        const r = people.get(sid);
        if (!r || r.unsubscribed || done.has(`${s.id}:${sid}`)) continue;
        await deliver(job, kind, r, [s.id], () => sessionReminderEmail(job, kind, s, r, { tutorName }));
      }
      if (includeTutor && tutor && !tutor.unsubscribed && studentIds.length > 0 && !done.has(`${s.id}:${tutor.id}`)) {
        const names = studentIds.map((id) => people.get(id)?.name).filter((n): n is string => !!n);
        await deliver(job, kind, tutor, [s.id], () => sessionReminderEmail(job, kind, s, tutor, { studentNames: names, studentCount: studentIds.length }));
      }
    }
  };

  await send("session_reminder_24h", day, false);
  await send("session_reminder_1h", soon, true);
}

function sessionReminderEmail(
  job: Job,
  kind: EmailKind,
  s: SessionRow,
  r: Recipient,
  who: { tutorName?: string; studentNames?: string[]; studentCount?: number },
): { subject: string; content: EmailContent } {
  const link = s.series_id ? `${appUrl()}/room/${encodeURIComponent(s.livekit_room_name)}` : `${appUrl()}/session/${s.id}`;
  const label = s.title?.trim() || (s.session_type === "group" ? "Group tutoring session" : "Tutoring session");
  const minutes = Math.max(1, Math.round((new Date(s.scheduled_at).getTime() - job.now.getTime()) / MINUTE));
  const isTutorCopy = who.studentNames !== undefined;
  const withWhom = isTutorCopy
    ? who.studentNames!.length === 1 && who.studentCount === 1
      ? who.studentNames![0]
      : `${who.studentCount} students`
    : who.tutorName!;

  const soon = kind === "session_reminder_1h";
  return {
    subject: soon
      ? `Starting at ${formatTime(s.scheduled_at)}: ${label}`
      : `Reminder: ${label} on ${formatWhen(s.scheduled_at)}`,
    content: {
      heading: soon ? `Your session starts in ${minutes} minutes` : "Your session is coming up",
      paragraphs: [
        `Hi ${firstName(r.name)}, this is a reminder about your ${s.session_type === "group" ? "group " : ""}session with ${withWhom}.`,
      ],
      details: [
        ["When", formatWhen(s.scheduled_at)],
        ["Duration", `${s.duration_minutes} minutes`],
        ...(s.title?.trim() ? ([["Topic", s.title.trim()]] as Array<[string, string]>) : []),
      ],
      cta: { label: "Join session", url: link },
      footer: "Sessions open in your browser, so there's nothing to install. You're receiving this because you have a session booked on gradefarm.",
      unsubscribe: unsubscribeUrl(r.id),
    },
  };
}

// ── Assignment reminders ────────────────────────────────────────────────────

interface AssignmentRow {
  id: string;
  tutor_id: string;
  student_id: string;
  type: string;
  subject: string;
  topics: string[] | null;
  due_date: string;
  created_at: string;
}

async function runAssignmentReminders(job: Job) {
  const hour = localHour(job.now);
  if (hour < ASSIGNMENT_SEND_HOURS.from || hour >= ASSIGNMENT_SEND_HOURS.to) return;

  const today = localDate(job.now);
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  const { data, error } = await job.admin
    .from("assignments")
    .select("id, tutor_id, student_id, type, subject, topics, due_date, created_at")
    .is("completed_at", null)
    .in("due_date", [tomorrow, yesterday])
    .limit(2000);
  if (error) throw new Error(`assignments: ${error.message}`);
  const rows = (data ?? []) as AssignmentRow[];
  if (rows.length === 0) return;

  const recentCutoff = job.now.getTime() - 12 * HOUR;
  const due = rows.filter((a) => a.due_date === tomorrow && new Date(a.created_at).getTime() <= recentCutoff);
  const overdue = rows.filter((a) => a.due_date === yesterday);

  const people = await loadRecipients(job, [...rows.map((a) => a.student_id), ...rows.map((a) => a.tutor_id)]);

  const send = async (kind: EmailKind, list: AssignmentRow[]) => {
    if (list.length === 0) return;
    const done = await loadDone(job, kind, list.map((a) => a.id));
    const byStudent = new Map<string, AssignmentRow[]>();
    for (const a of list) {
      if (done.has(`${a.id}:${a.student_id}`)) continue;
      const l = byStudent.get(a.student_id) ?? [];
      l.push(a);
      byStudent.set(a.student_id, l);
    }
    for (const [studentId, items] of byStudent) {
      const r = people.get(studentId);
      if (!r || r.unsubscribed) continue;
      await deliver(job, kind, r, items.map((a) => a.id), (claimed) =>
        assignmentEmail(kind, r, items.filter((a) => claimed.includes(a.id)), people),
      );
    }
  };

  await send("assignment_due", due);
  await send("assignment_overdue", overdue);
}

function assignmentEmail(
  kind: EmailKind,
  r: Recipient,
  items: AssignmentRow[],
  people: Map<string, Recipient>,
): { subject: string; content: EmailContent } {
  const overdue = kind === "assignment_overdue";
  const first = items[0];
  const many = items.length > 1;
  const details = items.map((a): [string, string] => {
    const topics = (a.topics ?? []).filter(Boolean).join(", ");
    const tutor = people.get(a.tutor_id)?.name;
    return [a.type, [a.subject, topics, tutor ? `from ${tutor}` : ""].filter(Boolean).join(" · ")];
  });
  const dueText = formatDueDate(first.due_date);
  return {
    subject: overdue
      ? many ? `${items.length} assignments are overdue` : `Overdue: ${first.type} for ${first.subject}`
      : many ? `${items.length} assignments due tomorrow` : `Due tomorrow: ${first.type} for ${first.subject}`,
    content: {
      heading: overdue ? (many ? "These assignments are overdue" : "This assignment is overdue") : `Due tomorrow, ${dueText}`,
      paragraphs: [
        overdue
          ? `Hi ${firstName(r.name)}, ${many ? "these were" : "this was"} due on ${dueText} and ${many ? "aren't" : "isn't"} finished yet. It's not too late to get ${many ? "them" : "it"} done.`
          : `Hi ${firstName(r.name)}, just a heads up that ${many ? "these are" : "this is"} due tomorrow and not finished yet.`,
      ],
      details,
      cta: { label: overdue ? "Finish now" : "Start now", url: `${appUrl()}/home` },
      footer: "You're receiving this because your tutor set you work on gradefarm.",
      unsubscribe: unsubscribeUrl(r.id),
    },
  };
}

// ── Recurring assignments ───────────────────────────────────────────────────

interface IssuedRow extends AssignmentRow {
  question_count: number | null;
}

/**
 * Tell students about recurring work set today (or late yesterday, after the
 * day's sending hours), one email per student, if the schedule says to.
 */
async function runRecurringAssignmentEmails(job: Job) {
  if (!daytime(job)) return;
  const today = localDate(job.now);
  const { data, error } = await job.admin
    .from("assignments")
    .select("id, tutor_id, student_id, type, subject, topics, due_date, created_at, question_count, assignment_schedules!inner(notify)")
    .in("issued_on", [addDays(today, -1), today])
    .eq("assignment_schedules.notify", true)
    .is("completed_at", null)
    .limit(2000);
  if (error) {
    // Before the recurring assignments migration there's nothing to send.
    if (/assignment_schedules|issued_on|schedule_id/.test(error.message)) return;
    throw new Error(`assignments: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as IssuedRow[];
  if (rows.length === 0) return;

  const done = await loadDone(job, "assignment_set", rows.map((a) => a.id));
  const byStudent = new Map<string, IssuedRow[]>();
  for (const a of rows) {
    if (done.has(`${a.id}:${a.student_id}`)) continue;
    const l = byStudent.get(a.student_id) ?? [];
    l.push(a);
    byStudent.set(a.student_id, l);
  }
  if (byStudent.size === 0) return;

  const people = await loadRecipients(job, [...byStudent.keys(), ...rows.map((a) => a.tutor_id)]);
  for (const [studentId, items] of byStudent) {
    const r = people.get(studentId);
    if (!r || r.unsubscribed) continue;
    await deliver(job, "assignment_set", r, items.map((a) => a.id), (claimed) =>
      assignmentSetEmail(r, items.filter((a) => claimed.includes(a.id)), people, today),
    );
  }
}

function assignmentSetEmail(
  r: Recipient,
  items: IssuedRow[],
  people: Map<string, Recipient>,
  today: string,
): { subject: string; content: EmailContent } {
  const first = items[0];
  const many = items.length > 1;
  const details = items.map((a): [string, string] => {
    const topics = (a.topics ?? []).filter(Boolean).join(", ");
    const goal = a.question_count ? `${a.question_count} question${a.question_count === 1 ? "" : "s"}` : "";
    const due = a.due_date === today ? "due today" : `due ${formatDueDate(a.due_date)}`;
    return [a.type, [a.subject, topics, goal, due].filter(Boolean).join(" · ")];
  });
  const tutors = [...new Set(items.map((a) => people.get(a.tutor_id)?.name).filter(Boolean))];
  const from = tutors.length === 1 ? tutors[0] : "your tutor";
  return {
    subject: many ? `${items.length} new assignments to do` : `New ${first.type} for ${first.subject}`,
    content: {
      heading: many ? "You have new work" : `New ${first.type}`,
      paragraphs: [
        `Hi ${firstName(r.name)}, here's your regular work from ${from}.`,
      ],
      details,
      cta: { label: "Start now", url: `${appUrl()}/home` },
      footer: "You're receiving this because your tutor set you recurring work on gradefarm.",
      unsubscribe: unsubscribeUrl(r.id),
    },
  };
}

// ── Invite reminders ────────────────────────────────────────────────────────

interface InviteRow {
  id: string;
  tutor_id: string;
  email: string;
  token: string;
  curriculum_ids: string[] | null;
  sent_at: string;
  recipient: "student" | "parent" | null;
  child_name: string | null;
}

async function runInviteReminders(job: Job) {
  if (!daytime(job)) return;
  const nowMs = job.now.getTime();
  const { data, error } = await job.admin
    .from("tutor_invites")
    .select("id, tutor_id, email, token, curriculum_ids, sent_at, recipient, child_name")
    .eq("status", "pending")
    .is("reminded_at", null)
    .lte("sent_at", new Date(nowMs - INVITE_REMINDER_AFTER).toISOString())
    .gt("sent_at", new Date(nowMs - INVITE_TTL + DAY).toISOString()) // at least a day left on it
    .limit(500);
  if (error) throw new Error(`tutor_invites: ${error.message}`);
  const rows = (data ?? []) as InviteRow[];
  if (rows.length === 0) return;

  const tutors = await loadRecipients(job, rows.map((r) => r.tutor_id));
  for (const inv of rows) {
    const tutor = tutors.get(inv.tutor_id);
    if (!tutor) continue; // tutor deactivated
    if (job.budget <= 0) {
      job.summary.budgetExhausted = true;
      return;
    }
    const labels = (await Promise.all((inv.curriculum_ids ?? []).map((id) => subjectLabel(job.admin, id)))).filter((l): l is string => !!l);
    const { subject, content } = inviteReminderEmail(inv, tutor.name, labels);
    if (job.dryRun) {
      job.summary.planned!.push({ kind: "invite_reminder", to: inv.email, subject });
      job.budget--;
      continue;
    }
    // Claim it: another run may be here too.
    const remindedAt = new Date().toISOString();
    const { data: claimed, error: claimErr } = await job.admin
      .from("tutor_invites").update({ reminded_at: remindedAt })
      .eq("id", inv.id).eq("status", "pending").is("reminded_at", null).select("id");
    if (claimErr) throw new Error(`tutor_invites: ${claimErr.message}`);
    if (!claimed?.length) continue;
    job.budget--;
    const result = await sendEmail(job.resend!, { to: inv.email, subject, content, idempotencyKey: `invite_reminder:${inv.id}:${inv.sent_at}` });
    if (result.error) {
      await job.admin.from("tutor_invites").update({ reminded_at: null }).eq("id", inv.id).eq("reminded_at", remindedAt);
      bump(job.summary.failed, "invite_reminder");
      logger.warn({ inviteId: inv.id, error: result.error }, "emails: invite reminder failed");
    } else {
      bump(job.summary.sent, "invite_reminder");
    }
  }
}

function listSubjects(labels: string[]): string {
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function inviteReminderEmail(inv: InviteRow, tutorName: string, subjects: string[]): { subject: string; content: EmailContent } {
  if (inv.recipient === "parent") return parentInviteReminderEmail(inv, tutorName, subjects);
  const included = subjects.length
    ? ` ${listSubjects(subjects)} ${subjects.length > 1 ? "are" : "is"} included with your tutoring, so there's nothing to pay for ${subjects.length > 1 ? "them" : "it"}.`
    : "";
  return {
    subject: `Reminder: ${tutorName} invited you to gradefarm.`,
    content: {
      heading: `${tutorName} is waiting for you`,
      paragraphs: [
        `${tutorName} invited you to gradefarm. a few days ago and you haven't accepted yet.${included}`,
        `New to gradefarm.? The button takes you to create your account with this email address (${inv.email}). The invite is accepted as soon as you're in.`,
      ],
      cta: { label: "Accept invite", url: `${appUrl()}/invite/${encodeURIComponent(inv.token)}` },
      footer: `You're receiving this because ${tutorName} invited you on gradefarm. This is the only reminder we'll send. If you don't know them, you can ignore this email.`,
    },
  };
}

/** The reminder for an invite sent to a parent or guardian (routes/invites.ts). */
function parentInviteReminderEmail(inv: InviteRow, tutorName: string, subjects: string[]): { subject: string; content: EmailContent } {
  const child = inv.child_name || "your child";
  const included = subjects.length
    ? ` ${listSubjects(subjects)} ${subjects.length > 1 ? "are" : "is"} included with the tutoring, so there's nothing to pay for ${subjects.length > 1 ? "them" : "it"}.`
    : "";
  return {
    subject: `Reminder: ${tutorName} invited ${child} to gradefarm.`,
    content: {
      heading: `${tutorName} is waiting to tutor ${child}`,
      paragraphs: [
        `${tutorName} invited ${child} to gradefarm. a few days ago and the invite hasn't been accepted yet.${included}`,
        `The account sits under your email (${inv.email}): the button takes you to set it up for ${child}, and the invite is accepted as soon as you're in.`,
      ],
      cta: { label: `Set up ${inv.child_name ? `${inv.child_name}'s` : "the"} account`, url: `${appUrl()}/invite/${encodeURIComponent(inv.token)}` },
      footer: `You're receiving this because ${tutorName} entered your email address on gradefarm as ${child}'s parent or guardian. This is the only reminder we'll send. If you don't know them, you can ignore this email.`,
    },
  };
}

// ── Diagnostics on tutor-included subjects ──────────────────────────────────

interface DiagnosticRow {
  id: string;
  token: string;
  tutor_id: string;
  student_id: string;
  subjects: { name?: string }[] | null;
  created_at: string;
  completed_at: string | null;
  report: Parameters<typeof studentSummary>[0] | null;
}

/** A finished diagnostic, a roster student's or a prospect's (student_id null). */
type DoneRow = Omit<DiagnosticRow, "student_id"> & {
  student_id: string | null;
  submitted_by_name: string | null;
  student_name: string | null;
  prospect_email: string | null;
};

const diagnosticSubject = (d: DiagnosticRow) => d.subjects?.[0]?.name || "your subject";

async function runDiagnosticReminders(job: Job) {
  if (!daytime(job)) return;
  const nowMs = job.now.getTime();
  const { data, error } = await job.admin
    .from("diagnostic_assessments")
    .select("id, token, tutor_id, student_id, subjects, created_at, completed_at, report")
    .not("student_id", "is", null)
    .eq("status", "pending")
    .is("waived_at", null)
    .lte("created_at", new Date(nowMs - DIAGNOSTIC_REMINDER_AFTER).toISOString())
    .gte("created_at", new Date(nowMs - DIAGNOSTIC_LOOKBACK).toISOString())
    .limit(1000);
  if (error) throw new Error(`diagnostic_assessments: ${error.message}`);
  const rows = (data ?? []) as DiagnosticRow[];
  if (rows.length === 0) return;

  const done = await loadDone(job, "diagnostic_reminder", rows.map((d) => d.id));
  const pending = rows.filter((d) => !done.has(`${d.id}:${d.student_id}`));
  const people = await loadRecipients(job, [...pending.map((d) => d.student_id), ...pending.map((d) => d.tutor_id)]);
  for (const d of pending) {
    const r = people.get(d.student_id);
    if (!r || r.unsubscribed) continue;
    const tutorName = people.get(d.tutor_id)?.name ?? "Your tutor";
    await deliver(job, "diagnostic_reminder", r, [d.id], () => ({
      subject: `Your ${diagnosticSubject(d)} check-in is waiting`,
      content: {
        heading: "Your check-in is waiting",
        paragraphs: [
          `Hi ${firstName(r.name)}, ${tutorName} has set you a short diagnostic on ${diagnosticSubject(d)}: 20 questions, no time limit. It shows where you're at so your practice starts in the right place.`,
          `You can practise ${diagnosticSubject(d)} as soon as it's done.`,
        ],
        cta: { label: "Start the diagnostic", url: `${appUrl()}/diagnostic/${encodeURIComponent(d.token)}` },
        footer: "You're receiving this because your tutor set you a diagnostic on gradefarm.",
        unsubscribe: unsubscribeUrl(r.id),
      },
    }));
  }
}

async function runDiagnosticDone(job: Job) {
  const { data, error } = await job.admin
    .from("diagnostic_assessments")
    .select("id, token, tutor_id, student_id, subjects, created_at, completed_at, report, submitted_by_name, student_name, prospect_email")
    .eq("status", "completed")
    .gte("completed_at", new Date(job.now.getTime() - DIAGNOSTIC_DONE_LOOKBACK).toISOString())
    .limit(500);
  if (error) throw new Error(`diagnostic_assessments: ${error.message}`);
  const rows = ((data ?? []) as DoneRow[]).filter((d) => d.report);
  if (rows.length === 0) return;

  // A roster student's: the tutor who set it and every other tutor with the
  // student on their roster. A prospect's: only the tutor who sent it.
  const studentIds = rows.map((d) => d.student_id).filter((x): x is string => !!x);
  const roster = studentIds.length ? await rosterTutorIds(job.admin, studentIds) : new Map<string, string[]>();
  const done = await loadDone(job, "diagnostic_done", rows.map((d) => d.id));
  const pending = rows.flatMap((d) =>
    doneRecipients(d.tutor_id, d.student_id, d.student_id ? roster.get(d.student_id) : undefined)
      .filter((tutorId) => !done.has(`${d.id}:${tutorId}`))
      .map((tutorId) => ({ d, tutorId })),
  );
  if (pending.length === 0) return;
  const people = await loadRecipients(job, [...pending.map((p) => p.tutorId), ...studentIds]);
  for (const { d, tutorId } of pending) {
    const tutor = people.get(tutorId);
    if (!tutor || tutor.unsubscribed) continue;
    const sum = studentSummary(d.report!);
    if (!d.student_id) {
      const prospectName = d.submitted_by_name?.trim() || d.student_name?.trim() || d.prospect_email || "Your prospect";
      await deliver(job, "diagnostic_done", tutor, [d.id], () => {
        const { subject, content } = prospectFinishedEmail({
          tutorName: tutor.name, prospectName, subject: diagnosticSubject(d as DiagnosticRow), summary: sum, link: `${appUrl()}/tutor?tab=diagnostic`,
        });
        return { subject, content: { ...content, unsubscribe: unsubscribeUrl(tutor.id) } };
      });
      continue;
    }
    const setter = tutorId === d.tutor_id;
    const studentName = people.get(d.student_id)?.name ?? "Your student";
    await deliver(job, "diagnostic_done", tutor, [d.id], () => ({
      subject: `${studentName} finished their ${diagnosticSubject(d as DiagnosticRow)} diagnostic: ${sum.percentage}%`,
      content: {
        heading: `${studentName}'s diagnostic is in`,
        paragraphs: [`Hi ${firstName(tutor.name)}, ${studentName} has finished their ${diagnosticSubject(d as DiagnosticRow)} diagnostic.`],
        details: [
          ["Score", `${sum.percentage}% (${sum.band})`],
          ...(sum.work_on.length ? ([["Work on", sum.work_on.join(", ")]] as Array<[string, string]>) : []),
          ...(sum.strong.length ? ([["Strong at", sum.strong.join(", ")]] as Array<[string, string]>) : []),
        ],
        cta: { label: "See the full report", url: `${appUrl()}/tutor?tab=diagnostic` },
        footer: setter
          ? "You're receiving this because you set this diagnostic on gradefarm."
          : `You're receiving this because ${studentName} is one of your students on gradefarm.`,
        unsubscribe: unsubscribeUrl(tutor.id),
      },
    }));
  }
}

// ── Prospects' diagnostics ──────────────────────────────────────────────────

type ProspectReminderRow = ProspectRow & { id: string; token: string; tutor_id: string; subjects: { name?: string }[] | null };

/** Once, a couple of days after a prospect was emailed a diagnostic they haven't started. */
async function runProspectReminders(job: Job) {
  if (!daytime(job)) return;
  const nowMs = job.now.getTime();
  const { data, error } = await job.admin
    .from("diagnostic_assessments")
    .select("id, token, tutor_id, subjects, status, student_id, prospect_email, created_at, sent_at, opened_at, started_at, reminded_at, cancelled_at")
    .is("student_id", null)
    .not("prospect_email", "is", null)
    .eq("status", "pending")
    .is("reminded_at", null)
    .is("started_at", null)
    .is("cancelled_at", null)
    .gt("sent_at", new Date(nowMs - PROSPECT_TTL_MS).toISOString())
    .limit(500);
  if (error) throw new Error(`diagnostic_assessments: ${error.message}`);
  const rows = ((data ?? []) as ProspectReminderRow[]).filter((d) => dueForProspectReminder(d, job.now));
  if (rows.length === 0) return;

  const tutorIds = [...new Set(rows.map((d) => d.tutor_id))];
  const tutors = await loadRecipients(job, tutorIds);
  // The sender's own display name (loadRecipients' name falls back to a greeting word).
  const { data: profiles, error: profErr } = await job.admin.from("profiles").select("id, display_name").in("id", tutorIds);
  if (profErr) throw new Error(`profiles: ${profErr.message}`);
  const displayNames = new Map(((profiles ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name]));
  for (const d of rows) {
    const tutor = tutors.get(d.tutor_id);
    if (!tutor) continue; // tutor deactivated
    if (job.budget <= 0) {
      job.summary.budgetExhausted = true;
      return;
    }
    const { subject, content } = prospectReminderEmail({
      senderName: prospectSenderName(displayNames.get(d.tutor_id)),
      subject: d.subjects?.[0]?.name || "your subject",
      link: prospectLink(d.token),
    });
    if (job.dryRun) {
      job.summary.planned!.push({ kind: "prospect_reminder", to: d.prospect_email!, subject });
      job.budget--;
      continue;
    }
    // Claim it: another run may be here too.
    const remindedAt = new Date().toISOString();
    const { data: claimed, error: claimErr } = await job.admin
      .from("diagnostic_assessments").update({ reminded_at: remindedAt })
      .eq("id", d.id).eq("status", "pending").is("reminded_at", null).is("started_at", null).select("id");
    if (claimErr) throw new Error(`diagnostic_assessments: ${claimErr.message}`);
    if (!claimed?.length) continue;
    job.budget--;
    const result = await sendEmail(job.resend!, { to: d.prospect_email!, subject, content, idempotencyKey: `prospect_reminder:${d.id}:${d.sent_at}` });
    if (result.error) {
      if (!result.blocked) await job.admin.from("diagnostic_assessments").update({ reminded_at: null }).eq("id", d.id).eq("reminded_at", remindedAt);
      bump(result.blocked ? job.summary.blocked : job.summary.failed, "prospect_reminder");
      logger.warn({ diagnosticId: d.id, error: result.error }, "emails: prospect reminder failed");
    } else {
      bump(job.summary.sent, "prospect_reminder");
    }
  }
}

// ── Consultation calls ──────────────────────────────────────────────────────

type ConsultationRow = {
  id: string; tutor_id: string; scheduled_at: string; duration_minutes: number; created_at: string;
  guest_email: string | null; guest_name: string | null; guest_parent_email: string | null;
  guest_time_zone: string | null; guest_token: string | null; reminder_minutes: number[] | null;
};

/** The tutors' own display names (as prospects see them) and booking settings. */
async function loadTutorBooking(job: Job, tutorIds: string[]) {
  const { data: profiles, error } = await job.admin.from("profiles").select("id, display_name").in("id", tutorIds);
  if (error) throw new Error(`profiles: ${error.message}`);
  const { data: settings, error: setErr } = await job.admin
    .from("tutor_booking_settings").select("tutor_id, weekly_hours, time_zone").in("tutor_id", tutorIds);
  if (setErr) throw new Error(`tutor_booking_settings: ${setErr.message}`);
  return {
    names: new Map(((profiles ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, prospectSenderName(p.display_name)])),
    settings: new Map(((settings ?? []) as Pick<SettingsRow, "tutor_id" | "weekly_hours" | "time_zone">[]).map((r) => [r.tutor_id, r])),
  };
}

/** The guest, their parent and the tutor, at the tutor's chosen lead times before a call. */
async function runConsultationReminders(job: Job) {
  const nowMs = job.now.getTime();
  const { data, error } = await job.admin
    .from("tutoring_sessions")
    .select("id, tutor_id, scheduled_at, duration_minutes, created_at, guest_email, guest_name, guest_parent_email, guest_time_zone, guest_token, reminder_minutes")
    .eq("session_type", "consultation")
    .eq("status", "scheduled")
    .gt("scheduled_at", job.now.toISOString())
    .lte("scheduled_at", new Date(nowMs + 8 * DAY).toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`tutoring_sessions: ${error.message}`);
  const calls = (data ?? []) as ConsultationRow[];
  if (calls.length === 0) return;

  const { data: sentRows, error: sentErr } = await job.admin
    .from("consultation_reminders_sent").select("session_id, minutes, recipient").in("session_id", calls.map((c) => c.id));
  if (sentErr) throw new Error(`consultation_reminders_sent: ${sentErr.message}`);
  const sentBySession = new Map<string, Set<string>>();
  for (const r of (sentRows ?? []) as Array<{ session_id: string; minutes: number; recipient: string }>) {
    const set = sentBySession.get(r.session_id) ?? new Set<string>();
    set.add(`${r.minutes}:${r.recipient}`);
    sentBySession.set(r.session_id, set);
  }

  const tutorIds = [...new Set(calls.map((c) => c.tutor_id))];
  const tutors = await loadRecipients(job, tutorIds);
  const { names, settings } = await loadTutorBooking(job, tutorIds);

  for (const c of calls) {
    const tutor = tutors.get(c.tutor_id);
    if (!tutor || !c.guest_email) continue; // tutor deactivated
    const who: Array<"guest" | "parent" | "tutor"> = ["guest"];
    if (c.guest_parent_email) who.push("parent");
    if (!tutor.unsubscribed) who.push("tutor");
    const due = dueConsultationReminders(
      { scheduled_at: c.scheduled_at, created_at: c.created_at, reminder_minutes: c.reminder_minutes ?? [] },
      sentBySession.get(c.id) ?? new Set(), who, nowMs,
    );
    // Only the latest due lead per recipient: a missed earlier one isn't sent late on top.
    const latest = new Map<string, number>();
    for (const d of due) latest.set(d.recipient, Math.min(latest.get(d.recipient) ?? Infinity, d.minutes));
    const tutorName = names.get(c.tutor_id) ?? prospectSenderName(null);
    const tutorZone = settings.get(c.tutor_id)?.time_zone || TIME_ZONE;
    for (const { minutes, recipient } of due) {
      if (latest.get(recipient) !== minutes) continue;
      const to = recipient === "guest" ? c.guest_email : recipient === "parent" ? c.guest_parent_email : tutor.email;
      if (!to) continue;
      if (job.budget <= 0) {
        job.summary.budgetExhausted = true;
        return;
      }
      const isTutor = recipient === "tutor";
      const joinUrl = isTutor ? tutorJoinUrl(c.id) : c.guest_token ? guestJoinUrl(c.guest_token) : null;
      if (!joinUrl) continue;
      const { subject, content } = consultationReminderEmail({
        to: recipient as "guest" | "parent" | "tutor",
        tutorName,
        studentName: c.guest_name?.trim() || "",
        start: c.scheduled_at,
        timeZone: isTutor ? tutorZone : c.guest_time_zone || tutorZone,
        minutes: c.duration_minutes,
        joinUrl,
        lead: minutes,
      });
      if (job.dryRun) {
        job.summary.planned!.push({ kind: "consultation_reminder", to, subject });
        job.budget--;
        continue;
      }
      // Claim it: the primary key makes a second run's insert fail.
      const { error: claimErr } = await job.admin
        .from("consultation_reminders_sent").insert({ session_id: c.id, minutes, recipient });
      if (claimErr) {
        if (claimErr.code === "23505") continue;
        throw new Error(`consultation_reminders_sent: ${claimErr.message}`);
      }
      job.budget--;
      const result = await sendEmail(job.resend!, {
        to, subject, content,
        idempotencyKey: `consultation_reminder:${c.id}:${minutes}:${recipient}`,
        ...(isTutor ? {} : { replyTo: tutor.email }),
      });
      if (result.error) {
        if (!result.blocked) {
          await job.admin.from("consultation_reminders_sent").delete()
            .eq("session_id", c.id).eq("minutes", minutes).eq("recipient", recipient);
        }
        bump(result.blocked ? job.summary.blocked : job.summary.failed, "consultation_reminder");
        logger.warn({ sessionId: c.id, recipient, error: result.error }, "emails: consultation reminder failed");
      } else {
        bump(job.summary.sent, "consultation_reminder");
      }
    }
  }
}

/** Once, a day after a prospect finished a link diagnostic: pick a time for a call. */
async function runBookYourCall(job: Job) {
  if (!daytime(job)) return;
  const nowMs = job.now.getTime();
  const { data, error } = await job.admin
    .from("diagnostic_assessments")
    .select("id, token, tutor_id, subjects, status, student_id, prospect_email, completed_at, booking_reminded_at")
    .is("student_id", null)
    .not("prospect_email", "is", null)
    .eq("status", "completed")
    .is("booking_reminded_at", null)
    .is("cancelled_at", null)
    .lte("completed_at", new Date(nowMs - BOOK_YOUR_CALL_AFTER_MS).toISOString())
    .gt("completed_at", new Date(nowMs - BOOK_YOUR_CALL_UNTIL_MS).toISOString())
    .limit(500);
  if (error) throw new Error(`diagnostic_assessments: ${error.message}`);
  type Row = { id: string; token: string; tutor_id: string; subjects: { name?: string }[] | null; status: string; student_id: string | null; prospect_email: string | null; completed_at: string | null; booking_reminded_at: string | null };
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return;

  const tutorIds = [...new Set(rows.map((d) => d.tutor_id))];
  const tutors = await loadRecipients(job, tutorIds);
  const { names, settings } = await loadTutorBooking(job, tutorIds);
  const { data: live, error: liveErr } = await job.admin
    .from("tutoring_sessions").select("tutor_id, guest_email")
    .eq("session_type", "consultation").eq("status", "scheduled").in("tutor_id", tutorIds).not("guest_email", "is", null);
  if (liveErr) throw new Error(`tutoring_sessions: ${liveErr.message}`);
  const booked = new Set(((live ?? []) as { tutor_id: string; guest_email: string }[]).map((r) => `${r.tutor_id}:${r.guest_email.toLowerCase()}`));

  for (const d of rows) {
    const tutor = tutors.get(d.tutor_id);
    if (!tutor) continue; // tutor deactivated
    const hasLive = booked.has(`${d.tutor_id}:${d.prospect_email!.toLowerCase()}`);
    const tutorHasHours = hasHours((settings.get(d.tutor_id)?.weekly_hours ?? {}) as Parameters<typeof hasHours>[0]);
    if (!dueBookYourCall(d, hasLive, tutorHasHours, nowMs)) continue;
    if (job.budget <= 0) {
      job.summary.budgetExhausted = true;
      return;
    }
    const { subject, content } = bookYourCallEmail({
      tutorName: names.get(d.tutor_id) ?? prospectSenderName(null),
      subject: d.subjects?.[0]?.name || "your subject",
      bookUrl: `${appUrl()}/book/${encodeURIComponent(d.token)}`,
    });
    if (job.dryRun) {
      job.summary.planned!.push({ kind: "book_your_call", to: d.prospect_email!, subject });
      job.budget--;
      continue;
    }
    const remindedAt = new Date().toISOString();
    const { data: claimed, error: claimErr } = await job.admin
      .from("diagnostic_assessments").update({ booking_reminded_at: remindedAt })
      .eq("id", d.id).is("booking_reminded_at", null).select("id");
    if (claimErr) throw new Error(`diagnostic_assessments: ${claimErr.message}`);
    if (!claimed?.length) continue;
    job.budget--;
    const result = await sendEmail(job.resend!, {
      to: d.prospect_email!, subject, content, replyTo: tutor.email,
      idempotencyKey: `book_your_call:${d.id}`,
    });
    if (result.error) {
      if (!result.blocked) await job.admin.from("diagnostic_assessments").update({ booking_reminded_at: null }).eq("id", d.id).eq("booking_reminded_at", remindedAt);
      bump(result.blocked ? job.summary.blocked : job.summary.failed, "book_your_call");
      logger.warn({ diagnosticId: d.id, error: result.error }, "emails: book-your-call failed");
    } else {
      bump(job.summary.sent, "book_your_call");
    }
  }
}

// ── Parent progress reports ─────────────────────────────────────────────────

export function localWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone: TIME_ZONE, weekday: "short" }).format(date);
}

interface ParentRow {
  tutor_id: string;
  student_id: string;
  parent_email: string;
  parent_name: string | null;
  parent_report_week: string | null;
}

async function runParentReports(job: Job) {
  const hour = localHour(job.now);
  if (localWeekday(job.now) !== "Sun" || hour < PARENT_REPORT_HOURS.from || hour >= PARENT_REPORT_HOURS.to) return;
  const week = localDate(job.now);
  const { data, error } = await job.admin
    .from("tutor_students")
    .select("tutor_id, student_id, parent_email, parent_name, parent_report_week")
    .not("parent_email", "is", null)
    .is("parent_reports_stopped_at", null)
    .or(`parent_report_week.is.null,parent_report_week.lt.${week}`)
    .limit(500);
  if (error) throw new Error(`tutor_students: ${error.message}`);
  const rows = (data ?? []) as ParentRow[];
  if (rows.length === 0) return;

  // Only tutors whose plan includes parent reports (or who need no plan).
  const tutorIds = [...new Set(rows.map((r) => r.tutor_id))];
  const [billingRes, adminsRes] = await Promise.all([
    job.admin.from("tutor_billing").select("*").in("tutor_id", tutorIds),
    job.admin.from("profiles").select("id").in("id", tutorIds).eq("is_admin", true),
  ]);
  if (billingRes.error) throw new Error(`tutor_billing: ${billingRes.error.message}`);
  const admins = new Set(((adminsRes.data ?? []) as { id: string }[]).map((p) => p.id));
  const billing = new Map(((billingRes.data ?? []) as TutorBillingRow[]).map((b) => [b.tutor_id, b]));
  const included = (tutorId: string) => {
    const b = billing.get(tutorId) ?? null;
    return admins.has(tutorId) || !!b?.exempt || (planIsLive(b) && b!.parent_reports);
  };

  const due = rows.filter((r) => included(r.tutor_id));
  const people = await loadRecipients(job, [...due.map((r) => r.tutor_id), ...due.map((r) => r.student_id)]);
  for (const row of due) {
    const tutor = people.get(row.tutor_id);
    const student = people.get(row.student_id);
    if (!tutor || !student) continue; // deactivated
    if (job.budget <= 0) {
      job.summary.budgetExhausted = true;
      return;
    }
    const report = await loadParentReport(job.admin, row.tutor_id, row.student_id, job.now, localDate);
    const { subject, content } = parentReportEmail({
      parentName: row.parent_name,
      studentName: student.name,
      tutorName: tutor.name,
      data: report,
      unsubscribe: parentUnsubscribeUrl(row.tutor_id, row.student_id),
      formatWhen,
    });
    if (job.dryRun) {
      job.summary.planned!.push({ kind: "parent_report", to: row.parent_email, subject });
      job.budget--;
      continue;
    }
    // Claim this week's report: another run may be here too.
    const { data: claimed, error: claimErr } = await job.admin
      .from("tutor_students").update({ parent_report_week: week })
      .eq("tutor_id", row.tutor_id).eq("student_id", row.student_id)
      .or(`parent_report_week.is.null,parent_report_week.lt.${week}`)
      .select("student_id");
    if (claimErr) throw new Error(`tutor_students: ${claimErr.message}`);
    if (!claimed?.length) continue;
    job.budget--;
    const result = await sendEmail(job.resend!, {
      to: row.parent_email, subject, content, idempotencyKey: `parent_report:${row.tutor_id}:${row.student_id}:${week}`,
    });
    if (result.blocked) {
      bump(job.summary.blocked, "parent_report");
    } else if (result.error) {
      await job.admin.from("tutor_students").update({ parent_report_week: row.parent_report_week })
        .eq("tutor_id", row.tutor_id).eq("student_id", row.student_id).eq("parent_report_week", week);
      bump(job.summary.failed, "parent_report");
      logger.warn({ tutorId: row.tutor_id, studentId: row.student_id, error: result.error }, "emails: parent report failed");
    } else {
      bump(job.summary.sent, "parent_report");
    }
  }
}

interface AccountParentRow {
  id: string;
  account_holder: "student" | "parent" | null;
  parent_email: string;
  parent_name: string | null;
  parent_report_week: string | null;
}

/**
 * The same report for a parent on the student's own account (no tutor
 * needed). Runs after the tutors' reports and skips a parent who already got
 * one about this student this week from a tutor.
 */
async function runAccountParentReports(job: Job) {
  const hour = localHour(job.now);
  if (localWeekday(job.now) !== "Sun" || hour < PARENT_REPORT_HOURS.from || hour >= PARENT_REPORT_HOURS.to) return;
  const week = localDate(job.now);
  const { data, error } = await job.admin
    .from("profiles")
    .select("id, account_holder, parent_email, parent_name, parent_report_week")
    .not("parent_email", "is", null)
    .not("parent_consent_at", "is", null)
    .is("parent_reports_stopped_at", null)
    .is("deactivated_at", null)
    .or(`parent_report_week.is.null,parent_report_week.lt.${week}`)
    .limit(500);
  if (error) throw new Error(`profiles: ${error.message}`);
  const rows = (data ?? []) as AccountParentRow[];
  if (rows.length === 0) return;

  const { data: tutorSent, error: tsErr } = await job.admin
    .from("tutor_students").select("student_id, parent_email")
    .in("student_id", rows.map((r) => r.id)).eq("parent_report_week", week);
  if (tsErr) throw new Error(`tutor_students: ${tsErr.message}`);
  const fromTutor = new Set(((tutorSent ?? []) as { student_id: string; parent_email: string | null }[])
    .map((r) => `${r.student_id}:${(r.parent_email ?? "").toLowerCase()}`));

  const people = await loadRecipients(job, rows.map((r) => r.id));
  for (const row of rows) {
    const student = people.get(row.id);
    if (!student) continue; // deactivated or no sign-in email
    // A parent who set the account up signs in with it, so follow a change of sign-in email.
    const to = row.account_holder === "parent" ? student.email : row.parent_email;
    if (fromTutor.has(`${row.id}:${to.toLowerCase()}`)) continue;
    if (job.budget <= 0) {
      job.summary.budgetExhausted = true;
      return;
    }
    const report = await loadParentReport(job.admin, null, row.id, job.now, localDate);
    const { subject, content } = parentReportEmail({
      parentName: row.parent_name,
      studentName: student.name,
      tutorName: null,
      data: report,
      unsubscribe: accountParentUnsubscribeUrl(row.id),
      formatWhen,
    });
    if (job.dryRun) {
      job.summary.planned!.push({ kind: "parent_report", to, subject });
      job.budget--;
      continue;
    }
    // Claim this week's report: another run may be here too.
    const { data: claimed, error: claimErr } = await job.admin
      .from("profiles").update({ parent_report_week: week })
      .eq("id", row.id)
      .or(`parent_report_week.is.null,parent_report_week.lt.${week}`)
      .select("id");
    if (claimErr) throw new Error(`profiles: ${claimErr.message}`);
    if (!claimed?.length) continue;
    job.budget--;
    const result = await sendEmail(job.resend!, {
      to, subject, content, idempotencyKey: `parent_report:account:${row.id}:${week}`,
    });
    if (result.blocked) {
      bump(job.summary.blocked, "parent_report");
    } else if (result.error) {
      await job.admin.from("profiles").update({ parent_report_week: row.parent_report_week })
        .eq("id", row.id).eq("parent_report_week", week);
      bump(job.summary.failed, "parent_report");
      logger.warn({ studentId: row.id, error: result.error }, "emails: account parent report failed");
    } else {
      bump(job.summary.sent, "parent_report");
    }
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function runAutomatedEmails(admin: SupabaseClient, resend: Resend | null, opts: RunOptions = {}): Promise<RunSummary> {
  const dryRun = !!opts.dryRun;
  if (!dryRun && !resend) throw new Error("RESEND_API_KEY is not configured");
  const summary: RunSummary = { dryRun, sent: {}, failed: {}, blocked: {}, budgetExhausted: false, ...(dryRun ? { planned: [] } : {}) };
  const job: Job = {
    admin,
    resend,
    now: opts.now ?? new Date(),
    dryRun,
    budget: opts.maxEmails ?? 300,
    summary,
    emailCache: new Map(),
  };

  // Time-sensitive reminders first, so a busy run spends its budget on them.
  const steps: Array<[string, (j: Job) => Promise<void>]> = [
    ["session reminders", runSessionReminders],
    ["assignment reminders", runAssignmentReminders],
    ["recurring assignments", runRecurringAssignmentEmails],
    ["diagnostic results", runDiagnosticDone],
    ["diagnostic reminders", runDiagnosticReminders],
    ["prospect reminders", runProspectReminders],
    ["consultation reminders", runConsultationReminders],
    ["book your call", runBookYourCall],
    ["invite reminders", runInviteReminders],
    ["parent reports", runParentReports],
    ["account parent reports", runAccountParentReports],
    ["welcome", runWelcome],
  ];
  const errors: string[] = [];
  for (const [name, step] of steps) {
    try {
      await step(job);
    } catch (err) {
      // One failing step shouldn't stop the others.
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, step: name }, "emails: step failed");
      errors.push(`${name}: ${message}`);
    }
  }
  if (errors.length) throw Object.assign(new Error(errors.join("; ")), { summary });
  return summary;
}
