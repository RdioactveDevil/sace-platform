import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDetails, parseSettings, validDob } from "../src/lib/admin-people.ts";

const now = new Date("2026-11-15T00:00:00Z");

test("an admin's changes to someone's details are checked", () => {
  assert.deepEqual(parseDetails({ displayName: "  Sam   Lee ", yearLevel: "11", state: "SA", school: " Glenunga ", dob: "2009-03-01" }, now), {
    updates: { display_name: "Sam Lee", year_level: 11, state: "SA", school: "Glenunga", dob: "2009-03-01" },
  });
  assert.deepEqual(parseDetails({ email: " Sam@Example.COM " }, now), { updates: {}, email: "sam@example.com" });
  assert.deepEqual(parseDetails({ yearLevel: "", state: null, school: "", dob: "" }, now), {
    updates: { year_level: null, state: null, school: null, dob: null },
  });
});

test("bad details are refused", () => {
  const err = (b: unknown) => (parseDetails(b, now) as { error: string }).error;
  assert.match(err({ displayName: "  " }), /name/);
  assert.match(err({ email: "nope" }), /email/);
  assert.match(err({ yearLevel: 13 }), /6 to 12/);
  assert.match(err({ state: "XX" }), /state/);
  assert.match(err({ dob: "2030-01-01" }), /date of birth/);
  assert.match(err({ dob: "2009-02-30" }), /date of birth/);
  assert.match(err({}), /Nothing/);
});

test("birthdays", () => {
  assert.equal(validDob("2012-06-15", now), true);
  assert.equal(validDob("2024-01-01", now), false); // two years old
  assert.equal(validDob("15/06/2012", now), false);
});

test("their settings", () => {
  assert.deepEqual(parseSettings({ reminders: false, sounds: true, leaderboard: false }, now), {
    emails_unsubscribed_at: now.toISOString(), sounds_enabled: true, hide_from_leaderboard: true,
  });
  assert.deepEqual(parseSettings({ reminders: true }, now), { emails_unsubscribed_at: null });
  assert.match((parseSettings({ reminders: "yes" }, now) as { error: string }).error, /Nothing/);
});
