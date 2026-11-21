import { test } from "node:test";
import assert from "node:assert/strict";
import { consultationIcs } from "../src/lib/consultation-ics";

const base = {
  uid: "abc-123@gradefarm", sequence: 0, method: "REQUEST" as const,
  start: Date.UTC(2027, 10, 1, 0, 30), minutes: 45,
  summary: "Intro call", description: "Hello", url: "https://www.gradefarm.com.au/call/xyz",
  organizerName: "Sam Lee", organizerEmail: "sam@example.com",
  attendees: [{ name: "Pat Parent", email: "pat@example.com" }, { email: "kid@example.com" }],
  now: Date.UTC(2027, 9, 30, 1, 2, 3),
};
const lines = (s: string) => s.split("\r\n");
const unfold = (s: string) => s.replace(/\r\n /g, "");

test("lines end CRLF and none exceed 75 octets", () => {
  const ics = consultationIcs({ ...base, description: "é".repeat(200) + " long, " + "x".repeat(300), summary: "日本語".repeat(40) });
  assert.ok(ics.endsWith("\r\n"));
  assert.ok(!/[^\r]\n/.test(ics));
  for (const l of lines(ics)) assert.ok(Buffer.byteLength(l) <= 75, `${Buffer.byteLength(l)}: ${l}`);
  assert.ok(ics.includes("\r\n "));
  // folding does not split multi-byte characters: unfolding restores the text
  assert.ok(unfold(ics).includes("DESCRIPTION:" + "é".repeat(200)));
  assert.ok(unfold(ics).includes("SUMMARY:" + "日本語".repeat(40)));
  assert.ok(!ics.includes("�"));
});

test("times are UTC basic format and DTEND = start + minutes", () => {
  const ics = consultationIcs(base);
  assert.ok(ics.includes("DTSTART:20271101T003000Z\r\n"));
  assert.ok(ics.includes("DTEND:20271101T011500Z\r\n"));
  assert.ok(ics.includes("DTSTAMP:20271030T010203Z\r\n"));
});

test("method, status, sequence and uid", () => {
  const req = consultationIcs({ ...base, sequence: 2 });
  assert.ok(req.includes("METHOD:REQUEST\r\n") && req.includes("STATUS:CONFIRMED\r\n"));
  assert.ok(req.includes("SEQUENCE:2\r\n") && req.includes("UID:abc-123@gradefarm\r\n"));
  const can = consultationIcs({ ...base, method: "CANCEL", sequence: 3 });
  assert.ok(can.includes("METHOD:CANCEL\r\n") && can.includes("STATUS:CANCELLED\r\n") && can.includes("SEQUENCE:3\r\n"));
  assert.ok(req.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//gradefarm//Consultations//EN\r\nCALSCALE:GREGORIAN\r\n"));
  assert.ok(req.includes("URL:https://www.gradefarm.com.au/call/xyz\r\n") && req.includes("LOCATION:https://www.gradefarm.com.au/call/xyz\r\n"));
  assert.ok(req.includes("ORGANIZER;CN=Sam Lee:mailto:sam@example.com\r\n"));
});

test("text is escaped", () => {
  const ics = consultationIcs({ ...base, summary: "a, b; c\\d", description: "line1\nline2\r\nline3" });
  assert.ok(ics.includes("SUMMARY:a\\, b\\; c\\\\d\r\n"));
  assert.ok(ics.includes("DESCRIPTION:line1\\nline2\\nline3\r\n"));
});

test("one ATTENDEE line per attendee with RSVP", () => {
  const ics = consultationIcs(base);
  const att = lines(unfold(ics)).filter((l) => l.startsWith("ATTENDEE"));
  assert.equal(att.length, 2);
  assert.equal(att[0], "ATTENDEE;CN=Pat Parent;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:pat@example.com");
  assert.ok(att[1].includes("RSVP=TRUE") && att[1].endsWith("mailto:kid@example.com"));
});
