import { test } from "node:test";
import assert from "node:assert/strict";
import type { Resend } from "resend";
import { questionnaireDoneEmail, questionnaireReminderEmail } from "../src/lib/questionnaire-emails";
import { runAutomatedEmails } from "../src/lib/automated-emails";
import { fakeSupabase, type FakeDb } from "./fake-supabase";

const text = (e: { subject: string; content: { heading: string; paragraphs: string[]; footer: string; cta?: { label: string }; details?: Array<[string, string]> } }) =>
  [e.subject, e.content.heading, ...e.content.paragraphs, e.content.footer, e.content.cta?.label ?? "", ...(e.content.details ?? []).flat()].join("\n");

const base = {
  tutorName: "Adhyayan Verma", studentName: "Sam Lee", start: "2027-03-10T05:00:00Z",
  timeZone: "Australia/Adelaide", url: "https://x/questionnaire/tok",
};

test("reminder emails never say 'your tutor'; the parent version names the student", () => {
  const g = questionnaireReminderEmail({ ...base, to: "guest" });
  const p = questionnaireReminderEmail({ ...base, to: "parent" });
  assert.doesNotMatch(text(g), /your tutor/i);
  assert.doesNotMatch(text(p), /your tutor/i);
  assert.ok(text(p).includes("Sam Lee"));
  assert.ok(text(g).includes("Adhyayan Verma"));
  assert.equal(g.content.cta?.url, base.url);
  assert.equal(p.content.cta?.url, base.url);
});

test("the tutor notice lists flagged answers and links the report", () => {
  const e = questionnaireDoneEmail({
    tutorName: "Adhyayan Verma", studentName: "Sam Lee", reportUrl: "https://x/tutor?tab=diagnostic",
    flagged: [{ question: "How dedicated are you?", answer: "NOT dedicated" }],
  });
  assert.ok(text(e).includes("How dedicated are you?"));
  assert.ok(text(e).includes("NOT dedicated"));
  assert.ok(text(e).includes("Sam Lee"));
  assert.equal(e.content.cta?.url, "https://x/tutor?tab=diagnostic");
  const none = questionnaireDoneEmail({ tutorName: "A B", studentName: "Sam", reportUrl: "u", flagged: [] });
  assert.match(text(none), /no red flags|nothing flagged/i);
});

// ---- the job ---------------------------------------------------------------

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();
const TUTOR = "tutor-1";
process.env.EMAIL_UNSUBSCRIBE_SECRET ??= "test-secret";

function fakeResend() {
  const sent: Array<{ to: string[]; subject: string; replyTo?: string; idempotencyKey?: string }> = [];
  const resend = {
    emails: {
      send: async (p: { to: string[]; subject: string; replyTo?: string; reply_to?: string }, o?: { idempotencyKey?: string }) => {
        sent.push({ to: p.to, subject: p.subject, replyTo: p.replyTo ?? p.reply_to, idempotencyKey: o?.idempotencyKey });
        return { data: { id: String(sent.length) }, error: null };
      },
    },
  } as unknown as Resend;
  return { resend, sent };
}

const QUESTIONNAIRE = { intro: "", items: [{ id: "q", type: "one", label: "Dedicated?", options: [{ id: "a", label: "Not at all", flag: true }] }] };

function db(start: number): FakeDb {
  return {
    tables: {
      profiles: [{ id: TUTOR, display_name: "Sam Tutor", deactivated_at: null, emails_unsubscribed_at: null }],
      tutor_booking_settings: [{ tutor_id: TUTOR, weekly_hours: { mon: [["09:00", "17:00"]] }, time_zone: "Australia/Adelaide" }],
      diagnostic_assessments: [{
        id: "diag-1", token: "dtok", tutor_id: TUTOR, student_id: null, cancelled_at: null, status: "completed",
        questionnaire: QUESTIONNAIRE, questionnaire_answers: null, questionnaire_submitted_at: null, questionnaire_reminded_at: null,
      }],
      tutoring_sessions: [{
        id: "call-1", tutor_id: TUTOR, session_type: "consultation", status: "scheduled", diagnostic_id: "diag-1",
        scheduled_at: iso(start), duration_minutes: 45, created_at: iso(start - 3 * DAY),
        guest_email: "kid@example.com", guest_name: "Sam Lee", guest_parent_email: "mum@example.com",
        guest_time_zone: "Australia/Adelaide", guest_token: "gt",
      }],
      email_log: [],
    },
    users: { [TUTOR]: { email: "tutor@example.com" } },
  };
}

test("the questionnaire reminder goes to guest and parent once, Reply-To the tutor", async () => {
  const start = Date.parse("2027-03-10T05:00:00Z");
  const d = db(start);
  const admin = fakeSupabase(d);
  const { resend, sent } = fakeResend();
  const now = new Date(start - 20 * HOUR);
  const s1 = await runAutomatedEmails(admin, resend, { now, steps: ["questionnaire reminders"] });
  assert.equal(s1.sent.questionnaire_reminder, 2);
  assert.deepEqual(sent.map((m) => m.to[0]).sort(), ["kid@example.com", "mum@example.com"]);
  assert.ok(sent.every((m) => m.replyTo === "tutor@example.com"));
  assert.ok(d.tables.diagnostic_assessments[0].questionnaire_reminded_at);
  const s2 = await runAutomatedEmails(admin, resend, { now: new Date(start - 19 * HOUR), steps: ["questionnaire reminders"] });
  assert.equal(s2.sent.questionnaire_reminder, undefined);
  assert.equal(sent.length, 2);
});

test("no reminder for roster diagnostics, legacy links or a call booked under a day ahead", async () => {
  const start = Date.parse("2027-03-10T05:00:00Z");
  const now = new Date(start - 20 * HOUR);
  const roster = db(start); roster.tables.diagnostic_assessments[0].student_id = "stu";
  const legacy = db(start); legacy.tables.diagnostic_assessments[0].questionnaire = null;
  const late = db(start); late.tables.tutoring_sessions[0].created_at = iso(start - 20 * HOUR);
  for (const d of [roster, legacy, late]) {
    const { resend, sent } = fakeResend();
    await runAutomatedEmails(fakeSupabase(d), resend, { now, steps: ["questionnaire reminders"] });
    assert.equal(sent.length, 0);
  }
});

test("a dry run plans the reminder without recording it", async () => {
  const start = Date.parse("2027-03-10T05:00:00Z");
  const d = db(start);
  const s = await runAutomatedEmails(fakeSupabase(d), null, { now: new Date(start - 20 * HOUR), dryRun: true, steps: ["questionnaire reminders"] });
  assert.equal(s.planned?.length, 2);
  assert.equal(d.tables.diagnostic_assessments[0].questionnaire_reminded_at, null);
});

test("the tutor is told once when answers arrive, with flagged answers; unsubscribed tutors aren't", async () => {
  const start = Date.parse("2027-03-10T05:00:00Z");
  const d = db(start);
  Object.assign(d.tables.diagnostic_assessments[0], {
    questionnaire_submitted_at: iso(start - 2 * HOUR), questionnaire_answers: { q: "a" }, submitted_by_name: "Sam Lee",
  });
  const { resend, sent } = fakeResend();
  const now = new Date(start - HOUR);
  const s1 = await runAutomatedEmails(fakeSupabase(d), resend, { now, steps: ["questionnaire answers"] });
  assert.equal(s1.sent.questionnaire_done, 1);
  assert.deepEqual(sent[0].to, ["tutor@example.com"]);
  const s2 = await runAutomatedEmails(fakeSupabase(d), resend, { now, steps: ["questionnaire answers"] });
  assert.equal(s2.sent.questionnaire_done, undefined);

  const u = db(start);
  Object.assign(u.tables.diagnostic_assessments[0], { questionnaire_submitted_at: iso(start - 2 * HOUR), questionnaire_answers: { q: "a" } });
  u.tables.profiles[0].emails_unsubscribed_at = "2026-01-01T00:00:00Z";
  const r2 = fakeResend();
  await runAutomatedEmails(fakeSupabase(u), r2.resend, { now, steps: ["questionnaire answers"] });
  assert.equal(r2.sent.length, 0);
});
