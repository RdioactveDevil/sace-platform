import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canResend,
  diagnosticStatus,
  doneRecipients,
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

test("a prospect's result goes only to the tutor who sent it", () => {
  assert.deepEqual(doneRecipients("t1", null, ["t2", "t3"]), ["t1"]);
  assert.deepEqual(doneRecipients("t1", null, undefined), ["t1"]);
});

test("a roster student's result goes to the setter and their other tutors, once each", () => {
  assert.deepEqual(doneRecipients("t1", "s1", ["t2", "t1", "t3"]), ["t1", "t2", "t3"]);
  assert.deepEqual(doneRecipients("t1", "s1", undefined), ["t1"]);
});

import { readFileSync } from "node:fs";
import { DIAGNOSTIC_LIST_COLUMNS, forViewer } from "../src/lib/prospect-status";

// Fields on the list row that are worked out, not selected.
const DERIVED = ["booking", "signup", "questionnaire_status", "red_flags", "set_by", "link", "status_label", "can_resend", "can_cancel"];

test("the diagnostics list selects every column the client reads from a row", () => {
  const fixture = JSON.parse(readFileSync(new URL("../../gradefarm/src/lib/fixtures/diagnosticListRow.json", import.meta.url), "utf8"));
  const selected = DIAGNOSTIC_LIST_COLUMNS.split(",").map((c) => c.trim());
  for (const key of Object.keys(fixture).filter((k) => !DERIVED.includes(k))) assert.ok(selected.includes(key), `list does not select ${key}`);
  for (const key of ["curriculum_id", "prospect_email", "parent_email", "student_name", "submitted_by_name", "status", "student_id"]) {
    assert.ok(selected.includes(key), key);
  }
});

test("another tutor sees a prospect diagnostic without the private prospect data", () => {
  const full = {
    id: "d", tutor_id: "setter", prospect_email: "a@example.com", parent_email: "p@example.com",
    questionnaire: { q: 1 }, questionnaire_answers: { q: "x" }, questionnaire_submitted_at: "t", questionnaire_reminded_at: "t",
    questionnaire_status: "submitted", red_flags: 2, score_total: 5,
  };
  const other = forViewer(full, "other") as Record<string, unknown>;
  for (const k of ["questionnaire", "questionnaire_answers", "questionnaire_submitted_at", "questionnaire_reminded_at", "prospect_email", "parent_email", "questionnaire_status", "red_flags"]) {
    assert.equal(other[k] ?? null, null, k);
  }
  assert.equal(other.score_total, 5);
  assert.deepEqual(forViewer(full, "setter"), full);
});

test("a timed completed row with no score yet is marking; after 3 attempts it is marking_failed", () => {
  const timed = { status: "completed" as const, time_limit_minutes: 50, score_total: null };
  assert.equal(diagnosticStatus(row({ ...timed, marking_attempts: 0 }), after(DAY)), "marking");
  assert.equal(diagnosticStatus(row({ ...timed, marking_attempts: 2 }), after(DAY)), "marking");
  assert.equal(diagnosticStatus(row({ ...timed, marking_attempts: 3 }), after(DAY)), "marking_failed");
});

test("completed rows with a score, or not timed, stay finished", () => {
  assert.equal(diagnosticStatus(row({ status: "completed", time_limit_minutes: 50, score_total: 31 }), after(DAY)), "finished");
  assert.equal(diagnosticStatus(row({ status: "completed", time_limit_minutes: null, score_total: null }), after(DAY)), "finished");
  assert.equal(diagnosticStatus(row({ status: "completed", score_total: null }), after(DAY)), "finished");
});

test("marking rows can't be resent", () => {
  const timed = { status: "completed" as const, time_limit_minutes: 50, score_total: null };
  assert.equal(canResend(row({ ...timed, marking_attempts: 0 }), after(DAY)), false);
  assert.equal(canResend(row({ ...timed, marking_attempts: 3 }), after(DAY)), false);
});
