import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBusy, checkIcalUrl, fetchBusy, clearBusyCache } from "../src/lib/busy-calendar";
import { zonedToUtc } from "../src/lib/booking-slots";

const TZ = "Australia/Adelaide";
const wrap = (body: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\n${body}\r\nEND:VCALENDAR\r\n`;
const ev = (lines: string[]) => `BEGIN:VEVENT\r\n${lines.join("\r\n")}\r\nEND:VEVENT`;
const D = (s: string) => Date.parse(s);

test("one-off event", () => {
  const ics = wrap(ev(["UID:a", "DTSTAMP:20270101T000000Z", "DTSTART:20270301T100000Z", "DTEND:20270301T110000Z"]));
  const r = parseBusy(ics, D("2027-03-01T00:00:00Z"), D("2027-03-02T00:00:00Z"), TZ);
  assert.deepEqual(r, [{ start: D("2027-03-01T10:00:00Z"), end: D("2027-03-01T11:00:00Z") }]);
});

const weekly = [
  "UID:w", "DTSTAMP:20270101T000000Z", "DTSTART:20270301T100000Z", "DTEND:20270301T110000Z",
  "RRULE:FREQ=WEEKLY;COUNT=10",
];

test("weekly RRULE with EXDATE, within window only", () => {
  const ics = wrap(ev([...weekly, "EXDATE:20270308T100000Z"]));
  const r = parseBusy(ics, D("2027-03-01T00:00:00Z"), D("2027-03-23T00:00:00Z"), TZ);
  assert.deepEqual(r.map((i) => new Date(i.start).toISOString()), [
    "2027-03-01T10:00:00.000Z", "2027-03-15T10:00:00.000Z", "2027-03-22T10:00:00.000Z",
  ]);
  assert.ok(r.every((i) => i.end - i.start === 3600_000));
});

test("RECURRENCE-ID override moves an instance", () => {
  const ics = wrap(
    ev(weekly) + "\r\n" +
      ev(["UID:w", "DTSTAMP:20270101T000000Z", "RECURRENCE-ID:20270308T100000Z", "DTSTART:20270308T150000Z", "DTEND:20270308T160000Z"]),
  );
  const r = parseBusy(ics, D("2027-03-01T00:00:00Z"), D("2027-03-10T00:00:00Z"), TZ);
  assert.deepEqual(r.map((i) => new Date(i.start).toISOString()), [
    "2027-03-01T10:00:00.000Z", "2027-03-08T15:00:00.000Z",
  ]);
});

test("transparent and cancelled events ignored", () => {
  const base = ["DTSTAMP:20270101T000000Z", "DTSTART:20270301T100000Z", "DTEND:20270301T110000Z"];
  const ics = wrap(ev(["UID:t", "TRANSP:TRANSPARENT", ...base]) + "\r\n" + ev(["UID:c", "STATUS:CANCELLED", ...base]));
  assert.deepEqual(parseBusy(ics, D("2027-03-01T00:00:00Z"), D("2027-03-02T00:00:00Z"), TZ), []);
});

test("all-day event is midnight to midnight in tutor zone", () => {
  const ics = wrap(ev(["UID:d", "DTSTAMP:20270101T000000Z", "DTSTART;VALUE=DATE:20271101", "DTEND;VALUE=DATE:20271102"]));
  const r = parseBusy(ics, D("2027-10-30T00:00:00Z"), D("2027-11-05T00:00:00Z"), TZ);
  assert.deepEqual(r, [{ start: zonedToUtc("2027-11-01", "00:00", TZ), end: zonedToUtc("2027-11-02", "00:00", TZ) }]);
});

test("all-day event without DTEND lasts one day", () => {
  const ics = wrap(ev(["UID:d", "DTSTAMP:20270101T000000Z", "DTSTART;VALUE=DATE:20271101"]));
  const r = parseBusy(ics, D("2027-10-30T00:00:00Z"), D("2027-11-05T00:00:00Z"), TZ);
  assert.deepEqual(r, [{ start: zonedToUtc("2027-11-01", "00:00", TZ), end: zonedToUtc("2027-11-02", "00:00", TZ) }]);
});

test("garbage gives []", () => {
  assert.deepEqual(parseBusy("not a calendar \u0000 ???", 0, 1e13, TZ), []);
});

test("checkIcalUrl", () => {
  assert.ok("error" in checkIcalUrl("http://example.com/x.ics"));
  assert.deepEqual(checkIcalUrl(""), { url: null });
  assert.deepEqual(checkIcalUrl(undefined), { url: null });
  assert.ok("error" in checkIcalUrl("not a url"));
  assert.ok("error" in checkIcalUrl("https://example.com/" + "a".repeat(2000)));
  assert.ok("error" in checkIcalUrl(42));
  const g = "https://calendar.google.com/calendar/ical/x/private-y/basic.ics";
  assert.deepEqual(checkIcalUrl(g), { url: g });
});

const ICS = wrap(ev(["UID:a", "DTSTAMP:20270101T000000Z", "DTSTART:20270301T100000Z", "DTEND:20270301T110000Z"]));
const OKR = { resolve: async () => ["93.184.216.34"] };
const W: [number, number] = [D("2027-03-01T00:00:00Z"), D("2027-03-02T00:00:00Z")];

test("fetchBusy times out", async () => {
  clearBusyCache();
  const never = ((_u: any, init?: any) =>
    new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as any;
  const r = await fetchBusy("https://x.test/a.ics", W[0], W[1], TZ, never, 50, OKR);
  assert.ok("error" in r);
});

test("fetchBusy hanging without abort support still times out", async () => {
  clearBusyCache();
  const never = (() => new Promise(() => {})) as any;
  const r = await fetchBusy("https://x.test/h.ics", W[0], W[1], TZ, never, 50, OKR);
  assert.ok("error" in r);
});

test("fetchBusy rejects 6 MB body", async () => {
  clearBusyCache();
  const big = (async () => new Response("x".repeat(6 * 1024 * 1024))) as any;
  const r = await fetchBusy("https://x.test/big.ics", W[0], W[1], TZ, big, 1000, OKR);
  assert.ok("error" in r);
});

test("fetchBusy non-OK and thrown fetch give error", async () => {
  clearBusyCache();
  const bad = (async () => new Response("no", { status: 404 })) as any;
  assert.ok("error" in (await fetchBusy("https://x.test/404.ics", W[0], W[1], TZ, bad, undefined, OKR)));
  const boom = (async () => { throw new Error("net"); }) as any;
  assert.ok("error" in (await fetchBusy("https://x.test/boom.ics", W[0], W[1], TZ, boom, undefined, OKR)));
});

test("fetchBusy caches within 5 minutes", async () => {
  clearBusyCache();
  let calls = 0;
  const f = (async () => { calls++; return new Response(ICS); }) as any;
  const a = await fetchBusy("https://x.test/c.ics", W[0], W[1], TZ, f, undefined, OKR);
  const b = await fetchBusy("https://x.test/c.ics", W[0], W[1], TZ, f, undefined, OKR);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(a, { busy: [{ start: D("2027-03-01T10:00:00Z"), end: D("2027-03-01T11:00:00Z") }] });
});

test("checkIcalUrl blocks private targets and userinfo", () => {
  for (const u of [
    "https://127.0.0.1/x.ics", "https://[::1]/x", "https://10.1.2.3/x", "https://169.254.169.254/x",
    "https://100.64.0.1/x", "https://192.168.1.1/x", "https://172.16.0.1/x", "https://0.0.0.0/x",
    "https://[fd00::1]/x", "https://[fe80::1]/x", "https://[::ffff:127.0.0.1]/x",
    "https://localhost/x", "https://a.localhost/x", "https://printer.local/x", "https://db.internal/x",
    "https://user:pw@calendar.google.com/x",
  ]) assert.ok("error" in checkIcalUrl(u), u);
});

test("fetchBusy refuses host resolving to a private address", async () => {
  clearBusyCache();
  let calls = 0;
  const f = (async () => { calls++; return new Response(ICS); }) as any;
  const r = await fetchBusy("https://sneaky.test/a.ics", W[0], W[1], TZ, f, 1000, { resolve: async () => ["10.0.0.5"] });
  assert.ok("error" in r);
  assert.equal(calls, 0);
});

test("fetchBusy refuses redirect to metadata address", async () => {
  clearBusyCache();
  const urls: string[] = [];
  const f = (async (u: string, init: any) => {
    urls.push(u);
    assert.equal(init.redirect, "manual");
    return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } });
  }) as any;
  const r = await fetchBusy("https://redir.test/a.ics", W[0], W[1], TZ, f, 1000, OKR);
  assert.ok("error" in r);
  assert.deepEqual(urls, ["https://redir.test/a.ics"]);
});

test("fetchBusy follows a redirect to another valid https host (relative too)", async () => {
  clearBusyCache();
  const urls: string[] = [];
  const f = (async (u: string) => {
    urls.push(u);
    if (urls.length === 1) return new Response(null, { status: 301, headers: { location: "https://other.test/b.ics" } });
    if (urls.length === 2) return new Response(null, { status: 302, headers: { location: "/c.ics" } });
    return new Response(ICS);
  }) as any;
  const r = await fetchBusy("https://first.test/a.ics", W[0], W[1], TZ, f, 1000, OKR);
  assert.deepEqual(urls, ["https://first.test/a.ics", "https://other.test/b.ics", "https://other.test/c.ics"]);
  assert.ok("busy" in r && r.busy.length === 1);
});

test("fetchBusy gives up after 3 redirects", async () => {
  clearBusyCache();
  const f = (async () => new Response(null, { status: 302, headers: { location: "https://loop.test/x" } })) as any;
  assert.ok("error" in (await fetchBusy("https://loop.test/x", W[0], W[1], TZ, f, 1000, OKR)));
});

test("cache is per URL across windows, expires after 5 minutes, returns fresh arrays", async () => {
  clearBusyCache();
  let calls = 0;
  let t = 1_000_000;
  const f = (async () => { calls++; return new Response(ICS); }) as any;
  const deps = { ...OKR, now: () => t };
  const a = await fetchBusy("https://w.test/a.ics", W[0], W[1], TZ, f, 1000, deps);
  t += 60_000;
  const b = await fetchBusy("https://w.test/a.ics", W[0] - 3600_000, W[1] + 86400_000, TZ, f, 1000, deps);
  assert.equal(calls, 1);
  assert.ok("busy" in a && "busy" in b && a.busy !== b.busy);
  (b as any).busy.pop();
  const c = await fetchBusy("https://w.test/a.ics", W[0], W[1], TZ, f, 1000, deps);
  assert.ok("busy" in c && c.busy.length === 1);
  t += 5 * 60_000;
  await fetchBusy("https://w.test/a.ics", W[0], W[1], TZ, f, 1000, deps);
  assert.equal(calls, 2);
});

test("cache caps at 200 entries", async () => {
  clearBusyCache();
  let calls = 0;
  const f = (async () => { calls++; return new Response(ICS); }) as any;
  for (let i = 0; i < 201; i++) await fetchBusy(`https://c${i}.test/a.ics`, W[0], W[1], TZ, f, 1000, OKR);
  await fetchBusy("https://c0.test/a.ics", W[0], W[1], TZ, f, 1000, OKR);
  assert.equal(calls, 202);
});

test("fetchBusy: a page that isn't a calendar is an error, not an empty calendar", async () => {
  clearBusyCache();
  const html = (async () => new Response("<!doctype html><html><body>Sign in</body></html>", { headers: { "content-type": "text/html" } })) as any;
  const r = await fetchBusy("https://x.test/login", W[0], W[1], TZ, html, 1000, OKR);
  assert.deepEqual(r, { error: "That address didn't return a calendar." });
});

test("one series that can't be expanded is skipped; the rest of the calendar is kept", () => {
  const ics = wrap(
    ev(["UID:s", "DTSTAMP:20270101T000000Z", "DTSTART:20270101T000000Z", "DTEND:20270101T000001Z", "RRULE:FREQ=SECONDLY"]) + "\r\n" +
      ev(["UID:a", "DTSTAMP:20270101T000000Z", "DTSTART:20270301T100000Z", "DTEND:20270301T110000Z"]),
  );
  const r = parseBusy(ics, D("2027-03-01T00:00:00Z"), D("2027-03-02T00:00:00Z"), TZ);
  assert.ok(r.some((i) => i.start === D("2027-03-01T10:00:00Z") && i.end === D("2027-03-01T11:00:00Z")));
});
