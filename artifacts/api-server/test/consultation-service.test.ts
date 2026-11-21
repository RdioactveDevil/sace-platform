import { test } from "node:test";
import assert from "node:assert/strict";
import type { Resend } from "resend";
import { sendConsultationEmails, type CallRow } from "../src/lib/consultation-service.ts";

const call: CallRow = {
  id: "11111111-2222-3333-4444-555555555555",
  tutor_id: "t1",
  session_type: "consultation",
  status: "scheduled",
  scheduled_at: "2026-12-01T05:00:00.000Z",
  duration_minutes: 45,
  diagnostic_id: "d1",
  guest_email: "sam@example.com",
  guest_name: "Sam Lee",
  guest_parent_email: "parent@example.com",
  guest_time_zone: "Europe/London",
  guest_token: "G".repeat(43),
  reminder_minutes: [1440, 60],
  ics_sequence: 2,
};
const tutor = { name: "Jane Smith", signInEmail: "jane@signin.example", inviteEmail: "jane@gmail.example", timeZone: "Australia/Adelaide" };

function fakeResend() {
  const sent: Array<Record<string, any>> = [];
  const resend = { emails: { send: async (p: Record<string, any>) => { sent.push(p); return { data: { id: String(sent.length) }, error: null }; } } } as unknown as Resend;
  return { resend, sent };
}
/** The invite attached to an email, with folded lines joined back up. */
const ics = (p: Record<string, any>) => Buffer.from(p.attachments[0].content, "base64").toString("utf8").replace(/\r\n /g, "");

test("a booking emails the guest, the parent and the tutor, each with an invite", async () => {
  const { resend, sent } = fakeResend();
  await sendConsultationEmails({ kind: "booked", call, tutor, questionnaireUrl: "https://forms.example/q", resend });
  assert.deepEqual(sent.map((p) => p.to[0]), ["sam@example.com", "parent@example.com", "jane@gmail.example"]);
  for (const p of sent) {
    assert.equal(p.attachments[0].filename, "invite.ics");
    assert.equal(p.attachments[0].contentType, "text/calendar; method=REQUEST");
    assert.match(ics(p), /UID:consultation-11111111-2222-3333-4444-555555555555@gradefarm\.com\.au/);
    assert.match(ics(p), /SEQUENCE:2/);
  }
});

test("replies from the guest and parent go to the tutor's sign-in email", async () => {
  const { resend, sent } = fakeResend();
  await sendConsultationEmails({ kind: "booked", call, tutor, resend });
  assert.equal(sent[0].replyTo, "jane@signin.example");
  assert.equal(sent[1].replyTo, "jane@signin.example");
  assert.equal("replyTo" in sent[2], false);
});

test("the guest token is only in the guest's and parent's emails; the tutor joins from their session", async () => {
  const { resend, sent } = fakeResend();
  await sendConsultationEmails({ kind: "booked", call, tutor, resend });
  const token = call.guest_token!;
  assert.ok(sent[0].text.includes(`/call/${token}`) && ics(sent[0]).includes(token));
  assert.ok(sent[1].text.includes(`/call/${token}`));
  assert.equal(sent[2].text.includes(token) || ics(sent[2]).includes(token), false);
  assert.ok(sent[2].text.includes(`/session/${call.id}`));
});

test("the prospect's invite doesn't carry the tutor's invite address; the tutor's does", async () => {
  const { resend, sent } = fakeResend();
  await sendConsultationEmails({ kind: "booked", call, tutor, resend });
  assert.equal(ics(sent[0]).includes("jane@gmail.example"), false);
  assert.ok(ics(sent[2]).includes("ATTENDEE;CN=Jane Smith;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:jane@gmail.example"));
});

test("guests see the time in their zone; the tutor in theirs", async () => {
  const { resend, sent } = fakeResend();
  await sendConsultationEmails({ kind: "booked", call, tutor, resend });
  assert.ok(sent[0].subject.includes("(London time)"));
  assert.ok(sent[2].subject.includes("(Adelaide time)"));
});

test("a cancellation sends METHOD:CANCEL invites", async () => {
  const { resend, sent } = fakeResend();
  await sendConsultationEmails({ kind: "cancelled", call: { ...call, guest_parent_email: null }, tutor, resend });
  assert.equal(sent.length, 2);
  for (const p of sent) {
    assert.equal(p.attachments[0].contentType, "text/calendar; method=CANCEL");
    assert.match(ics(p), /METHOD:CANCEL/);
  }
});
