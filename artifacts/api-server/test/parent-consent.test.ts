import { test } from "node:test";
import assert from "node:assert/strict";
import { parentConsentEmail, needsParentConsent } from "../src/lib/parent-consent";

const text = (e: ReturnType<typeof parentConsentEmail>) => [e.subject, e.content.heading, ...e.content.paragraphs, e.content.footer].join(" ");

test("under 15: the email asks the parent to confirm before the AI features switch on", () => {
  const e = parentConsentEmail({ parentName: "Jo", studentName: "Sam Lee", url: "https://x", young: true });
  assert.match(text(e), /under 15/);
  assert.match(text(e), /AI features stay off until you confirm/);
});

test("15 and over: the email is about the weekly progress email, with nothing about age or consent", () => {
  const e = parentConsentEmail({ parentName: "Jo", studentName: "Sam Lee", url: "https://x", young: false });
  assert.doesNotMatch(text(e), /under 15|stay off/);
  assert.match(text(e), /progress email every Sunday/);
  assert.equal(e.content.cta?.label, "Confirm my email");
});

test("a 24-year-old doesn't need a parent's OK", () => {
  const now = new Date("2026-11-15T00:00:00Z");
  assert.equal(needsParentConsent("2002-03-10", 12, now), false);
  assert.equal(needsParentConsent("2013-03-10", 7, now), true);
});
