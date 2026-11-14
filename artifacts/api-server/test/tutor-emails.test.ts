import { test } from "node:test";
import assert from "node:assert/strict";
import type { Resend } from "resend";
import { renderEmail, sendEmail } from "../src/lib/email";
import {
  assignmentFinishedEmail,
  assignmentSetEmail,
  formatClock,
  formatDue,
  resourceSharedEmail,
  seriesBookedEmail,
  sessionBookedEmail,
  tutorMessageEmail,
} from "../src/lib/tutor-emails";

test("subjects are plain text, not HTML-escaped", () => {
  const { subject } = assignmentSetEmail({
    studentName: "Mia Chen", tutorName: "Sam & Co", type: "Quiz", subject: "Maths & Physics",
    topics: [], dueDate: "2026-11-21", link: "https://x",
  });
  assert.equal(subject, "New quiz from Sam & Co: Maths & Physics");
});

test("the layout escapes content and carries the footer", () => {
  const { content } = tutorMessageEmail({ studentName: "Mia", tutorName: "Sam", message: "<b>hi</b>", link: "https://x" });
  const { html, text } = renderEmail(content);
  assert.ok(html.includes("&lt;b&gt;hi&lt;/b&gt;"));
  assert.ok(!html.includes("<b>hi</b>"));
  assert.ok(html.includes("Titanium Tutoring") && text.includes("support@titaniumtutoring.com.au"));
  assert.ok(text.includes("Open gradefarm.: https://x"));
});

test("unsubscribe link and label", () => {
  const { html, text } = renderEmail({ heading: "H", paragraphs: [], footer: "Why.", unsubscribe: "https://u", unsubscribeLabel: "Stop these" });
  assert.ok(html.includes('href="https://u"') && html.includes("Stop these"));
  assert.ok(text.includes("Stop these: https://u"));
});

test("a tutor's message keeps its paragraphs", () => {
  const { content } = tutorMessageEmail({ studentName: "Mia Chen", tutorName: "Sam", message: "First line\nwrapped.\n\nSecond one.", link: "https://x" });
  assert.deepEqual(content.paragraphs, ["Hi Mia,", "First line wrapped.", "Second one."]);
});

test("dates and times", () => {
  assert.equal(formatClock("16:30"), "4:30 pm");
  assert.equal(formatClock("09:05:00"), "9:05 am");
  assert.equal(formatClock("00:15"), "12:15 am");
  assert.equal(formatClock("12:00"), "12:00 pm");
  assert.equal(formatDue("2026-11-21"), "Saturday 21 November");
});

test("session and series details", () => {
  const s = sessionBookedEmail({
    studentName: "Mia Chen", tutorName: "Sam Lee", title: null, scheduledAt: "2026-11-18T06:00:00Z",
    durationMinutes: 60, isGroup: true, participantCount: 4, link: "https://x",
  });
  assert.match(s.subject, /^Group session booked: Group tutoring session, Wed 18 Nov$/);
  assert.deepEqual(s.content.details?.map(([k]) => k), ["When", "Length", "Tutor", "Group"]);
  assert.match(s.content.details![0][1], /Wednesday 18 November.*4:30 pm/);

  const r = seriesBookedEmail({
    studentName: "Mia", tutorName: "Sam", title: "Chem", recurrence: "fortnightly", dayOfWeek: 2,
    timeOfDay: "16:30", durationMinutes: 45, isGroup: false, link: "https://x",
  });
  assert.equal(r.content.details![0][1], "Every second Tuesday at 4:30 pm (Adelaide time)");
});

test("resource and finished-assignment wording", () => {
  assert.equal(resourceSharedEmail({ tutorName: "Sam", title: "Week 3", type: "worksheet", link: "x" }).subject, "Sam shared a worksheet: Week 3");
  const f = assignmentFinishedEmail({
    tutorName: "Sam Lee", studentName: "Mia", ownAssignment: false, setterName: "Jo", type: "Quiz", subject: "Chem",
    topics: ["Rates"], score: { correct: 7, total: 10, pct: 70 }, minAccuracy: 80, passed: false, reportUrl: "x",
  });
  assert.equal(f.subject, "Mia didn't pass their quiz: Chem");
  assert.ok(f.content.paragraphs[0].includes("the quiz Jo set"));
  assert.ok(f.content.details!.some(([k, v]) => k === "Result" && v === "Not passed"));
});

test("emails sent together are spaced out under the rate limit", async () => {
  const at: number[] = [];
  const resend = { emails: { send: async () => { at.push(Date.now()); return { data: { id: "1" }, error: null }; } } } as unknown as Resend;
  const email = { to: "a@example.com", subject: "S", content: { heading: "H", paragraphs: [], footer: "F" } };
  await Promise.all([sendEmail(resend, email), sendEmail(resend, email), sendEmail(resend, email)]);
  assert.equal(at.length, 3);
  at.sort((a, b) => a - b);
  assert.ok(at[1] - at[0] >= 500 && at[2] - at[1] >= 500, `gaps ${at[1] - at[0]}, ${at[2] - at[1]}`);
});
