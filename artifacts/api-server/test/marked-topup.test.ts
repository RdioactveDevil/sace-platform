import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MARKED_TOPUP_DAILY_LIMIT, MARKED_TOPUP_LOW_WATER, MARKED_TOPUP_SERVE_MAX,
  findSubtopic, markedTopupLimit, planMarkedTopup, topupDifficulty,
} from "../src/lib/marked-topup.ts";
import { withoutAnswers } from "../src/lib/grade.ts";

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}` }));

test("the daily allowance comes from the subject's features", () => {
  assert.equal(markedTopupLimit({ marked_topup_daily_limit: 9 }), 9);
  assert.equal(markedTopupLimit({ marked_topup_daily_limit: 0 }), 0);
  assert.equal(markedTopupLimit({ marked_topup_daily_limit: 4.7 }), 4);
  assert.equal(markedTopupLimit({ marked_topup_daily_limit: "9" }), DEFAULT_MARKED_TOPUP_DAILY_LIMIT);
  assert.equal(markedTopupLimit({ marked_topup_daily_limit: -1 }), DEFAULT_MARKED_TOPUP_DAILY_LIMIT);
  assert.equal(markedTopupLimit({}), DEFAULT_MARKED_TOPUP_DAILY_LIMIT);
  assert.equal(markedTopupLimit(null), DEFAULT_MARKED_TOPUP_DAILY_LIMIT);
});

test("the subtopic is found by name, ignoring case and spacing", () => {
  const subs = [{ id: "a", name: "Rates of reaction" }, { id: "b", name: "Equilibrium  constants" }];
  assert.equal(findSubtopic(subs, "rates of reaction")?.id, "a");
  assert.equal(findSubtopic(subs, " Equilibrium constants ")?.id, "b");
  assert.equal(findSubtopic(subs, "Redox"), null);
  assert.equal(findSubtopic(subs, "  "), null);
  assert.equal(findSubtopic(null, "Redox"), null);
});

test("a subtopic with no written answers gets none written", () => {
  assert.deepEqual(planMarkedTopup([], new Set()), { action: "none" });
});

test("more are written only once the student has nearly used them up", () => {
  const bank = ids(5);
  // 3 left unanswered: send those back, write nothing.
  assert.deepEqual(planMarkedTopup(bank, new Set(["q1", "q2"])), { action: "serve", ids: ["q3", "q4", "q5"] });
  // 2 left (the low-water mark): write more.
  assert.equal(MARKED_TOPUP_LOW_WATER, 2);
  assert.deepEqual(planMarkedTopup(bank, new Set(["q1", "q2", "q3"])), { action: "generate" });
  // All done: write more.
  assert.deepEqual(planMarkedTopup(bank, new Set(bank.map((q) => q.id))), { action: "generate" });
});

test("a student with plenty left gets a handful back, newest first", () => {
  const served = planMarkedTopup(ids(20), new Set());
  assert.equal(served.action, "serve");
  assert.deepEqual(served.action === "serve" ? served.ids : [], ids(MARKED_TOPUP_SERVE_MAX).map((q) => q.id));
});

test("difficulty is 1 to 5, or mixed", () => {
  assert.equal(topupDifficulty(4), 4);
  assert.equal(topupDifficulty("3"), 3);
  assert.equal(topupDifficulty(2.6), 3);
  assert.equal(topupDifficulty("mixed"), "mixed");
  assert.equal(topupDifficulty(null), "mixed");
  assert.equal(topupDifficulty(undefined), "mixed");
  assert.equal(topupDifficulty(0), "mixed");
  assert.equal(topupDifficulty(9), "mixed");
  assert.equal(topupDifficulty("hard"), "mixed");
});

test("a new written-answer question reaches a student without its answer", () => {
  const row = {
    id: "ai_marked_1", question_type: "marked", question: "Explain why…", total_marks: 3,
    marking_scheme: [{ marks: 1, point: "…" }], solution: "Because…", tip: null, subtopic: "Redox",
  };
  const shown = withoutAnswers(row);
  assert.equal(shown.question, "Explain why…");
  assert.equal(shown.total_marks, 3);
  assert.equal("marking_scheme" in shown, false);
  assert.equal("solution" in shown, false);
});
