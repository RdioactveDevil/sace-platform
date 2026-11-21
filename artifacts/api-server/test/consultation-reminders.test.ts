import { test } from "node:test";
import assert from "node:assert/strict";
import { dueBookYourCall, dueConsultationReminders } from "../src/lib/consultation-reminders";

const MIN = 60_000;
const HOUR = 60 * MIN;
const start = Date.parse("2027-11-10T02:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const booked3DaysAhead = { scheduled_at: iso(start), created_at: iso(start - 72 * HOUR), reminder_minutes: [1440, 60] };
const all: Array<"guest" | "parent" | "tutor"> = ["guest", "parent", "tutor"];

test("nothing is due more than 24h before the call", () => {
  assert.deepEqual(dueConsultationReminders(booked3DaysAhead, new Set(), all, start - 25 * HOUR), []);
});

test("the 24h reminder is due for every recipient inside its window", () => {
  const due = dueConsultationReminders(booked3DaysAhead, new Set(), all, start - 23 * HOUR - 50 * MIN);
  assert.deepEqual(due, all.map((recipient) => ({ minutes: 1440, recipient })));
});

test("the 1h reminder is due 55 minutes before", () => {
  const due = dueConsultationReminders(booked3DaysAhead, new Set(["1440:guest", "1440:parent", "1440:tutor"]), all, start - 55 * MIN);
  assert.deepEqual(due.map((d) => d.minutes), [60, 60, 60]);
});

test("nothing is due once the call has started", () => {
  assert.deepEqual(dueConsultationReminders(booked3DaysAhead, new Set(), all, start), []);
  assert.deepEqual(dueConsultationReminders(booked3DaysAhead, new Set(), all, start + MIN), []);
});

test("a booking made after a reminder's time skips that reminder", () => {
  const late = { ...booked3DaysAhead, created_at: iso(start - 30 * MIN) };
  assert.deepEqual(dueConsultationReminders(late, new Set(), all, start - 20 * MIN), []);
  // Booked 3h ahead: the 24h one is skipped, the 1h one still goes.
  const threeHours = { ...booked3DaysAhead, created_at: iso(start - 3 * HOUR) };
  const due = dueConsultationReminders(threeHours, new Set(), ["guest"], start - 50 * MIN);
  assert.deepEqual(due, [{ minutes: 60, recipient: "guest" }]);
});

test("already-sent keys are excluded", () => {
  const due = dueConsultationReminders(booked3DaysAhead, new Set(["1440:guest", "1440:tutor"]), all, start - 23 * HOUR);
  assert.deepEqual(due, [{ minutes: 1440, recipient: "parent" }]);
});

const diag = {
  status: "completed",
  student_id: null as string | null,
  prospect_email: "p@example.com" as string | null,
  completed_at: iso(Date.parse("2027-11-01T00:00:00Z")),
  booking_reminded_at: null as string | null,
};
const doneAt = Date.parse(diag.completed_at);

test("book-your-call waits 24h after completion", () => {
  assert.equal(dueBookYourCall(diag, false, true, doneAt + 23 * HOUR), false);
  assert.equal(dueBookYourCall(diag, false, true, doneAt + 25 * HOUR), true);
});

test("book-your-call stops after 14 days", () => {
  assert.equal(dueBookYourCall(diag, false, true, doneAt + 15 * 24 * HOUR), false);
});

test("book-your-call is skipped when reminded, booked, hours-less, roster or incomplete", () => {
  const now = doneAt + 25 * HOUR;
  assert.equal(dueBookYourCall({ ...diag, booking_reminded_at: iso(now) }, false, true, now), false);
  assert.equal(dueBookYourCall(diag, true, true, now), false);
  assert.equal(dueBookYourCall(diag, false, false, now), false);
  assert.equal(dueBookYourCall({ ...diag, student_id: "s1" }, false, true, now), false);
  assert.equal(dueBookYourCall({ ...diag, prospect_email: null }, false, true, now), false);
  assert.equal(dueBookYourCall({ ...diag, status: "pending", completed_at: null }, false, true, now), false);
});
