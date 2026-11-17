import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReviewRequest } from "../src/lib/question-review.ts";

test("a review request names questions and what happens to them", () => {
  assert.deepEqual(parseReviewRequest({ ids: ["a", "b", "a"], status: "approved" }), { ids: ["a", "b"], status: "approved" });
  assert.deepEqual(parseReviewRequest({ ids: ["a"], status: "rejected" }), { ids: ["a"], status: "rejected" });
  assert.match((parseReviewRequest({ ids: ["a"], status: "live" }) as { error: string }).error, /status/);
  assert.match((parseReviewRequest({ ids: [], status: "approved" }) as { error: string }).error, /at least one/);
  assert.match((parseReviewRequest({ ids: [1, 2], status: "approved" }) as { error: string }).error, /text/);
  assert.match((parseReviewRequest({ ids: Array.from({ length: 1001 }, (_, i) => `q${i}`), status: "approved" }) as { error: string }).error, /1000/);
  assert.match((parseReviewRequest(null) as { error: string }).error, /status/);
});
