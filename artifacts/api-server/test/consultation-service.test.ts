import { test } from "node:test";
import assert from "node:assert/strict";
import type { Resend } from "resend";
import { notifyAfterWrite, sendConsultationEmails, type CallRow } from "../src/lib/consultation-service.ts";

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

// ── A parent as the guest; the new-consultation combined email ─────────────

const parentOnly: CallRow = { ...call, guest_email: "parent@example.com", guest_parent_email: null, guest_is_parent: true };

test("a parent as the guest gets the parent wording on booked, moved and cancelled emails", async () => {
  for (const kind of ["booked", "changed", "cancelled"] as const) {
    const { resend, sent } = fakeResend();
    await sendConsultationEmails({ kind, call: parentOnly, tutor, previousStart: "2026-11-30T05:00:00.000Z", resend });
    assert.deepEqual(sent.map((p) => p.to[0]), ["parent@example.com", "jane@gmail.example"], kind);
    assert.match(sent[0].text, /Hi,/, kind);
    assert.match(sent[0].text, /Sam Lee's consultation call with Jane Smith/, kind);
    assert.equal(sent[0].replyTo, "jane@signin.example");
  }
});

test("a student guest keeps the student wording", async () => {
  const { resend, sent } = fakeResend();
  await sendConsultationEmails({ kind: "booked", call: { ...call, guest_parent_email: null }, tutor, resend });
  assert.match(sent[0].text, /Your consultation call with Jane Smith/);
  assert.doesNotMatch(sent[0].text, /Hi,/);
});

test("the combined invite: one email each with both links, the .ics and Reply-To; results per recipient", async () => {
  const { resend, sent } = fakeResend();
  const r = await sendConsultationEmails({
    kind: "booked", call, tutor, questionnaireUrl: "https://app.example/questionnaire/x", invite: { testUrl: "https://app.example/diagnostic/x" }, resend,
  });
  assert.deepEqual(r, { guest: true, parent: true, tutor: true });
  assert.deepEqual(sent.map((p) => p.to[0]), ["sam@example.com", "parent@example.com", "jane@gmail.example"]);
  // Student: asked to do them. Parent: asked to pass them on.
  assert.match(sent[0].text, /would appreciate it if you could fill in the short questionnaire and do the diagnostic test/);
  assert.match(sent[1].text, /Please pass these links on to them/);
  for (const p of sent.slice(0, 2)) {
    assert.ok(p.text.includes("https://app.example/questionnaire/x") && p.text.includes("https://app.example/diagnostic/x"));
    assert.equal(p.attachments[0].filename, "invite.ics");
    assert.equal(p.replyTo, "jane@signin.example");
    assert.doesNotMatch(p.text, /your tutor/i);
  }
  // The tutor's own copy has no prospect links.
  assert.equal(sent[2].text.includes("https://app.example/diagnostic/x"), false);
});

test("the combined invite to a parent-only call speaks to the parent", async () => {
  const { resend, sent } = fakeResend();
  await sendConsultationEmails({ kind: "booked", call: parentOnly, tutor, questionnaireUrl: null, invite: { testUrl: "https://app.example/diagnostic/x" }, resend });
  assert.equal(sent[0].to[0], "parent@example.com");
  assert.match(sent[0].text, /Sam Lee has a diagnostic test\. Please pass this link on to them/);
});

test("a failed send is reported for that recipient only", async () => {
  const sent: string[] = [];
  const resend = {
    emails: {
      send: async (p: Record<string, any>) => {
        sent.push(p.to[0]);
        return p.to[0] === "parent@example.com" ? { data: null, error: { message: "nope", name: "x" } } : { data: { id: "1" }, error: null };
      },
    },
  } as unknown as Resend;
  const r = await sendConsultationEmails({ kind: "booked", call, tutor, invite: { testUrl: null }, resend });
  assert.deepEqual(r, { guest: true, parent: false, tutor: true });
});

// ── After the booking is written, nothing may fail the request ──────────────

function steps(over: Partial<Parameters<typeof notifyAfterWrite>[0]> = {}) {
  const logged: string[] = [];
  const sent: Array<{ kind: string; call: CallRow; questionnaireUrl?: string | null }> = [];
  const o: Parameters<typeof notifyAfterWrite>[0] = {
    kind: "booked",
    sessionId: call.id,
    loadCall: async () => call,
    loadTutor: async () => tutor,
    loadQuestionnaire: async () => "https://forms.example/q",
    send: async (x) => { sent.push(x); },
    log: (_err, msg) => { logged.push(msg); },
    ...over,
  };
  return { o, logged, sent };
}

test("after a write, the emails go out with the reloaded call, tutor and questionnaire", async () => {
  const { o, logged, sent } = steps();
  assert.equal(await notifyAfterWrite(o), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].questionnaireUrl, "https://forms.example/q");
  assert.deepEqual(logged, []);
});

test("after a write, a failed reload, tutor lookup or send is logged, never thrown", async () => {
  const boom = async () => { throw new Error("db down"); };
  for (const over of [
    { loadCall: boom },
    { loadCall: async () => null },
    { loadTutor: boom },
    { send: boom },
  ] as Array<Partial<Parameters<typeof notifyAfterWrite>[0]>>) {
    const { o, logged } = steps(over);
    assert.equal(await notifyAfterWrite(o), false);
    assert.equal(logged.length, 1);
  }
});

test("after a write, a failed questionnaire lookup still sends, without the link", async () => {
  const { o, logged, sent } = steps({ loadQuestionnaire: async () => { throw new Error("x"); } });
  assert.equal(await notifyAfterWrite(o), true);
  assert.equal(sent[0].questionnaireUrl, null);
  assert.equal(logged.length, 1);
});

test("cancellations don't look up the questionnaire", async () => {
  let asked = false;
  const { o } = steps({ kind: "cancelled", loadQuestionnaire: async () => { asked = true; return null; } });
  await notifyAfterWrite(o);
  assert.equal(asked, false);
});
