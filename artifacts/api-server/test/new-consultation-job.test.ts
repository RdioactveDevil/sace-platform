/**
 * The email job with a parent as a consultation's primary recipient
 * (tutoring_sessions.guest_is_parent / diagnostic_assessments.prospect_is_parent),
 * and records without a test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Resend } from "resend";
import { runAutomatedEmails } from "../src/lib/automated-emails";
import { fakeSupabase, type FakeDb } from "./fake-supabase";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();
const TUTOR = "tutor-1";

function fakeResend() {
  const sent: Array<{ to: string; subject: string; text: string; replyTo?: string }> = [];
  const resend = {
    emails: {
      send: async (p: { to: string[]; subject: string; text: string; replyTo?: string }) => {
        sent.push({ to: p.to[0], subject: p.subject, text: p.text, replyTo: p.replyTo });
        return { data: { id: String(sent.length) }, error: null };
      },
    },
  } as unknown as Resend;
  return { resend, sent };
}

function baseDb(): FakeDb {
  return {
    tables: {
      profiles: [{ id: TUTOR, display_name: "Jane Smith", deactivated_at: null, emails_unsubscribed_at: "2026-01-01T00:00:00Z" }],
      tutor_booking_settings: [{ tutor_id: TUTOR, weekly_hours: { mon: [["09:00", "17:00"]] }, time_zone: "Australia/Adelaide" }],
      tutoring_sessions: [],
      consultation_reminders_sent: [],
      diagnostic_assessments: [],
    },
    keys: { consultation_reminders_sent: ["session_id", "minutes", "recipient"] },
    users: { [TUTOR]: { email: "jane@example.com" } },
  };
}

const START = Date.parse("2027-03-10T02:00:00Z");

const parentCall = (o: Record<string, unknown> = {}) => ({
  id: "call-1", tutor_id: TUTOR, session_type: "consultation", status: "scheduled",
  scheduled_at: iso(START), duration_minutes: 45, created_at: iso(START - 3 * DAY), diagnostic_id: "diag-1",
  guest_email: "parent@example.com", guest_name: "Sam Lee", guest_parent_email: null, guest_is_parent: true,
  guest_time_zone: "Australia/Adelaide", guest_token: "G".repeat(43), reminder_minutes: [60], ics_sequence: 0,
  ...o,
});

const record = (o: Record<string, unknown> = {}) => ({
  id: "diag-1", token: "dtok", tutor_id: TUTOR, subjects: [], status: "pending", student_id: null,
  student_name: "Sam Lee", prospect_email: "parent@example.com", prospect_is_parent: true, parent_email: null,
  has_test: false, questionnaire: { intro: "Hi", items: [{ id: "a", type: "short", label: "School?" }] },
  pre_call_form_url: null, questionnaire_submitted_at: null, questionnaire_reminded_at: null,
  created_at: iso(START - 3 * DAY), sent_at: null, opened_at: null, started_at: null, reminded_at: null, cancelled_at: null,
  ...o,
});

test("a parent-only call's reminder goes to the parent, in parent wording", async () => {
  const db = baseDb();
  db.tables.tutoring_sessions.push(parentCall());
  const { resend, sent } = fakeResend();
  const s = await runAutomatedEmails(fakeSupabase(db), resend, { now: new Date(START - 55 * MIN), steps: ["consultation reminders"] });
  assert.equal(s.sent.consultation_reminder, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "parent@example.com");
  assert.equal(sent[0].replyTo, "jane@example.com");
  assert.match(sent[0].text, /Hi,/);
  assert.match(sent[0].text, /Sam Lee's consultation call with Jane Smith/);
  assert.doesNotMatch(sent[0].text, /your tutor/i);
  // Claimed under the guest's slot, as for any booking.
  assert.deepEqual(db.tables.consultation_reminders_sent.map((r) => r.recipient), ["guest"]);
});

test("a student's call keeps the student wording", async () => {
  const db = baseDb();
  db.tables.tutoring_sessions.push(parentCall({ guest_email: "sam@example.com", guest_is_parent: undefined }));
  const { resend, sent } = fakeResend();
  await runAutomatedEmails(fakeSupabase(db), resend, { now: new Date(START - 55 * MIN), steps: ["consultation reminders"] });
  assert.equal(sent[0].to, "sam@example.com");
  assert.match(sent[0].text, /Your consultation call with Jane Smith/);
  assert.doesNotMatch(sent[0].text, /Hi,/);
});

test("a parent-only call's questionnaire reminder asks the parent to pass it on", async () => {
  const db = baseDb();
  db.tables.tutoring_sessions.push(parentCall());
  db.tables.diagnostic_assessments.push(record());
  const { resend, sent } = fakeResend();
  const s = await runAutomatedEmails(fakeSupabase(db), resend, { now: new Date(START - 12 * HOUR), steps: ["questionnaire reminders"] });
  assert.equal(s.sent.questionnaire_reminder, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "parent@example.com");
  assert.match(sent[0].subject, /Before Sam Lee's call with Jane Smith/);
  assert.match(sent[0].text, /would like Sam Lee to fill in/);
  assert.match(sent[0].text, /\/questionnaire\/dtok/);
});

const SENT_AT = Date.parse("2027-03-07T00:00:00Z");
const DAYTIME = Date.parse("2027-03-10T00:00:00Z"); // 10:30 in Adelaide

test("a parent-primary diagnostic's reminder names the student and asks to pass it on", async () => {
  const db = baseDb();
  db.tables.diagnostic_assessments.push(record({ has_test: true, subjects: [{ name: "Chemistry" }], sent_at: iso(SENT_AT), created_at: iso(SENT_AT) }));
  const { resend, sent } = fakeResend();
  const s = await runAutomatedEmails(fakeSupabase(db), resend, { now: new Date(DAYTIME), steps: ["prospect reminders"] });
  assert.equal(s.sent.prospect_reminder, 1);
  assert.equal(sent[0].to, "parent@example.com");
  assert.match(sent[0].subject, /Sam Lee's Chemistry diagnostic from Jane Smith/);
  assert.match(sent[0].text, /Please pass this link on to them/);
});

test("a record without a test gets no diagnostic reminder", async () => {
  const db = baseDb();
  db.tables.diagnostic_assessments.push(record({ sent_at: iso(SENT_AT), created_at: iso(SENT_AT) }));
  const { resend, sent } = fakeResend();
  await runAutomatedEmails(fakeSupabase(db), resend, { now: new Date(DAYTIME), steps: ["prospect reminders"] });
  assert.equal(sent.length, 0);
});

test("a student-primary diagnostic's reminder is unchanged", async () => {
  const db = baseDb();
  db.tables.diagnostic_assessments.push(record({
    has_test: undefined, prospect_is_parent: undefined, prospect_email: "sam@example.com",
    subjects: [{ name: "Chemistry" }], sent_at: iso(SENT_AT), created_at: iso(SENT_AT),
  }));
  const { resend, sent } = fakeResend();
  await runAutomatedEmails(fakeSupabase(db), resend, { now: new Date(DAYTIME), steps: ["prospect reminders"] });
  assert.equal(sent[0].to, "sam@example.com");
  assert.equal(sent[0].subject, "Reminder: your Chemistry diagnostic from Jane Smith");
});
