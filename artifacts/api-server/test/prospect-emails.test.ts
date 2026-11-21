import { test } from "node:test";
import assert from "node:assert/strict";
import { renderEmail } from "../src/lib/email";
import { prospectDiagnosticEmail, prospectFinishedEmail, prospectLink, prospectReminderEmail, prospectSenderName } from "../src/lib/prospect-emails";

const o = { senderName: "Adhyayan Verma", subject: "VCE Mathematical Methods Units 1/2", link: "https://x/diagnostic/t" };
const allText = (e: { subject: string; content: { heading: string; paragraphs: string[]; footer: string; cta?: { label: string } } }) =>
  [e.subject, e.content.heading, ...e.content.paragraphs, e.content.footer, e.content.cta?.label ?? ""].join("\n");

test("the diagnostic email uses the sender's full name and the agreed wording", () => {
  const e = prospectDiagnosticEmail(o);
  assert.equal(
    e.content.paragraphs[0],
    "Adhyayan Verma has sent you a diagnostic test for VCE Mathematical Methods Units 1/2. It takes about 30–45 minutes, and the results will be gone through with you on your consultation call.",
  );
  assert.equal(e.content.cta?.url, o.link);
  assert.ok(e.subject.includes("Adhyayan Verma") && e.subject.includes("VCE Mathematical Methods Units 1/2"));
});

test("nothing a prospect receives calls the sender their tutor", () => {
  for (const e of [prospectDiagnosticEmail(o), prospectReminderEmail(o)]) {
    assert.doesNotMatch(allText(e), /your tutor|tutoring with/i);
  }
});

test("the reminder says it's the only one", () => {
  const e = prospectReminderEmail(o);
  assert.equal(e.content.cta?.url, o.link);
  assert.ok(e.content.footer.includes("This is the only reminder"));
});

test("the tutor hears when a prospect finishes", () => {
  const e = prospectFinishedEmail({
    tutorName: "Adhyayan Verma", prospectName: "Sam Lee", subject: "VCE Chemistry Units 3/4",
    summary: { percentage: 62, band: "Developing", strong: ["Bonding"], work_on: ["Equilibrium"] }, link: "https://x/tutor?tab=diagnostic",
  });
  assert.equal(e.subject, "Sam Lee finished their VCE Chemistry Units 3/4 diagnostic: 62%");
  assert.ok(e.content.details?.some(([k, v]) => k === "Score" && v.includes("62%")));
  assert.match(e.content.footer, /you sent/i);
});

test("names are escaped in the rendered email", () => {
  const { html } = renderEmail(prospectDiagnosticEmail({ ...o, senderName: "<b>Sam</b>" }).content);
  assert.ok(html.includes("&lt;b&gt;Sam&lt;/b&gt;") && !html.includes("<b>Sam</b>"));
});

test("an emailed link always points at the app's own address, whatever the request says", () => {
  const saved = process.env.APP_URL;
  process.env.APP_URL = "https://www.gradefarm.com.au/";
  try {
    assert.equal(prospectLink("abc 123"), "https://www.gradefarm.com.au/diagnostic/abc%20123");
  } finally {
    if (saved === undefined) delete process.env.APP_URL; else process.env.APP_URL = saved;
  }
});

test("the sender is named by their display name, or gradefarm. — never a placeholder", () => {
  assert.equal(prospectSenderName("  Adhyayan Verma "), "Adhyayan Verma");
  assert.equal(prospectSenderName(""), "gradefarm.");
  assert.equal(prospectSenderName(null), "gradefarm.");
});
