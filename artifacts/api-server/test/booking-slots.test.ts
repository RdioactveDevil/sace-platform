import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BOOKING,
  openSlots,
  validateWeeklyHours,
  zonedToUtc,
  type BookingSettings,
} from "../src/lib/booking-slots";

const TZ = "Australia/Adelaide";
const MIN = 60_000;
const HOUR = 60 * MIN;
// Mon 2027-03-01 00:00Z = Mon 10:30 Adelaide (ACDT)
const NOW = Date.parse("2027-03-01T00:00:00Z");

function settings(over: Partial<BookingSettings> = {}): BookingSettings {
  return {
    ...DEFAULT_BOOKING,
    timeZone: TZ,
    weeklyHours: { mon: [["09:00", "12:00"]] },
    ...over,
  };
}
const at = (ymd: string, hhmm: string) => zonedToUtc(ymd, hhmm, TZ);
const iso = (ms: number) => new Date(ms).toISOString();
// slots on a given Adelaide-local Monday
function onDay(slots: string[], ymd: string): string[] {
  const lo = at(ymd, "00:00");
  const hi = at(ymd, "23:59");
  return slots.filter((s) => Date.parse(s) >= lo && Date.parse(s) <= hi);
}

test("Mon 09-12 with 45+15 gives 09:00, 10:00, 11:00", () => {
  const s = openSlots({ settings: settings(), now: NOW, busy: [], existing: [] });
  assert.deepEqual(onDay(s, "2027-03-08"), [
    iso(at("2027-03-08", "09:00")),
    iso(at("2027-03-08", "10:00")),
    iso(at("2027-03-08", "11:00")),
  ]);
  assert.deepEqual([...s].sort(), s);
});

test("block 09:00-10:30 gives only 09:00", () => {
  const s = openSlots({
    settings: settings({ weeklyHours: { mon: [["09:00", "10:30"]] } }),
    now: NOW, busy: [], existing: [],
  });
  assert.deepEqual(onDay(s, "2027-03-08"), [iso(at("2027-03-08", "09:00"))]);
});

test("min notice and max days ahead", () => {
  // now = Mon 10:30 local; +12h = 22:30 local: today's slots are all dropped
  const s = openSlots({ settings: settings(), now: NOW, busy: [], existing: [] });
  assert.deepEqual(onDay(s, "2027-03-01"), []);
  const limit = NOW + 14 * 24 * HOUR;
  for (const x of s) assert.ok(Date.parse(x) <= limit);
  // Mon 2027-03-15 09:00 local is before now+14d (10:30 local), kept; 11:00 is after, dropped
  assert.deepEqual(onDay(s, "2027-03-15"), [
    iso(at("2027-03-15", "09:00")),
    iso(at("2027-03-15", "10:00")),
  ]);
  const s2 = openSlots({ settings: settings({ minNoticeHours: 200 }), now: NOW, busy: [], existing: [] });
  for (const x of s2) assert.ok(Date.parse(x) >= NOW + 200 * HOUR);
});

test("busy blocks as-is; existing sessions get the gap", () => {
  const d = "2027-03-08";
  const busy = [{ start: at(d, "10:20"), end: at(d, "10:40") }];
  const s1 = onDay(openSlots({ settings: settings(), now: NOW, busy, existing: [] }), d);
  assert.deepEqual(s1, [iso(at(d, "09:00")), iso(at(d, "11:00"))]);
  const existing = [{ start: at(d, "11:50"), end: at(d, "12:30") }];
  const s2 = onDay(openSlots({ settings: settings(), now: NOW, busy: [], existing }), d);
  assert.deepEqual(s2, [iso(at(d, "09:00")), iso(at(d, "10:00"))]);
});

test("existing session ending 09:45 keeps 10:00; ending 09:50 removes it", () => {
  const d = "2027-03-08";
  const keep = onDay(openSlots({
    settings: settings(), now: NOW, busy: [],
    existing: [{ start: at(d, "09:00"), end: at(d, "09:45") }],
  }), d);
  assert.ok(keep.includes(iso(at(d, "10:00"))));
  const drop = onDay(openSlots({
    settings: settings(), now: NOW, busy: [],
    existing: [{ start: at(d, "09:05"), end: at(d, "09:50") }],
  }), d);
  assert.ok(!drop.includes(iso(at(d, "10:00"))));
});

test("DST: Monday 09:00 Adelaide follows the offset", () => {
  const s = openSlots({
    settings: settings({ weeklyHours: { mon: [["09:00", "10:00"]] } }),
    now: Date.parse("2027-03-27T00:00:00Z"), busy: [], existing: [],
  });
  assert.ok(s.includes("2027-03-28T22:30:00.000Z"));
  assert.ok(s.includes("2027-04-04T23:30:00.000Z"));
});

test("zonedToUtc handles a non-existent local time without throwing", () => {
  const ms = zonedToUtc("2027-10-03", "02:30", TZ);
  assert.ok(Number.isFinite(ms));
});

test("empty weekly hours gives no slots", () => {
  assert.deepEqual(
    openSlots({ settings: settings({ weeklyHours: {} }), now: NOW, busy: [], existing: [] }), []);
});

test("validateWeeklyHours", () => {
  const bad = (h: unknown, call = 45) => "error" in validateWeeklyHours(h, call);
  assert.ok(bad({ mon: [["9:00", "12:00"]] }));
  assert.ok(bad({ mon: [["12:00", "09:00"]] }));
  assert.ok(bad({ mon: [["09:00", "11:00"], ["10:00", "12:00"]] }));
  assert.ok(bad({ mon: [["09:00", "09:30"]] }));
  assert.ok(bad({ funday: [["09:00", "12:00"]] }));
  const ok = validateWeeklyHours({ mon: [["09:00", "12:00"]] }, 45);
  assert.deepEqual(ok, { hours: { mon: [["09:00", "12:00"]] } });
});
