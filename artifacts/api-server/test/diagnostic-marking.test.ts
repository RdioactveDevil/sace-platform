import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeSupabase, type FakeDb } from "./fake-supabase";
import type { DiagnosticQuestion } from "../src/lib/timed-diagnostic";
import type { MarkableQuestion, MarkingResult } from "../src/lib/marking";
import {
  markAndStore,
  markAssessment,
  needsRemark,
  remarkStaleDiagnostics,
  storeTimedSubmission,
  submitUnavailableReason,
  timedAnswers,
  REMARK_BUDGET_MS,
  type MarkingDeps,
} from "../src/lib/diagnostic-marking";

const NOW = new Date("2026-11-23T10:00:00Z");
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const timedRow = (over: Partial<Parameters<typeof needsRemark>[0]> = {}) => ({
  time_limit_minutes: 50,
  status: "completed",
  report: null,
  marking_started_at: minsAgo(11),
  marking_attempts: 1,
  ...over,
});

test("needsRemark: untimed → false", () => {
  assert.equal(needsRemark(timedRow({ time_limit_minutes: null }), NOW), false);
});
test("needsRemark: timed with a report → false", () => {
  assert.equal(needsRemark(timedRow({ report: { total_score: 1 } }), NOW), false);
});
test("needsRemark: timed, no report, started 11 min ago, 1 attempt → true", () => {
  assert.equal(needsRemark(timedRow(), NOW), true);
});
test("needsRemark: started 5 min ago → false", () => {
  assert.equal(needsRemark(timedRow({ marking_started_at: minsAgo(5) }), NOW), false);
});
test("needsRemark: 3 attempts → false", () => {
  assert.equal(needsRemark(timedRow({ marking_attempts: 3 }), NOW), false);
});
test("needsRemark: never started → true", () => {
  assert.equal(needsRemark(timedRow({ marking_started_at: null, marking_attempts: 0 }), NOW), true);
});
test("needsRemark: still pending → false", () => {
  assert.equal(needsRemark(timedRow({ status: "pending", marking_started_at: null, marking_attempts: 0 }), NOW), false);
});

// A timed set: 20 one-mark MC plus marked questions totalling 30.
const SHORT_MARKS = [4, 6, 5, 5, 6, 4];
function timedQuestions(): DiagnosticQuestion[] {
  const mc: DiagnosticQuestion[] = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    question: `MC ${i + 1}`,
    type: "multiple_choice",
    options: ["A", "B", "C", "D"],
    correct_answer: "B",
    marks: 1,
    difficulty: i < 8 ? "easy" : i < 15 ? "moderate" : "exam",
    topic: i % 2 ? "Algebra" : "Calculus",
    subtopic: i % 2 ? "Indices" : "Derivatives",
  }));
  const short: DiagnosticQuestion[] = SHORT_MARKS.map((marks, i) => ({
    id: 21 + i,
    question: `Short ${i + 1}`,
    type: "marked",
    correct_answer: `Solution ${i + 1}`,
    solution: `Solution ${i + 1}`,
    marking_scheme: [{ marks, point: `Point for ${i + 1}` }],
    marks,
    difficulty: i < 3 ? "moderate" : "exam",
    topic: "Algebra",
    subtopic: "Indices",
  }));
  return [...mc, ...short];
}

const narrative = JSON.stringify({ pain_points: ["p"], patterns: ["q"], recommendations: ["r"], summary: "s" });

function stubMarker(calls: { q: MarkableQuestion; answer: string }[], fn?: (q: MarkableQuestion) => MarkingResult): MarkingDeps {
  return {
    markAnswer: async (q, answer) => {
      calls.push({ q, answer });
      if (fn) return fn(q);
      return { awarded: 0, total: 0, marks: [], summary: "none" };
    },
    narrate: async () => narrative,
  };
}

const POINTS = [
  { point: 0, awarded: 2, of: 2, evidence: "x = 2", found: true, comment: "Good." },
  { point: 1, awarded: 1, of: 2, evidence: "", found: false, comment: "Missing step." },
];

test("markAssessment marks a marked question with the marker and keeps its points", async () => {
  const qs = timedQuestions();
  const answers: Record<string, string> = { "1": "B", "2": "A", "21": "my working" };
  const calls: { q: MarkableQuestion; answer: string }[] = [];
  const deps = stubMarker(calls, (q) => (q.question === "Short 1"
    ? { awarded: 3, total: 4, marks: POINTS, summary: "Show the second step." }
    : { awarded: 0, total: 0, marks: [], summary: "" }));
  const report = await markAssessment(qs, answers, "Year 11", [{ name: "Mathematical Methods", topics: [] }], deps);

  assert.equal(calls.length, 1, "only the answered short answer goes to the marker");
  assert.equal(calls[0].answer, "my working");
  assert.equal(calls[0].q.subject, "Mathematical Methods");
  assert.equal(calls[0].q.question, "Short 1");
  assert.deepEqual(calls[0].q.marking_scheme, [{ marks: 4, point: "Point for 1" }]);
  assert.equal(calls[0].q.solution, "Solution 1");

  const r21 = report.question_results.find((r) => r.id === 21)!;
  assert.equal(r21.marks_awarded, 3);
  assert.equal(r21.marks_possible, 4);
  assert.equal(r21.correct, false);
  assert.equal(r21.feedback, "Show the second step.");
  assert.deepEqual(r21.points, POINTS);

  assert.equal(report.max_score, 50);
  assert.equal(report.total_score, 1 + 3);
  assert.equal(report.easy_max + report.moderate_max + report.exam_max, 50);
  assert.equal(report.summary, "s");
  assert.ok(report.topic_breakdown.some((t) => t.topic === "Algebra"));
  assert.ok(report.subtopic_breakdown!.some((t) => t.subtopic === "Indices" && t.marks_awarded === 3));
});

test("markAssessment: an empty answer is 0 marks without calling the marker", async () => {
  const qs = timedQuestions();
  const calls: { q: MarkableQuestion; answer: string }[] = [];
  const report = await markAssessment(qs, { "22": "   \n " }, "Year 11", [{ name: "Mathematical Methods", topics: [] }], stubMarker(calls));
  assert.equal(calls.length, 0);
  const r22 = report.question_results.find((r) => r.id === 22)!;
  assert.equal(r22.marks_awarded, 0);
  assert.equal(r22.marks_possible, 6);
  assert.deepEqual(r22.points, []);
  assert.equal(report.total_score, 0);
  assert.equal(report.max_score, 50);
});

test("markAssessment: a marker error rejects the whole call", async () => {
  const qs = timedQuestions();
  const deps: MarkingDeps = {
    markAnswer: async () => { throw new Error("marker down"); },
    narrate: async () => narrative,
  };
  await assert.rejects(
    markAssessment(qs, { "23": "something" }, "Year 11", [{ name: "Mathematical Methods", topics: [] }], deps),
    /marker down/,
  );
});

test("timedAnswers keeps string answers to this test's questions, capped in length", () => {
  const qs = timedQuestions();
  const out = timedAnswers(qs, { "1": "B", "21": "x".repeat(5000), "999": "stray", "2": 7 as unknown as string, "3": "" });
  assert.deepEqual(Object.keys(out).sort(), ["1", "21", "3"]);
  assert.equal(out["21"].length, 4000);
  assert.equal(out["1"], "B");
});

// ── Storage ────────────────────────────────────────────────────────────────

test("claimSubmission only claims a pending row", async () => {
  const fields = { student_answers: { "1": "B" }, submitted_by_name: "Sam", completed_at: NOW.toISOString() };
  const db: FakeDb = {
    tables: {
      diagnostic_assessments: [
        { id: "a", token: "tok-pending", status: "pending", student_answers: null, submitted_by_name: null, completed_at: null },
        { id: "b", token: "tok-done", status: "completed", student_answers: { "1": "C" }, submitted_by_name: "Old", completed_at: "2026-11-01T00:00:00Z" },
      ],
    },
  };
  const admin = fakeSupabase(db);
  assert.equal(await storeTimedSubmission(admin, "tok-pending", fields), "stored");
  const a = db.tables.diagnostic_assessments[0];
  assert.equal(a.status, "completed");
  assert.deepEqual(a.student_answers, { "1": "B" });
  assert.equal(a.submitted_by_name, "Sam");
  assert.equal(a.completed_at, NOW.toISOString());

  const before = { ...db.tables.diagnostic_assessments[1] };
  assert.equal(await storeTimedSubmission(admin, "tok-done", fields), "already_submitted");
  assert.deepEqual(db.tables.diagnostic_assessments[1], before);

  // A second submit of the row just stored loses too.
  assert.equal(await storeTimedSubmission(admin, "tok-pending", fields), "already_submitted");
});

function completedTimedRow(over: Record<string, unknown> = {}) {
  return {
    id: "d1",
    token: "tok",
    status: "completed",
    time_limit_minutes: 50,
    year_level: "Year 11",
    subjects: [{ name: "Mathematical Methods", topics: [] }],
    questions: timedQuestions(),
    student_answers: { "1": "B", "21": "work" },
    report: null,
    score_total: null,
    marking_started_at: null,
    marking_attempts: 0,
    completed_at: minsAgo(30),
    ...over,
  };
}

const fourOfFour = (): MarkingResult => ({ awarded: 4, total: 4, marks: POINTS, summary: "ok" });

test("markAndStore claims, marks and writes report + score_total", async () => {
  const db: FakeDb = { tables: { diagnostic_assessments: [completedTimedRow()] } };
  const calls: { q: MarkableQuestion; answer: string }[] = [];
  const ok = await markAndStore(fakeSupabase(db), "d1", stubMarker(calls, fourOfFour));
  const row = db.tables.diagnostic_assessments[0];
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(row.marking_attempts, 1);
  assert.ok(row.marking_started_at);
  assert.equal(row.score_total, 5);
  assert.equal((row.report as { total_score: number }).total_score, 5);
  assert.equal((row.report as { max_score: number }).max_score, 50);
});

test("markAndStore does nothing when a report already exists", async () => {
  const db: FakeDb = { tables: { diagnostic_assessments: [completedTimedRow({ report: { total_score: 9 }, score_total: 9 })] } };
  const calls: { q: MarkableQuestion; answer: string }[] = [];
  assert.equal(await markAndStore(fakeSupabase(db), "d1", stubMarker(calls, fourOfFour)), false);
  assert.equal(calls.length, 0);
  assert.equal(db.tables.diagnostic_assessments[0].marking_attempts, 0);
  assert.equal(db.tables.diagnostic_assessments[0].score_total, 9);
});

test("markAndStore logs a marker failure: no report, the attempt counted, nothing thrown", async () => {
  const db: FakeDb = { tables: { diagnostic_assessments: [completedTimedRow({ marking_attempts: 1 })] } };
  const deps: MarkingDeps = { markAnswer: async () => { throw new Error("boom"); }, narrate: async () => narrative };
  assert.equal(await markAndStore(fakeSupabase(db), "d1", deps), false);
  const row = db.tables.diagnostic_assessments[0];
  assert.equal(row.report, null);
  assert.equal(row.marking_attempts, 2);
});

test("markAndStore loses the claim when another runner bumps marking_attempts after the read", async () => {
  const db: FakeDb = { tables: { diagnostic_assessments: [completedTimedRow({ marking_attempts: 0 })] } };
  const base = fakeSupabase(db);
  let first = true;
  // The first query is markAndStore's read: once it has returned, another runner claims the row.
  const racing = {
    ...base,
    from: (table: string) => {
      const q = base.from(table) as unknown as { then: PromiseLike<unknown>["then"] };
      if (first) {
        first = false;
        const then = q.then.bind(q);
        q.then = ((ok, bad) => then((v) => {
          db.tables.diagnostic_assessments[0].marking_attempts = 1;
          db.tables.diagnostic_assessments[0].marking_started_at = NOW.toISOString();
          return ok ? ok(v) : v;
        }, bad)) as PromiseLike<unknown>["then"];
      }
      return q;
    },
  } as unknown as typeof base;
  const calls: { q: MarkableQuestion; answer: string }[] = [];
  let narrated = 0;
  const deps = stubMarker(calls, fourOfFour);
  const ok = await markAndStore(racing, "d1", { ...deps, narrate: async (a, b) => { narrated++; return deps.narrate(a, b); } });
  assert.equal(ok, false);
  assert.equal(calls.length, 0, "the marker is never called");
  assert.equal(narrated, 0);
  const row = db.tables.diagnostic_assessments[0];
  assert.equal(row.marking_attempts, 1, "the other runner's claim stands");
  assert.equal(row.report, null);
});

test("markAndStore gives up after the last attempt", async () => {
  const db: FakeDb = { tables: { diagnostic_assessments: [completedTimedRow({ marking_attempts: 3 })] } };
  const calls: { q: MarkableQuestion; answer: string }[] = [];
  assert.equal(await markAndStore(fakeSupabase(db), "d1", stubMarker(calls, fourOfFour)), false);
  assert.equal(calls.length, 0);
  assert.equal(db.tables.diagnostic_assessments[0].marking_attempts, 3);
});

function remarkDb() {
  const stale = Array.from({ length: 7 }, (_, i) =>
    completedTimedRow({ id: `s${i}`, token: `t${i}`, marking_started_at: minsAgo(20 + i), marking_attempts: 1 }));
  const others = [
    completedTimedRow({ id: "fresh", marking_started_at: minsAgo(2), marking_attempts: 1 }),
    completedTimedRow({ id: "untimed", time_limit_minutes: null }),
    completedTimedRow({ id: "done", report: { total_score: 1 } }),
    completedTimedRow({ id: "gaveup", marking_attempts: 3, marking_started_at: minsAgo(60) }),
    completedTimedRow({ id: "pending", status: "pending" }),
  ];
  return { tables: { diagnostic_assessments: [...stale, ...others] } } as FakeDb;
}

test("remarkStaleDiagnostics marks only stale, unmarked timed rows, at most 2 a run", async () => {
  const db = remarkDb();
  const calls: { q: MarkableQuestion; answer: string }[] = [];
  const result = await remarkStaleDiagnostics(fakeSupabase(db), NOW, { deps: stubMarker(calls, fourOfFour) });
  assert.deepEqual(result, { marked: 2 });
  const byId = Object.fromEntries(db.tables.diagnostic_assessments.map((r) => [r.id, r]));
  assert.equal(db.tables.diagnostic_assessments.filter((r) => String(r.id).startsWith("s") && r.report).length, 2);
  for (const id of ["fresh", "untimed", "gaveup", "pending"]) assert.equal(byId[id].report, null, id);
});

test("remarkStaleDiagnostics starts no new row once the 90 s budget is spent", async () => {
  assert.equal(REMARK_BUDGET_MS, 90_000);
  const start = 1_000_000;
  // The first row is started inside the budget; marking it takes the clock past 90 s.
  let t = start;
  const clock = () => t;
  const calls: { q: MarkableQuestion; answer: string }[] = [];
  const deps: MarkingDeps = {
    markAnswer: async (q, a) => { calls.push({ q, answer: a }); t = start + REMARK_BUDGET_MS; return fourOfFour(); },
    narrate: async () => narrative,
  };
  const db = remarkDb();
  assert.deepEqual(await remarkStaleDiagnostics(fakeSupabase(db), NOW, { startedAt: start, clock, deps }), { marked: 1 });
  assert.equal(calls.length, 1);

  // Already over budget when it begins (the email run took it): nothing started.
  t = start + REMARK_BUDGET_MS + 1;
  const db2 = remarkDb();
  const calls2: { q: MarkableQuestion; answer: string }[] = [];
  assert.deepEqual(await remarkStaleDiagnostics(fakeSupabase(db2), NOW, { startedAt: start, clock, deps: stubMarker(calls2, fourOfFour) }), { marked: 0 });
  assert.equal(calls2.length, 0);
  assert.equal(db2.tables.diagnostic_assessments.filter((r) => r.report).length, 1); // only "done"
});

// ── Submitting after the link's expiry ─────────────────────────────────────

const DAY = 24 * 3_600_000;
function linkRow(over: Record<string, unknown> = {}) {
  return {
    status: "pending" as const,
    student_id: null,
    prospect_email: "p@example.com",
    created_at: new Date(NOW.getTime() - 40 * DAY).toISOString(),
    sent_at: new Date(NOW.getTime() - 31 * DAY).toISOString(), // past the 30-day expiry
    opened_at: null,
    started_at: null,
    reminded_at: null,
    cancelled_at: null,
    has_test: true,
    time_limit_minutes: 50 as number | null,
    ...over,
  };
}

test("submitUnavailableReason: timed, started, expired → accepted", () => {
  assert.equal(submitUnavailableReason(linkRow({ started_at: minsAgo(60) }), NOW), null);
});
test("submitUnavailableReason: timed, not started, expired → expired", () => {
  assert.match(submitUnavailableReason(linkRow(), NOW) ?? "", /expired/);
});
test("submitUnavailableReason: untimed, started, expired → expired (as today)", () => {
  assert.match(submitUnavailableReason(linkRow({ time_limit_minutes: null, started_at: minsAgo(60) }), NOW) ?? "", /expired/);
});
test("submitUnavailableReason: cancelled blocks even a started timed test", () => {
  assert.match(submitUnavailableReason(linkRow({ started_at: minsAgo(60), cancelled_at: minsAgo(5) }), NOW) ?? "", /cancelled/);
});
test("submitUnavailableReason: a link still in date is open", () => {
  assert.equal(submitUnavailableReason(linkRow({ sent_at: new Date(NOW.getTime() - DAY).toISOString() }), NOW), null);
});
