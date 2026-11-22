import { test } from "node:test";
import assert from "node:assert/strict";
import { newConsultationInput, testInput } from "../src/lib/new-consultation";
import {
  canResend,
  diagnosticStatus,
  dueForProspectReminder,
  type ProspectRow,
} from "../src/lib/prospect-status";

const NOW = Date.parse("2026-12-01T00:00:00.000Z");
const START = "2026-12-03T05:00:00.000Z";

const TEST = {
  yearLevel: "Year 11",
  subjects: [{ name: "Chemistry", topics: ["Stoichiometry"] }],
  questions: [
    { id: 1, question: "Q1", type: "multiple_choice", options: ["A. 1", "B. 2", "C. 3", "D. 4"], correct_answer: "B", marks: 2, difficulty: "easy", topic: "Stoichiometry" },
    { id: 2, question: "Q2", type: "short_answer", correct_answer: "x", marks: 3, difficulty: "moderate", topic: "Stoichiometry" },
  ],
};

const body = (o: Record<string, unknown> = {}) => ({
  studentName: "Sam Lee",
  studentEmail: "sam@example.com",
  sendToStudent: true,
  parentEmail: "parent@example.com",
  sendToParent: false,
  start: START,
  ...o,
});

const ok = (r: ReturnType<typeof newConsultationInput>) => {
  if ("error" in r) throw new Error(`expected ok, got: ${r.error}`);
  return r.ok;
};

test("someone has to be ticked", () => {
  const r = newConsultationInput(body({ sendToStudent: false, sendToParent: false }), NOW);
  assert.ok("error" in r);
});

test("a ticked recipient needs a valid email", () => {
  assert.ok("error" in newConsultationInput(body({ studentEmail: "" }), NOW));
  assert.ok("error" in newConsultationInput(body({ studentEmail: "not-an-email" }), NOW));
  assert.ok("error" in newConsultationInput(body({ sendToStudent: false, sendToParent: true, parentEmail: undefined }), NOW));
  assert.ok("error" in newConsultationInput(body({ sendToParent: true, parentEmail: "nope" }), NOW));
});

test("the student's name is required", () => {
  assert.ok("error" in newConsultationInput(body({ studentName: "  " }), NOW));
  assert.ok("error" in newConsultationInput(body({ studentName: undefined }), NOW));
  assert.equal(ok(newConsultationInput(body({ studentName: "  Sam Lee " }), NOW)).studentName, "Sam Lee");
});

test("parent only: the parent is the primary recipient, with no copy", () => {
  const r = ok(newConsultationInput(body({ sendToStudent: false, sendToParent: true, parentEmail: " Parent@Example.com " }), NOW));
  assert.deepEqual(r.primary, { email: "parent@example.com", isParent: true });
  assert.equal(r.parentCopy, null);
});

test("both ticked: the student is primary and the parent gets the copy", () => {
  const r = ok(newConsultationInput(body({ sendToParent: true }), NOW));
  assert.deepEqual(r.primary, { email: "sam@example.com", isParent: false });
  assert.equal(r.parentCopy, "parent@example.com");
});

test("both ticked with the same address: one email, to the student", () => {
  const r = ok(newConsultationInput(body({ sendToParent: true, parentEmail: "SAM@example.com" }), NOW));
  assert.equal(r.parentCopy, null);
});

test("student only: a typed parent email is not used", () => {
  const r = ok(newConsultationInput(body(), NOW));
  assert.deepEqual(r.primary, { email: "sam@example.com", isParent: false });
  assert.equal(r.parentCopy, null);
});

test("a typed but unticked student email is dropped (even an invalid one)", () => {
  const r = ok(newConsultationInput(body({ sendToStudent: false, sendToParent: true, studentEmail: "garbage" }), NOW));
  assert.equal(r.primary.email, "parent@example.com");
  assert.equal(JSON.stringify(r).includes("garbage"), false);
});

test("the start must be a valid time in the future", () => {
  assert.ok("error" in newConsultationInput(body({ start: "tomorrow" }), NOW));
  assert.ok("error" in newConsultationInput(body({ start: undefined }), NOW));
  assert.ok("error" in newConsultationInput(body({ start: "2026-11-30T05:00:00.000Z" }), NOW));
  assert.equal(ok(newConsultationInput(body(), NOW)).start, Date.parse(START));
});

test("reminders: left out uses the tutor's defaults; given ones are checked", () => {
  assert.equal(ok(newConsultationInput(body(), NOW)).reminderMinutes, undefined);
  assert.deepEqual(ok(newConsultationInput(body({ reminderMinutes: [60, 1440] }), NOW)).reminderMinutes, [1440, 60]);
  assert.ok("error" in newConsultationInput(body({ reminderMinutes: "soon" }), NOW));
});

test("test: none, or a valid one with its total marks", () => {
  assert.equal(ok(newConsultationInput(body(), NOW)).test, null);
  assert.equal(ok(newConsultationInput(body({ test: null }), NOW)).test, null);
  const t = ok(newConsultationInput(body({ test: TEST }), NOW)).test!;
  assert.equal(t.yearLevel, "Year 11");
  assert.equal(t.subjects[0].name, "Chemistry");
  assert.equal(t.questions.length, 2);
  assert.equal(t.scoreMax, 5);
});

test("test: an invalid shape is refused", () => {
  for (const bad of [
    "a test",
    { ...TEST, yearLevel: " " },
    { ...TEST, questions: [] },
    { ...TEST, questions: "x" },
    { ...TEST, questions: [null] },
    { ...TEST, questions: [{ ...TEST.questions[0], marks: "two" }] },
    { ...TEST, subjects: [] },
    { ...TEST, subjects: "Chemistry" },
  ]) {
    assert.ok("error" in newConsultationInput(body({ test: bad }), NOW), JSON.stringify(bad));
  }
});

test("testInput keeps the Diagnostic tab's messages", () => {
  assert.deepEqual(testInput({ ...TEST, yearLevel: "" }), { error: "yearLevel is required" });
  assert.deepEqual(testInput({ ...TEST, questions: [] }), { error: "questions are required" });
});

test("questionnaire: default, none, or a valid tailored copy", () => {
  assert.equal(ok(newConsultationInput(body(), NOW)).questionnaire, "default");
  assert.equal(ok(newConsultationInput(body({ questionnaire: "default" }), NOW)).questionnaire, "default");
  assert.equal(ok(newConsultationInput(body({ questionnaire: null }), NOW)).questionnaire, null);
  const tailored = { intro: "Hi", items: [{ id: "a", type: "short", label: "School?" }] };
  const q = ok(newConsultationInput(body({ questionnaire: tailored }), NOW)).questionnaire;
  assert.ok(q && q !== "default");
  assert.equal(q.items[0].label, "School?");
  assert.ok("error" in newConsultationInput(body({ questionnaire: { intro: "Hi", items: "x" } }), NOW));
  assert.ok("error" in newConsultationInput(body({ questionnaire: "mine" }), NOW));
});

// ── No-test records ─────────────────────────────────────────────────────────

const SENT = "2026-11-01T00:00:00.000Z";
const DAY = 86_400_000;
const after = (ms: number) => new Date(Date.parse(SENT) + ms);
const row = (o: Partial<ProspectRow> = {}): ProspectRow => ({
  status: "pending", student_id: null, prospect_email: "parent@example.com", created_at: SENT, sent_at: null,
  opened_at: null, started_at: null, reminded_at: null, cancelled_at: null, has_test: false, ...o,
});

test("a record without a test shows as no_test (finished and cancelled still win)", () => {
  assert.equal(diagnosticStatus(row(), after(DAY)), "no_test");
  assert.equal(diagnosticStatus(row({ sent_at: SENT }), after(40 * DAY)), "no_test");
  assert.equal(diagnosticStatus(row({ cancelled_at: SENT }), after(DAY)), "cancelled");
  assert.equal(diagnosticStatus(row({ status: "completed" }), after(DAY)), "finished");
  // Rows from before the flag (or with a test) are unchanged.
  assert.equal(diagnosticStatus(row({ has_test: undefined, sent_at: SENT }), after(DAY)), "sent");
  assert.equal(diagnosticStatus(row({ has_test: true, sent_at: SENT }), after(DAY)), "sent");
});

test("a record without a test can't be resent or reminded", () => {
  assert.equal(canResend(row(), after(DAY)), false);
  assert.equal(dueForProspectReminder(row({ sent_at: SENT }), after(3 * DAY)), false);
  assert.equal(dueForProspectReminder(row({ sent_at: SENT, has_test: true }), after(3 * DAY)), true);
});
