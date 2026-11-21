import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { blockedMessage, deliveryProblem, verifyResendWebhook } from "../src/lib/email-blocks.ts";

const SECRET = `whsec_${Buffer.from("a test signing secret").toString("base64")}`;
const NOW = Date.parse("2026-11-21T00:00:00Z");

function sign(body: string, id = "msg_1", ts = String(NOW / 1000)) {
  const key = Buffer.from(SECRET.slice(6), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return { id, timestamp: ts, signature: `v1,${sig}` };
}

test("a webhook Resend signed is accepted", () => {
  const body = '{"type":"email.complained"}';
  assert.equal(verifyResendWebhook(Buffer.from(body), sign(body), SECRET, NOW), true);
  // Svix can list several signatures (during a secret rotation).
  const h = sign(body);
  assert.equal(verifyResendWebhook(body, { ...h, signature: `v1,bm9wZQ== ${h.signature}` }, SECRET, NOW), true);
});

test("a forged, altered or stale webhook is refused", () => {
  const body = '{"type":"email.complained"}';
  assert.equal(verifyResendWebhook(body.replace("complained", "bounced"), sign(body), SECRET, NOW), false);
  assert.equal(verifyResendWebhook(body, { ...sign(body), signature: "v1,bm9wZQ==" }, SECRET, NOW), false);
  assert.equal(verifyResendWebhook(body, sign(body, "msg_1", String(NOW / 1000 - 600)), SECRET, NOW), false);
  assert.equal(verifyResendWebhook(body, { id: "msg_1", timestamp: String(NOW / 1000) }, SECRET, NOW), false);
  assert.equal(verifyResendWebhook(body, sign(body), "", NOW), false);
});

const event = (type: string, data: Record<string, unknown>) => ({
  type, created_at: "2026-10-30T03:31:00.000Z",
  data: { email_id: "em_1", to: ["Parent@Live.com.au"], subject: "New Quiz for Year 6 Mathematics", created_at: "2026-10-30T03:30:30.000Z", ...data },
});

test("a spam report blocks the address", () => {
  assert.deepEqual(deliveryProblem(event("email.complained", {})), {
    reason: "complained", emails: ["parent@live.com.au"], providerId: "em_1",
    subject: "New Quiz for Year 6 Mathematics", detail: null, occurredAt: "2026-10-30T03:31:00.000Z",
  });
});

test("a hard bounce blocks the address, a soft one doesn't", () => {
  const hard = deliveryProblem(event("email.bounced", { bounce: { type: "Permanent", subType: "General", message: "Mailbox does not exist" } }));
  assert.equal(hard?.reason, "bounced");
  assert.equal(hard?.detail, "Mailbox does not exist");
  assert.equal(deliveryProblem(event("email.bounced", { bounce: { type: "Transient", message: "Mailbox full" } })), null);
  // No bounce details: Resend only reports hard bounces this way.
  assert.equal(deliveryProblem(event("email.bounced", {}))?.reason, "bounced");
});

test("a suppressed send is recorded, other events are ignored", () => {
  assert.equal(deliveryProblem(event("email.suppressed", {}))?.reason, "suppressed");
  assert.equal(deliveryProblem(event("email.delivered", {})), null);
  assert.equal(deliveryProblem(event("email.complained", { to: [] })), null);
  assert.equal(deliveryProblem(null), null);
  assert.equal(deliveryProblem({ type: "email.complained" }), null);
});

test("the reason an address is blocked reads plainly", () => {
  assert.match(blockedMessage("a@b.com", "complained"), /a@b\.com.*spam/);
  assert.match(blockedMessage("a@b.com", "bounced"), /bounced/);
  assert.match(blockedMessage("a@b.com", "suppressed"), /blocking/);
});
