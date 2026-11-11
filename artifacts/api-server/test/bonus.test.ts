import { test } from "node:test";
import assert from "node:assert/strict";
import { BONUS_EVERY, bonusXP, isBonusPick } from "../src/lib/bonus";
import { currentStreak } from "../src/lib/streak";

test("about 1 in BONUS_EVERY questions is a bonus, fixed per student and question", () => {
  let picks = 0;
  const n = 6000;
  for (let i = 0; i < n; i++) if (isBonusPick("student-1", `q${i}`)) picks++;
  const rate = picks / n;
  assert.ok(rate > 1 / BONUS_EVERY - 0.02 && rate < 1 / BONUS_EVERY + 0.02, `rate ${rate}`);
  for (let i = 0; i < 50; i++) assert.equal(isBonusPick("student-1", `q${i}`), isBonusPick("student-1", `q${i}`));
  assert.equal(isBonusPick("", "q1"), false);
});

test("a bonus doubles XP for a right answer only", () => {
  assert.equal(bonusXP(36), 72);
  assert.equal(bonusXP(-36), -36);
  assert.equal(bonusXP(0), 0);
});

test("a streak covered by freezes still shows", () => {
  // 2026-10-24 10:00 in Adelaide; last active the 21st (2 days missed).
  const now = new Date("2026-10-23T23:30:00Z");
  assert.equal(currentStreak(6, "2026-10-21T01:00:00Z", now), 0);
  assert.equal(currentStreak(6, "2026-10-21T01:00:00Z", now, 2), 6);
  assert.equal(currentStreak(6, "2026-10-23T05:00:00Z", now), 6);
});
