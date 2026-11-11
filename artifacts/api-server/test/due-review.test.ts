import { test } from "node:test";
import assert from "node:assert/strict";
import { isDueReview } from "../src/lib/due-review";

const NOW = Date.parse("2026-11-11T10:00:00Z");

test("a question answered before whose review time has passed is due", () => {
  assert.equal(isDueReview({ attempts: 2, next_review: "2026-11-11T09:00:00Z" }, NOW), true);
  assert.equal(isDueReview({ attempts: 1, next_review: "2026-11-11T10:00:00Z" }, NOW), true);
});

test("anything else is not: a later review, never answered, no schedule, no row", () => {
  assert.equal(isDueReview({ attempts: 2, next_review: "2026-11-12T09:00:00Z" }, NOW), false);
  assert.equal(isDueReview({ attempts: 0, next_review: "2026-11-10T09:00:00Z" }, NOW), false);
  assert.equal(isDueReview({ attempts: 3, next_review: null }, NOW), false);
  assert.equal(isDueReview({ attempts: 3, next_review: "not a date" }, NOW), false);
  assert.equal(isDueReview(null, NOW), false);
});
