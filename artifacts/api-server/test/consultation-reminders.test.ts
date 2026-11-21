import { test } from "node:test";
import assert from "node:assert/strict";
import { dueBookYourCall, dueConsultationReminders } from "../src/lib/consultation-reminders";

const MIN = 60_000;
const HOUR = 60 * MIN;
const start = Date.parse("2027-11-10T02:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const booked3DaysAhead = { scheduled_at: iso(start), created_at: iso(start - 72 * HOUR), reminder_minutes: [1440, 60] };
const all: Array<"guest" | "parent" | "tutor"> = ["guest", "parent", "tutor"];

const none = { send: [], skip: [] };
const key = (r: Array<{ minutes: number; recipient: string }>) => r.map((x) => `${x.minutes}:${x.recipient}`);

test("nothing is due more than 24h before the call", () => {
  assert.deepEqual(dueConsultationReminders(booked3DaysAhead, new Set(), all, start - 25 * HOUR), none);
});

test("the 24h reminder is sent to every recipient inside its window", () => {
  const plan = dueConsultationReminders(booked3DaysAhead, new Set(), all, start - 23 * HOUR - 50 * MIN);
  assert.deepEqual(plan, { send: all.map((recipient) => ({ minutes: 1440, recipient })), skip: [] });
});

test("an hour out with nothing sent: send 60, skip the stale 1440", () => {
  const plan = dueConsultationReminders(booked3DaysAhead, new Set(), ["guest"], start - 55 * MIN);
  assert.deepEqual(plan, { send: [{ minutes: 60, recipient: "guest" }], skip: [{ minutes: 1440, recipient: "guest" }] });
});

test("the 1h reminder is sent 55 minutes before once 1440 is done", () => {
  const plan = dueConsultationReminders(booked3DaysAhead, new Set(["1440:guest", "1440:parent", "1440:tutor"]), all, start - 55 * MIN);
  assert.deepEqual(key(plan.send), ["60:guest", "60:parent", "60:tutor"]);
  assert.deepEqual(plan.skip, []);
});

test("nothing happens once the call has started", () => {
  assert.deepEqual(dueConsultationReminders(booked3DaysAhead, new Set(), all, start), none);
  assert.deepEqual(dueConsultationReminders(booked3DaysAhead, new Set(), all, start + MIN), none);
});

test("moved to 2h from now with no claims: skip the stale 1440, 60 isn't due yet", () => {
  const plan = dueConsultationReminders(booked3DaysAhead, new Set(), ["guest"], start - 2 * HOUR);
  assert.deepEqual(plan, { send: [], skip: [{ minutes: 1440, recipient: "guest" }] });
});

test("after such a move, 60 is sent 59 minutes out", () => {
  const plan = dueConsultationReminders(booked3DaysAhead, new Set(["1440:guest"]), ["guest"], start - 59 * MIN);
  assert.deepEqual(plan, { send: [{ minutes: 60, recipient: "guest" }], skip: [] });
});

test("a booking made after a reminder's time skips that reminder", () => {
  const late = { ...booked3DaysAhead, created_at: iso(start - 30 * MIN) };
  assert.deepEqual(dueConsultationReminders(late, new Set(), ["guest"], start - 20 * MIN).send, []);
  // Booked 3h ahead: the 24h one is skipped, the 1h one still goes.
  const threeHours = { ...booked3DaysAhead, created_at: iso(start - 3 * HOUR) };
  const plan = dueConsultationReminders(threeHours, new Set(), ["guest"], start - 50 * MIN);
  assert.deepEqual(plan, { send: [{ minutes: 60, recipient: "guest" }], skip: [{ minutes: 1440, recipient: "guest" }] });
});

test("already-sent keys are excluded", () => {
  const plan = dueConsultationReminders(booked3DaysAhead, new Set(["1440:guest", "1440:tutor"]), all, start - 23 * HOUR - 50 * MIN);
  assert.deepEqual(plan, { send: [{ minutes: 1440, recipient: "parent" }], skip: [] });
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
