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
  const sent: Array<{ to: string[]; subject: string; idempotencyKey?: string }> = [];
  const resend = {
    emails: {
      send: async (p: { to: string[]; subject: string }, o?: { idempotencyKey?: string }) => {
        sent.push({ to: p.to, subject: p.subject, idempotencyKey: o?.idempotencyKey });
        return { data: { id: String(sent.length) }, error: null };
      },
    },
  } as unknown as Resend;
  return { resend, sent };
}

function baseDb(): FakeDb {
  return {
    tables: {
      profiles: [{ id: TUTOR, display_name: "Sam Tutor", deactivated_at: null, emails_unsubscribed_at: "2026-01-01T00:00:00Z" }],
      tutor_booking_settings: [{ tutor_id: TUTOR, weekly_hours: { mon: [["09:00", "17:00"]] }, time_zone: "Australia/Adelaide" }],
      tutoring_sessions: [],
      consultation_reminders_sent: [],
      diagnostic_assessments: [],
    },
    keys: { consultation_reminders_sent: ["session_id", "minutes", "recipient"] },
    users: { [TUTOR]: { email: "tutor@example.com" } },
  };
}

test("a rescheduled consultation's reminder goes out again with a new idempotency key", async () => {
  const db = baseDb();
  const first = Date.parse("2027-03-10T02:00:00Z");
  const call = {
    id: "call-1", tutor_id: TUTOR, session_type: "consultation", status: "scheduled",
    scheduled_at: iso(first), duration_minutes: 45, created_at: iso(first - 3 * DAY),
    guest_email: "kid@example.com", guest_name: "Kid", guest_parent_email: null,
    guest_time_zone: "Australia/Adelaide", guest_token: "tok", reminder_minutes: [60], ics_sequence: 0,
  };
  db.tables.tutoring_sessions.push(call);
  const admin = fakeSupabase(db);
  const { resend, sent } = fakeResend();

  const s1 = await runAutomatedEmails(admin, resend, { now: new Date(first - 55 * MIN), steps: ["consultation reminders"] });
  assert.equal(s1.sent.consultation_reminder, 1);
  assert.equal(sent.length, 1);

  // What reschedule_consultation does: move it, bump the sequence, clear the claims.
  const second = first + DAY;
  Object.assign(db.tables.tutoring_sessions[0], { scheduled_at: iso(second), ics_sequence: 1 });
  db.tables.consultation_reminders_sent = [];

  const s2 = await runAutomatedEmails(admin, resend, { now: new Date(second - 55 * MIN), steps: ["consultation reminders"] });
  assert.equal(s2.sent.consultation_reminder, 1);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1].to, ["kid@example.com"]);
  assert.ok(sent[0].idempotencyKey && sent[1].idempotencyKey);
  assert.notEqual(sent[1].idempotencyKey, sent[0].idempotencyKey);
});

function completedDiagnostic(now: number) {
  return {
    id: "diag-1", token: "dtok", tutor_id: TUTOR, subjects: [{ name: "Chemistry" }], status: "completed",
    student_id: null, prospect_email: "kid@example.com", completed_at: iso(now - 25 * HOUR),
    booking_reminded_at: null, cancelled_at: null,
  };
}

test("book-your-call goes to a prospect who hasn't booked", async () => {
  const db = baseDb();
  const now = Date.parse("2027-03-10T00:00:00Z"); // 10:30 in Adelaide
  db.tables.diagnostic_assessments.push(completedDiagnostic(now));
  const { resend, sent } = fakeResend();
  const s = await runAutomatedEmails(fakeSupabase(db), resend, { now: new Date(now), steps: ["book your call"] });
  assert.equal(s.sent.book_your_call, 1);
  assert.deepEqual(sent[0].to, ["kid@example.com"]);
});

test("book-your-call isn't sent when a call is booked for that diagnostic under another email", async () => {
  const db = baseDb();
  const now = Date.parse("2027-03-10T00:00:00Z");
  db.tables.diagnostic_assessments.push(completedDiagnostic(now));
  db.tables.tutoring_sessions.push({
    id: "call-2", tutor_id: TUTOR, session_type: "consultation", status: "scheduled",
    scheduled_at: iso(now + 2 * DAY), diagnostic_id: "diag-1", guest_email: "parent@example.com",
  });
  const { resend, sent } = fakeResend();
  const s = await runAutomatedEmails(fakeSupabase(db), resend, { now: new Date(now), steps: ["book your call"] });
  assert.equal(s.sent.book_your_call, undefined);
  assert.equal(sent.length, 0);
});
