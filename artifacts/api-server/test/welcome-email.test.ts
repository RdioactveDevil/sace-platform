import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstNameOf,
  freeAllowance,
  freePlanLine,
  planSummary,
  studentWelcomeEmail,
  titanExample,
  tutorWelcomeEmail,
  type StudentWelcome,
} from "../src/lib/welcome-email.ts";
import { tutorPlanOptions } from "../src/lib/tutor-plan.ts";

const UNSUB = "https://www.gradefarm.com.au/api/email/unsubscribe?u=1&t=x";

const student = (over: Partial<StudentWelcome> = {}): StudentWelcome => ({
  name: "Sam Lee",
  reader: "student",
  subjects: [],
  yearLevel: 11,
  hasPlan: false,
  awaitingParent: false,
  free: { questions: 20, titan: 10 },
  unsubscribeUrl: UNSUB,
  ...over,
});

test("the free allowance comes from the pricing settings, with the pricing page's defaults", () => {
  assert.deepEqual(freeAllowance({}), { questions: 20, titan: 10 });
  assert.deepEqual(freeAllowance(null), { questions: 20, titan: 10 });
  assert.deepEqual(freeAllowance({ free_daily_questions: 15, free_daily_ai_messages: 5 }), { questions: 15, titan: 5 });
  assert.deepEqual(freeAllowance({ free_daily_questions: "x", free_daily_ai_messages: -1 }), { questions: 20, titan: 10 });
  assert.equal(freePlanLine({ questions: 20, titan: 10 }), "Free: one subject, 20 questions and 10 Titan messages a day.");
  assert.equal(freePlanLine({ questions: 20, titan: 0 }), "Free: one subject, 20 questions a day.");
  assert.equal(freePlanLine({ questions: 0, titan: 0 }), "Free: one subject.");
});

test("names: first name only, and the sign-up defaults count as no name", () => {
  assert.equal(firstNameOf("Sam Lee"), "Sam");
  assert.equal(firstNameOf("  Priya  "), "Priya");
  assert.equal(firstNameOf("Student"), null);
  assert.equal(firstNameOf("there"), null);
  assert.equal(firstNameOf(""), null);
  assert.equal(firstNameOf(null), null);
});

test("Titan's example follows the student's subject, then their year level", () => {
  assert.equal(titanExample(["SACE Chemistry Stage 2"], 12).key, "chemistry");
  assert.equal(titanExample(["Year 6 English"], 6).key, "english");
  assert.equal(titanExample(["Year 6 Mathematics"], 6).key, "maths6");
  assert.equal(titanExample(["VCE Mathematical Methods Units 1 and 2"], 11).key, "methods");
  assert.equal(titanExample(["SACE Specialist Mathematics Stage 1"], 11).key, "methods");
  assert.equal(titanExample([], 6).key, "maths6");
  assert.equal(titanExample([], 11).key, "methods");
  assert.equal(titanExample([], null).key, "methods");
});

test("the student email: subject, unsubscribe, free plan and a plain-text copy", () => {
  const { subject, content } = studentWelcomeEmail(student());
  assert.equal(subject, "Welcome to gradefarm., Sam");
  assert.match(content.html, /You&#39;ll forget most of what you study this week\./);
  assert.match(content.html, /HOW ONE QUESTION TURNS GOLD/);
  assert.match(content.html, /Free: one subject, 20 questions and 10 Titan messages a day\./);
  assert.ok(content.html.includes(UNSUB.replace(/&/g, "&amp;")), "the unsubscribe link is in the HTML");
  assert.equal(content.unsubscribe, UNSUB);
  assert.match(content.text, /Answer your first question: https:\/\/www\.gradefarm\.com\.au\/home/);
  assert.ok(content.text.includes(UNSUB));
  assert.doesNotMatch(content.html, /SACE subjects/);
});

test("the student email leaves out the free plan for paid or tutor-included students", () => {
  const { content } = studentWelcomeEmail(student({ hasPlan: true }));
  assert.doesNotMatch(content.html, /Free: one subject/);
  assert.doesNotMatch(content.text, /Free: one subject/);
});

test("a student waiting on a parent hears that Titan switches on once they confirm", () => {
  assert.match(studentWelcomeEmail(student({ awaitingParent: true })).content.text, /Titan switches on once a parent or guardian confirms your account/);
  assert.doesNotMatch(studentWelcomeEmail(student()).content.text, /switches on/);
});

test("a parent gets the same email worded for them", () => {
  const { subject, content } = studentWelcomeEmail(student({ reader: "parent", name: "Mia", parentName: "Priya Shah", yearLevel: 6, subjects: ["Year 6 English"] }));
  assert.equal(subject, "Mia's gradefarm. account is ready");
  assert.match(content.text, /^Hi Priya,/);
  assert.match(content.text, /Mia will forget most of what they study this week\./);
  assert.match(content.text, /When do I use its and it's\?/);
  assert.match(content.text, /you set up a gradefarm\. account for Mia/);
  assert.doesNotMatch(content.text, /you're stuck/);
});

test("names are escaped and missing names read naturally", () => {
  const evil = studentWelcomeEmail(student({ name: "<b>Sam</b>" }));
  assert.doesNotMatch(evil.content.html, /<b>Sam<\/b>/);
  const none = studentWelcomeEmail(student({ name: "Student" }));
  assert.equal(none.subject, "Welcome to gradefarm.");
  assert.match(none.content.text, /^Hi there,/);
  const parent = studentWelcomeEmail(student({ reader: "parent", name: null }));
  assert.equal(parent.subject, "Your child's gradefarm. account is ready");
  assert.match(parent.content.text, /^Hi,/);
});

test("the tutor email follows the application and lists the plans from the settings", () => {
  const { plans, annualDiscount } = tutorPlanOptions({});
  const base = { name: "Sam", plans, annualDiscount, unsubscribeUrl: UNSUB };

  const review = tutorWelcomeEmail({ ...base, approved: false, portalOpen: false });
  assert.equal(review.subject, "Welcome to gradefarm. for tutors");
  assert.match(review.content.text, /Thanks for applying, Sam\./);
  assert.match(review.content.text, /✓ Applied {3}→ In review {3}○ Portal open/);
  assert.match(review.content.text, /Starter: \$59 a month\. 3 students, 1 subject/);
  assert.match(review.content.text, /Pro: \$89 a month\. 10 students, 3 subjects, recordings, parent reports/);
  assert.match(review.content.text, /Agency: \$129 a month\. 20 students, every subject, recordings, parent reports/);
  assert.match(review.content.text, /Pay yearly and save 15%\./);

  const approved = tutorWelcomeEmail({ ...base, approved: true, portalOpen: false });
  assert.match(approved.content.text, /Welcome to gradefarm\., Sam\./);
  assert.match(approved.content.text, /→ Pick a plan/);

  const open = tutorWelcomeEmail({ ...base, approved: true, portalOpen: true });
  assert.match(open.content.text, /✓ Portal open/);
  assert.doesNotMatch(open.content.text, /TUTOR PLANS/);

  const noName = tutorWelcomeEmail({ ...base, name: "Tutor", approved: true, portalOpen: false });
  assert.match(noName.content.text, /^Welcome to gradefarm\.\n/);
});

test("plan summaries handle unlimited and singular limits", () => {
  const [p] = tutorPlanOptions({ tutor_plans: [{ name: "Solo", price: 30, students: 1, subjects: 999, recordings: false, parent_reports: false }] }).plans;
  assert.equal(planSummary(p), "1 student, every subject");
});
