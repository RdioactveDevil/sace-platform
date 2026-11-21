import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TUTOR_TIME_ZONES, bookingError, checkReminders, checkSettingsInput, guestIdentity, guestJoinAllowed, guestTimeZone, newGuestToken,
  openSessionAllowed, parseStart, publicSettings, removedReminders, settingsFromRow, shouldMarkActive, startIsOffered, type SettingsRow,
} from "../src/lib/consultation-access.ts";

const MIN = 60_000;

test("a consultation with no participants is never open to anyone", () => {
  assert.equal(openSessionAllowed("consultation", 0), false);
});

test("an individual lesson with no participants stays open, as before", () => {
  assert.equal(openSessionAllowed("individual", 0), true);
});

test("a session with participants isn't open", () => {
  assert.equal(openSessionAllowed("group", 2), false);
  assert.equal(openSessionAllowed("individual", 1), false);
});

const start = Date.parse("2026-12-01T05:00:00Z");
const call = { status: "scheduled", scheduled_at: new Date(start).toISOString(), duration_minutes: 45 };

test("the guest can join from 10 minutes before the start", () => {
  assert.equal(guestJoinAllowed(call, start - 11 * MIN), false);
  assert.equal(guestJoinAllowed(call, start - 10 * MIN), true);
  assert.equal(guestJoinAllowed(call, start - 9 * MIN), true);
  assert.equal(guestJoinAllowed(call, start), true);
});

test("the guest can join until 2 hours after the start", () => {
  assert.equal(guestJoinAllowed(call, start + 120 * MIN), true);
  assert.equal(guestJoinAllowed(call, start + 121 * MIN), false);
});

test("an active call can be joined in the window", () => {
  assert.equal(guestJoinAllowed({ ...call, status: "active" }, start + 5 * MIN), true);
});

test("a cancelled or completed call can't be joined", () => {
  assert.equal(guestJoinAllowed({ ...call, status: "cancelled" }, start), false);
  assert.equal(guestJoinAllowed({ ...call, status: "completed" }, start), false);
});

test("an unreadable start time can't be joined", () => {
  assert.equal(guestJoinAllowed({ ...call, scheduled_at: "not a date" }, start), false);
});

test("guest tokens are 32 random bytes, url-safe, and differ", () => {
  const a = newGuestToken();
  const b = newGuestToken();
  assert.equal(a.length, 43);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
});

// ── Settings, inputs and errors ──────────────────────────────────────────────

const row = (over: Partial<SettingsRow> = {}): SettingsRow => ({
  tutor_id: "t1",
  time_zone: "Australia/Adelaide",
  weekly_hours: { mon: [["09:00", "12:00"]] },
  call_minutes: 45,
  gap_minutes: 15,
  min_notice_hours: 12,
  max_days_ahead: 14,
  reminder_minutes: [1440, 60],
  busy_ical_url: null,
  busy_ical_checked_at: null,
  busy_ical_error: null,
  invite_email: null,
  ...over,
});

test("the seven Australian zones are the only tutor zones", () => {
  assert.deepEqual([...TUTOR_TIME_ZONES].sort(), [
    "Australia/Adelaide", "Australia/Brisbane", "Australia/Darwin", "Australia/Hobart",
    "Australia/Melbourne", "Australia/Perth", "Australia/Sydney",
  ]);
});

test("a guest's browser zone is kept when real, else the tutor's", () => {
  assert.equal(guestTimeZone("Europe/London", "Australia/Adelaide"), "Europe/London");
  assert.equal(guestTimeZone("Not/AZone", "Australia/Adelaide"), "Australia/Adelaide");
  assert.equal(guestTimeZone(42, "Australia/Perth"), "Australia/Perth");
  assert.equal(guestTimeZone("", "Australia/Perth"), "Australia/Perth");
  assert.equal(guestTimeZone("x".repeat(200), "Australia/Perth"), "Australia/Perth");
});

test("reminders: 1 to 5 whole minutes, each 5 to 10080, deduped and largest first", () => {
  assert.deepEqual(checkReminders([60, 1440, 60]), { reminders: [1440, 60] });
  assert.ok("error" in checkReminders([]));
  assert.ok("error" in checkReminders([1, 2, 3, 4, 5, 6].map((n) => n * 10)));
  assert.ok("error" in checkReminders([4]));
  assert.ok("error" in checkReminders([10081]));
  assert.ok("error" in checkReminders([60.5]));
  assert.ok("error" in checkReminders("60"));
});

test("no settings row means the defaults, with no hours", () => {
  const s = settingsFromRow(null);
  assert.equal(s.timeZone, "Australia/Adelaide");
  assert.equal(s.callMinutes, 45);
  assert.equal(s.gapMinutes, 15);
  assert.deepEqual(s.weeklyHours, {});
  assert.deepEqual(s.reminderMinutes, [1440, 60]);
});

test("a stored zone that isn't a tutor zone falls back to Adelaide", () => {
  assert.equal(settingsFromRow(row({ time_zone: "Nope/Nope" })).timeZone, "Australia/Adelaide");
});

test("settings shown to the tutor never include the calendar address", () => {
  const url = "https://calendar.google.com/calendar/ical/secret/basic.ics";
  const shown = publicSettings(row({ busy_ical_url: url, busy_ical_checked_at: "2026-11-20T00:00:00Z" }), "tutor@example.com");
  assert.equal(shown.hasCalendar, true);
  assert.equal(shown.calendarCheckedAt, "2026-11-20T00:00:00Z");
  assert.equal(shown.defaultInviteEmail, "tutor@example.com");
  assert.equal(JSON.stringify(shown).includes("secret"), false);
  assert.equal(publicSettings(row(), "t@example.com").hasCalendar, false);
});

test("settings input: ranges are checked", () => {
  const cur = row();
  assert.ok("error" in checkSettingsInput({ callMinutes: 14 }, cur));
  assert.ok("error" in checkSettingsInput({ callMinutes: 181 }, cur));
  assert.ok("error" in checkSettingsInput({ gapMinutes: -1 }, cur));
  assert.ok("error" in checkSettingsInput({ gapMinutes: 121 }, cur));
  assert.ok("error" in checkSettingsInput({ minNoticeHours: 169 }, cur));
  assert.ok("error" in checkSettingsInput({ maxDaysAhead: 0 }, cur));
  assert.ok("error" in checkSettingsInput({ maxDaysAhead: 91 }, cur));
  assert.ok("error" in checkSettingsInput({ callMinutes: "45" }, cur));
  assert.ok("error" in checkSettingsInput({ timeZone: "Europe/London" }, cur));
  assert.ok("error" in checkSettingsInput({ reminderMinutes: [] }, cur));
  assert.ok("error" in checkSettingsInput({ inviteEmail: "not an email" }, cur));
  assert.ok("error" in checkSettingsInput({ busyIcalUrl: "http://example.com/a.ics" }, cur));
  assert.ok("error" in checkSettingsInput(null, cur));
});

test("settings input: weekly hours are checked against the call length that will apply", () => {
  const cur = row({ weekly_hours: { mon: [["09:00", "10:00"]] } });
  assert.ok("error" in checkSettingsInput({ callMinutes: 90 }, cur));
  assert.ok("error" in checkSettingsInput({ weeklyHours: { mon: [["09:00", "09:30"]] } }, cur));
  const ok = checkSettingsInput({ weeklyHours: { tue: [["15:00", "18:00"]] }, callMinutes: 60 }, cur);
  assert.ok("update" in ok);
  assert.deepEqual(ok.update.weekly_hours, { tue: [["15:00", "18:00"]] });
  assert.equal(ok.update.call_minutes, 60);
});

test("settings input: omitted fields keep their values; the calendar address is kept, set or cleared", () => {
  const url = "https://calendar.google.com/calendar/ical/x/basic.ics";
  const cur = row({ busy_ical_url: url, busy_ical_checked_at: "2026-11-20T00:00:00Z", busy_ical_error: null });
  const keep = checkSettingsInput({ gapMinutes: 0 }, cur);
  assert.ok("update" in keep);
  assert.equal(keep.update.gap_minutes, 0);
  assert.equal(keep.update.call_minutes, 45);
  assert.equal("busy_ical_url" in keep.update, false);

  const cleared = checkSettingsInput({ busyIcalUrl: null }, cur);
  assert.ok("update" in cleared);
  assert.equal(cleared.update.busy_ical_url, null);
  assert.equal(cleared.update.busy_ical_checked_at, null);
  assert.equal(cleared.update.busy_ical_error, null);

  const other = "https://calendar.google.com/calendar/ical/y/basic.ics";
  const changed = checkSettingsInput({ busyIcalUrl: other }, cur);
  assert.ok("update" in changed);
  assert.equal(changed.update.busy_ical_url, other);
  assert.equal(changed.update.busy_ical_checked_at, null);

  const same = checkSettingsInput({ busyIcalUrl: url }, cur);
  assert.ok("update" in same);
  assert.equal("busy_ical_checked_at" in same.update, false);
});

test("settings input: invite email is normalised; empty or null goes back to the sign-in email", () => {
  const set = checkSettingsInput({ inviteEmail: " Me@Gmail.com " }, row());
  assert.ok("update" in set);
  assert.equal(set.update.invite_email, "me@gmail.com");
  const cleared = checkSettingsInput({ inviteEmail: "" }, row({ invite_email: "a@b.co" }));
  assert.ok("update" in cleared);
  assert.equal(cleared.update.invite_email, null);
});

test("booking errors: slot_taken and unique violations are told apart", () => {
  assert.equal(bookingError({ message: "slot_taken", code: "P0001" }), "slot_taken");
  assert.equal(bookingError({ message: "duplicate key value violates unique constraint", code: "23505" }), "duplicate");
  assert.equal(bookingError({ message: "boom", code: "XX000" }), null);
  assert.equal(bookingError(null), null);
});

test("start times: ISO strings only", () => {
  assert.equal(parseStart("2026-12-01T05:00:00.000Z"), Date.parse("2026-12-01T05:00:00.000Z"));
  assert.equal(parseStart("2026-12-01T15:30:00+10:30"), Date.parse("2026-12-01T05:00:00.000Z"));
  assert.equal(parseStart("tomorrow"), null);
  assert.equal(parseStart(1764565200000), null);
  assert.equal(parseStart(""), null);
});

test("a start is offered only if it is one of the open slots", () => {
  const slots = ["2026-12-01T05:00:00.000Z", "2026-12-01T06:00:00.000Z"];
  assert.equal(startIsOffered(Date.parse("2026-12-01T15:30:00+10:30"), slots), true);
  assert.equal(startIsOffered(Date.parse("2026-12-01T05:30:00Z"), slots), false);
});

test("reminders removed from a booking", () => {
  assert.deepEqual(removedReminders([1440, 60], [60, 30]), [1440]);
  assert.deepEqual(removedReminders(null, [60]), []);
});

test("each guest join gets its own identity, so a student and parent can both be in the call", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const a = guestIdentity(id);
  const b = guestIdentity(id);
  assert.notEqual(a, b);
  for (const x of [a, b]) assert.match(x, /^guest-11111111-2222-3333-4444-555555555555-[A-Za-z0-9_-]{8}$/);
});

test("a lesson is marked active whenever someone opens it, as before", () => {
  const at = "2026-12-01T05:00:00.000Z";
  assert.equal(shouldMarkActive("individual", at, 60, Date.parse(at) - 3 * 86_400_000), true);
  assert.equal(shouldMarkActive("group", at, 60, Date.parse(at)), true);
});

test("a consultation is marked active only from 10 minutes before its start", () => {
  const at = "2026-12-01T05:00:00.000Z";
  const start = Date.parse(at);
  assert.equal(shouldMarkActive("consultation", at, 45, start - 30 * MIN), false);
  assert.equal(shouldMarkActive("consultation", at, 45, start - 11 * MIN), false);
  assert.equal(shouldMarkActive("consultation", at, 45, start - 5 * MIN), true);
  assert.equal(shouldMarkActive("consultation", at, 45, start + 3 * 60 * MIN), true);
  assert.equal(shouldMarkActive("consultation", "not a date", 45, start), false);
});
