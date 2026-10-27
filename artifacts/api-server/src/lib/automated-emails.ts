/**
 * Automated emails, sent by the /api/cron/emails job:
 *   • welcome               – once, after a new account confirms its email
 *   • session_reminder_24h  – students, about a day before a booked session
 *   • session_reminder_1h   – students and the tutor, about an hour before
 *   • assignment_due        – the day before an unfinished assignment is due
 *   • assignment_overdue    – the day after, if it is still unfinished
 *   • invite_reminder       – once, if a tutor's invite isn't accepted after a
 *                             few days (recorded on the invite: the invitee may
 *                             have no account, so no email_log row)
 *   • diagnostic_reminder   – once, if a student hasn't done the diagnostic on a
 *                             tutor-included subject after a couple of days
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
 * respect profiles.emails_unsubscribed_at.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resend } from "resend";
import { logger } from "./logger";
import { accountParentUnsubscribeUrl, appUrl, parentUnsubscribeUrl, sendEmail, unsubscribeUrl, type EmailContent } from "./email";
import { subjectLabel } from "./included-subject";
import { studentSummary } from "./student-diagnostic";
import { rosterTutorIds, tutorsToNotify } from "./student-tutors";
import { loadParentReport, parentReportEmail } from "./parent-reports";
import { planIsLive, type TutorBillingRow } from "./tutor-plan";

export const TIME_ZONE = "Australia/Adelaide";

export type EmailKind =
  | "welcome"
  | "session_reminder_24h"
  | "session_reminder_1h"
  | "assignment_due"
  | "assignment_overdue"
  | "invite_reminder"
  | "diagnostic_reminder"
  | "diagnostic_done"
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
    if (r.status === "sent" || r.attempts >= 3 || inFlight) done.add(`${r.ref_id}:${r.recipient_id}`);
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
  build: (claimed: string[]) => { subject: string; content: EmailContent },
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
        ? { status: "failed", error: result.error.slice(0, 500), updated_at: new Date().toISOString() }
        : { status: "sent", provider_id: result.id, updated_at: new Date().toISOString() },
    )
    .eq("kind", kind)
    .eq("recipient_id", recipient.id)
    .in("ref_id", claimed);
  if (logErr) logger.error({ err: logErr, kind }, "emails: could not record send result");

  if (result.error) {
    bump(job.summary.failed, kind);
    logger.warn({ kind, recipient: recipient.id, error: result.error }, "emails: send failed");
  } else {
    bump(job.summary.sent, kind);
  }
}

// ── Welcome ─────────────────────────────────────────────────────────────────

async function runWelcome(job: Job) {
  const since = new Date(job.now.getTime() - WELCOME_WINDOW).toISOString();
  const { data, error } = await job.admin
    .from("profiles")
    .select("id, is_tutor, tutor_application_status")
    .gte("created_at", since)
    .is("deactivated_at", null)
    .limit(500);
  if (error) throw new Error(`profiles: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; is_tutor: boolean; tutor_application_status: string | null }>;
  if (rows.length === 0) return;

  const done = await loadDone(job, "welcome", rows.map((r) => r.id));
  const pending = rows.filter((r) => !done.has(`${r.id}:${r.id}`));
  const recipients = await loadRecipients(job, pending.map((r) => r.id));

  for (const row of pending) {
    const r = recipients.get(row.id);
    if (!r || r.unsubscribed) continue;
    // Wait until the address is confirmed so we don't mail typos.
    if (!(await authEmail(job, row.id)).confirmed) continue;
    const isTutor = row.is_tutor || (row.tutor_application_status ?? "none") !== "none";
    await deliver(job, "welcome", r, [row.id], () => welcomeEmail(r, isTutor));
  }
}

function welcomeEmail(r: Recipient, isTutor: boolean): { subject: string; content: EmailContent } {
  if (isTutor) {
    return {
      subject: "Welcome to gradefarm.",
      content: {
        heading: `Welcome to gradefarm., ${r.name}`,
        paragraphs: [
          "Thanks for signing up as a tutor. Once your account is approved you'll have the Tutor portal, where you can:",
        ],
        details: [
          ["Students", "Add students and classes to your roster"],
          ["Assignments", "Set quizzes and homework with due dates"],
          ["Sessions", "Book one-off or weekly video sessions"],
          ["Progress", "See each student's accuracy and weak topics"],
        ],
        cta: { label: "Open gradefarm.", url: `${appUrl()}/tutor` },
        footer: "You're receiving this because you created a gradefarm. tutor account.",
      },
    };
  }
  return {
    subject: "Welcome to gradefarm.",
    content: {
      heading: `Welcome to gradefarm., ${r.name}`,
      paragraphs: [
        "Your account is ready. Here's how to get the most out of it:",
      ],
      details: [
        ["1. Pick a subject", "Choose the SACE subjects you're studying"],
        ["2. Practise", "Questions adapt to you, and you get similar ones to retry when you miss one"],
        ["3. Ask Titan", "Get step-by-step help on any question you're stuck on"],
        ["4. Keep a streak", "A few questions a day builds XP and keeps your streak going"],
      ],
      cta: { label: "Start practising", url: `${appUrl()}/home` },
      footer: "You're receiving this because you created a gradefarm. account.",
    },
  };
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
        `Hi ${r.name}, this is a reminder about your ${s.session_type === "group" ? "group " : ""}session with ${withWhom}.`,
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
          ? `Hi ${r.name}, ${many ? "these were" : "this was"} due on ${dueText} and ${many ? "aren't" : "isn't"} finished yet. It's not too late to get ${many ? "them" : "it"} done.`
          : `Hi ${r.name}, just a heads up that ${many ? "these are" : "this is"} due tomorrow and not finished yet.`,
      ],
      details,
      cta: { label: overdue ? "Finish now" : "Start now", url: `${appUrl()}/home` },
      footer: "You're receiving this because your tutor set you work on gradefarm.",
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
          `Hi ${r.name}, ${tutorName} has set you a short diagnostic on ${diagnosticSubject(d)}: 20 questions, no time limit. It shows where you're at so your practice starts in the right place.`,
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
    .select("id, token, tutor_id, student_id, subjects, created_at, completed_at, report")
    .not("student_id", "is", null)
    .eq("status", "completed")
    .gte("completed_at", new Date(job.now.getTime() - DIAGNOSTIC_DONE_LOOKBACK).toISOString())
    .limit(500);
  if (error) throw new Error(`diagnostic_assessments: ${error.message}`);
  const rows = ((data ?? []) as DiagnosticRow[]).filter((d) => d.report);
  if (rows.length === 0) return;

  // The tutor who set it and every other tutor with the student on their roster.
  const roster = await rosterTutorIds(job.admin, rows.map((d) => d.student_id));
  const done = await loadDone(job, "diagnostic_done", rows.map((d) => d.id));
  const pending = rows.flatMap((d) =>
    tutorsToNotify(d.tutor_id, roster.get(d.student_id))
      .filter((tutorId) => !done.has(`${d.id}:${tutorId}`))
      .map((tutorId) => ({ d, tutorId })),
  );
  if (pending.length === 0) return;
  const people = await loadRecipients(job, [...pending.map((p) => p.tutorId), ...pending.map((p) => p.d.student_id)]);
  for (const { d, tutorId } of pending) {
    const tutor = people.get(tutorId);
    if (!tutor || tutor.unsubscribed) continue;
    const setter = tutorId === d.tutor_id;
    const studentName = people.get(d.student_id)?.name ?? "Your student";
    const sum = studentSummary(d.report!);
    await deliver(job, "diagnostic_done", tutor, [d.id], () => ({
      subject: `${studentName} finished their ${diagnosticSubject(d)} diagnostic: ${sum.percentage}%`,
      content: {
        heading: `${studentName}'s diagnostic is in`,
        paragraphs: [`Hi ${tutor.name}, ${studentName} has finished their ${diagnosticSubject(d)} diagnostic.`],
        details: [
          ["Score", `${sum.percentage}% (${sum.band})`],
          ...(sum.work_on.length ? ([["Work on", sum.work_on.join(", ")]] as Array<[string, string]>) : []),
          ...(sum.strong.length ? ([["Strong at", sum.strong.join(", ")]] as Array<[string, string]>) : []),
        ],
        // The full report sits with the tutor who set it; other tutors see the score on the student.
        cta: setter
          ? { label: "See the full report", url: `${appUrl()}/tutor?tab=diagnostic` }
          : { label: `See ${studentName} on gradefarm`, url: `${appUrl()}/tutor?tab=students` },
        footer: setter
          ? "You're receiving this because you set this diagnostic on gradefarm."
          : `You're receiving this because ${studentName} is one of your students on gradefarm.`,
        unsubscribe: unsubscribeUrl(tutor.id),
      },
    }));
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
    if (result.error) {
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
    if (result.error) {
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
  const summary: RunSummary = { dryRun, sent: {}, failed: {}, budgetExhausted: false, ...(dryRun ? { planned: [] } : {}) };
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
    ["diagnostic results", runDiagnosticDone],
    ["diagnostic reminders", runDiagnosticReminders],
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
