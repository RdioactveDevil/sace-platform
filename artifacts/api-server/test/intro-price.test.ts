import { test } from "node:test";
import assert from "node:assert/strict";
import { introFor } from "../src/routes/billing.ts";

test("the $2 first week is for a first weekly plan for one subject", () => {
  assert.equal(introFor(2, "week", 1, 7), 2);
  assert.equal(introFor(2, "month", 1, 27), 0, "monthly plans keep the free trial");
  assert.equal(introFor(2, "week", 2, 7), 0, "several subjects bill at the plan price");
  assert.equal(introFor(0, "week", 1, 7), 0, "0 turns it off");
  assert.equal(introFor(7, "week", 1, 7), 0, "it has to be cheaper than the week it replaces");
});
