import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canResend,
  diagnosticStatus,
  dueForProspectReminder,
  normaliseProspectEmail,
  unavailableReason,
  type ProspectRow,
} from "../src/lib/prospect-status";

const SENT = "2026-11-01T00:00:00.000Z";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const after = (ms: number) => new Date(Date.parse(SENT) + ms);

const row = (o: Partial<ProspectRow> = {}): ProspectRow => ({
  status: "pending",
  student_id: null,
  prospect_email: "sam@example.com",
  created_at: SENT,
  sent_at: SENT,
  opened_at: null,
  started_at: null,
  reminded_at: null,
  cancelled_at: null,
  ...o,
});

test("finished beats everything else", () => {
  assert.equal(diagnosticStatus(row({ status: "completed", cancelled_at: SENT }), after(40 * DAY)), "finished");
});

test("cancelled, then expired 30 days after sending", () => {
  assert.equal(diagnosticStatus(row({ cancelled_at: SENT }), after(DAY)), "cancelled");
  assert.equal(diagnosticStatus(row(), after(31 * DAY)), "expired");
  assert.equal(diagnosticStatus(row(), after(29 * DAY)), "sent");
});

test("expiry runs from sent_at, else created_at; roster diagnostics never expire", () => {
  const resent = new Date(Date.parse(SENT) + 20 * DAY).toISOString();
  assert.equal(diagnosticStatus(row({ sent_at: resent }), after(31 * DAY)), "sent");
  assert.equal(diagnosticStatus(row({ prospect_email: null, sent_at: null }), after(31 * DAY)), "expired");
  assert.equal(diagnosticStatus(row({ student_id: "s1", prospect_email: null, sent_at: null }), after(90 * DAY)), "link");
});

test("in progress, opened, sent, link", () => {
  assert.equal(diagnosticStatus(row({ opened_at: SENT, started_at: SENT }), after(DAY)), "in_progress");
  assert.equal(diagnosticStatus(row({ opened_at: SENT }), after(DAY)), "opened");
  assert.equal(diagnosticStatus(row(), after(DAY)), "sent");
  assert.equal(diagnosticStatus(row({ prospect_email: null, sent_at: null }), after(DAY)), "link");
});

test("the test page explains a cancelled or expired link", () => {
  assert.equal(unavailableReason(row({ cancelled_at: SENT }), after(DAY)), "This diagnostic was cancelled.");
  assert.equal(unavailableReason(row(), after(31 * DAY)), "This link has expired. Ask the person who sent it for a new one.");
  assert.equal(unavailableReason(row(), after(DAY)), null);
  assert.equal(unavailableReason(row({ status: "completed" }), after(31 * DAY)), null);
});

test("resend: sent, opened, in progress or expired, with an email", () => {
  assert.equal(canResend(row(), after(DAY)), true);
  assert.equal(canResend(row({ opened_at: SENT }), after(DAY)), true);
  assert.equal(canResend(row({ started_at: SENT }), after(DAY)), true);
  assert.equal(canResend(row(), after(31 * DAY)), true);
  assert.equal(canResend(row({ status: "completed" }), after(DAY)), false);
  assert.equal(canResend(row({ cancelled_at: SENT }), after(DAY)), false);
  assert.equal(canResend(row({ prospect_email: null, sent_at: null }), after(DAY)), false);
});

test("one reminder two days after sending, if not started", () => {
  const due = after(2 * DAY + 60_000);
  assert.equal(dueForProspectReminder(row(), due), true);
  assert.equal(dueForProspectReminder(row(), after(47 * HOUR)), false);
  assert.equal(dueForProspectReminder(row({ reminded_at: SENT }), due), false);
  assert.equal(dueForProspectReminder(row({ started_at: SENT }), due), false);
  assert.equal(dueForProspectReminder(row({ cancelled_at: SENT }), due), false);
  assert.equal(dueForProspectReminder(row(), after(31 * DAY)), false);
  assert.equal(dueForProspectReminder(row({ prospect_email: null }), due), false);
  assert.equal(dueForProspectReminder(row({ student_id: "s1" }), due), false);
});

test("a prospect's email is optional, checked, trimmed and lower-cased", () => {
  assert.deepEqual(normaliseProspectEmail(""), { email: null });
  assert.deepEqual(normaliseProspectEmail("  "), { email: null });
  assert.deepEqual(normaliseProspectEmail(undefined), { email: null });
  assert.deepEqual(normaliseProspectEmail("Sam@Example.COM "), { email: "sam@example.com" });
  assert.deepEqual(normaliseProspectEmail("not-an-email"), { error: "Enter a valid email address." });
  assert.deepEqual(normaliseProspectEmail(`${"a".repeat(250)}@x.co`), { error: "Enter a valid email address." });
  assert.deepEqual(normaliseProspectEmail(42), { error: "Enter a valid email address." });
});
