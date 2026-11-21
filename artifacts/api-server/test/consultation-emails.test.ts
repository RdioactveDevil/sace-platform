import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookYourCallEmail,
  consultationBookedEmail,
  consultationCancelledEmail,
  consultationChangedEmail,
  consultationReminderEmail,
  formatCallTime,
} from "../src/lib/consultation-emails";

const base = {
  tutorName: "Sam Tutor",
  studentName: "Sam",
  start: "2027-11-02T06:00:00Z",
  timeZone: "Australia/Melbourne",
  minutes: 45,
  joinUrl: "https://app/consultation/join/tok",
};
type E = { subject: string; content: { heading: string; paragraphs: string[]; footer: string; cta?: { label: string; url: string }; details?: Array<[string, string]> } };
const text = (e: E) =>
  [e.subject, e.content.heading, ...e.content.paragraphs, ...(e.content.details ?? []).flat(), e.content.footer, e.content.cta?.label ?? ""].join("\n");

test("formatCallTime uses the zone, 12-hour time and a city label", () => {
  assert.equal(formatCallTime("2027-11-02T06:00:00Z", "Australia/Melbourne"), "Tuesday 2 November, 5:00 pm (Melbourne time)");
  assert.equal(formatCallTime("2027-11-02T06:00:00Z", "America/New_York"), "Tuesday 2 November, 2:00 am (New York time)");
  assert.doesNotMatch(formatCallTime("2027-11-02T06:00:00Z", "Australia/Adelaide"), /[  ]/);
});

test("guest and parent emails never say 'your tutor' and name the tutor in full", () => {
  const emails: E[] = [];
  for (const to of ["guest", "parent"] as const) {
    emails.push(
      consultationBookedEmail({ ...base, to, questionnaireUrl: "https://q" }),
      consultationChangedEmail({ ...base, to, previousStart: "2027-11-01T06:00:00Z" }),
      consultationCancelledEmail({ ...base, to }),
      consultationReminderEmail({ ...base, to, lead: 60 }),
    );
  }
  emails.push(bookYourCallEmail({ tutorName: base.tutorName, subject: "VCE Methods", bookUrl: "https://b" }));
  for (const e of emails) {
    assert.doesNotMatch(text(e), /your tutor/i);
    assert.match(text(e), /Sam Tutor/);
  }
});

test("parent version names the student; falls back when empty", () => {
  const e = consultationBookedEmail({ ...base, to: "parent" });
  assert.match(text(e), /Sam's consultation call with Sam Tutor/);
  const f = consultationBookedEmail({ ...base, to: "parent", studentName: "" });
  assert.match(text(f), /Your child's consultation call with Sam Tutor/);
});

test("guest booked email: join CTA and optional questionnaire paragraph", () => {
  const withQ = consultationBookedEmail({ ...base, to: "guest", questionnaireUrl: "https://q/x" });
  assert.equal(withQ.content.cta?.url, base.joinUrl);
  assert.ok(withQ.content.paragraphs.some((p) => p.includes("https://q/x")));
  const without = consultationBookedEmail({ ...base, to: "guest" });
  assert.equal(without.content.cta?.url, base.joinUrl);
  assert.ok(!without.content.paragraphs.some((p) => /questionnaire/i.test(p)));
  const nul = consultationBookedEmail({ ...base, to: "guest", questionnaireUrl: null });
  assert.ok(!nul.content.paragraphs.some((p) => /questionnaire/i.test(p)));
});

test("tutor version links the report and says who and when", () => {
  const e = consultationBookedEmail({ ...base, to: "tutor", reportUrl: "https://app/report/1" });
  const t = text(e);
  assert.match(t, /Sam/);
  assert.match(t, /Tuesday 2 November, 5:00 pm \(Melbourne time\)/);
  assert.ok(JSON.stringify(e.content).includes("https://app/report/1"));
});

test("reminder subject leads", () => {
  const s = (lead: number) => consultationReminderEmail({ ...base, to: "guest", lead }).subject;
  assert.match(s(1440), /tomorrow/);
  assert.match(s(60), /in 1 hour\b/);
  assert.match(s(180), /in 3 hours/);
  assert.match(s(2880), /in 2 days/);
  assert.match(s(45), /in 45 minutes/);
});

test("bookYourCallEmail CTA is bookUrl and footer says it's the only reminder", () => {
  const e = bookYourCallEmail({ tutorName: "Sam Tutor", subject: "VCE Methods", bookUrl: "https://b/x" });
  assert.equal(e.content.cta?.url, "https://b/x");
  assert.match(e.content.footer, /only reminder/);
});

test("parent booked email asks them to pass the questionnaire to the student, not fill it in", () => {
  const p = consultationBookedEmail({ ...base, to: "parent", questionnaireUrl: "https://q/x" });
  const para = p.content.paragraphs.find((x) => x.includes("https://q/x"))!;
  assert.ok(para);
  assert.doesNotMatch(para, /you filled in/i);
  assert.match(para, /Sam has a short questionnaire to fill in before the call/);
  assert.match(para, /pass this link on/);
  const f = consultationBookedEmail({ ...base, to: "parent", studentName: "", questionnaireUrl: "https://q/x" });
  assert.match(f.content.paragraphs.find((x) => x.includes("https://q/x"))!, /Your child has a short questionnaire/);
  const g = consultationBookedEmail({ ...base, to: "guest", questionnaireUrl: "https://q/x" });
  assert.ok(g.content.paragraphs.includes("If you have a few minutes beforehand, Sam Tutor would appreciate it if you filled in this short questionnaire: https://q/x"));
});
