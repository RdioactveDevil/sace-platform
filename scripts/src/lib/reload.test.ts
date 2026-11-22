import { test } from "node:test";
import assert from "node:assert/strict";
import { staleQuestionIds } from "./reload";

test("a reload retires what it didn't find again, including an older copy saved under different ids", () => {
  const keep = new Set(["ep_new_A1", "ep_new_A2"]);
  const old = [
    { id: "ep_new_A1", review_status: "approved" },
    { id: "ep_new_A3", review_status: "pending" }, // this load's id, not read this time
    // Loaded before the paper's label changed (Access 2024 was first saved as "VCAA 2024 Exam"):
    { id: "ep_old_A1", review_status: "approved" },
    { id: "ep_old_A2", review_status: "pending" },
    { id: "ep_old_A9", review_status: "rejected" }, // already kept from students
  ];
  assert.deepEqual(staleQuestionIds(old, keep), ["ep_new_A3", "ep_old_A1", "ep_old_A2"]);
});

test("the same row found by both lookups is listed once", () => {
  const row = { id: "ep_new_A3", review_status: "pending" };
  assert.deepEqual(staleQuestionIds([row, row], new Set()), ["ep_new_A3"]);
});
