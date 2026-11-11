import { test } from "node:test";
import assert from "node:assert/strict";
import { freeMarkedLimit, startOfLocalDay, DEFAULT_FREE_DAILY_MARKED } from "../src/lib/marked-quota.ts";

test("the free marked-answer allowance comes from the pricing settings", () => {
  assert.equal(freeMarkedLimit({ free_daily_marked_answers: 3 }), 3);
  assert.equal(freeMarkedLimit({ free_daily_marked_answers: 0 }), 0);
  assert.equal(freeMarkedLimit({ free_daily_marked_answers: 2.9 }), 2);
  assert.equal(freeMarkedLimit({ free_daily_marked_answers: "" }), DEFAULT_FREE_DAILY_MARKED);
  assert.equal(freeMarkedLimit({ free_daily_marked_answers: -1 }), DEFAULT_FREE_DAILY_MARKED);
  assert.equal(freeMarkedLimit({}), DEFAULT_FREE_DAILY_MARKED);
  assert.equal(freeMarkedLimit(null), DEFAULT_FREE_DAILY_MARKED);
});

test("the day starts at midnight in Adelaide", () => {
  // Winter (UTC+9:30): 3 July, 10:15:30 in Adelaide.
  assert.equal(startOfLocalDay(new Date("2026-07-03T00:45:30.400Z")).toISOString(), "2026-07-02T14:30:00.000Z");
  // Summer (UTC+10:30): 11 November, 23:59 in Adelaide is still the 11th.
  assert.equal(startOfLocalDay(new Date("2026-11-11T13:29:00Z")).toISOString(), "2026-11-10T13:30:00.000Z");
  // A minute later it's the 12th.
  assert.equal(startOfLocalDay(new Date("2026-11-11T13:30:00Z")).toISOString(), "2026-11-11T13:30:00.000Z");
});
