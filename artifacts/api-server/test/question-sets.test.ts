import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSetUpdate } from "../src/lib/question-sets.ts";

const ok = (b: unknown) => (parseSetUpdate(b) as { update: unknown }).update;
const err = (b: unknown) => (parseSetUpdate(b) as { error: string }).error;

test("a question's set fields are checked; only what is sent changes", () => {
  assert.deepEqual(ok({ set_key: "ep_x_A29", set_position: 1, shared_info: "  A titration.  " }), { set_key: "ep_x_A29", set_position: 1, shared_info: "A titration." });
  assert.deepEqual(ok({ shared_image_url: "https://x/f.png" }), { shared_image_url: "https://x/f.png" });
  assert.deepEqual(ok({ shared_info: "", shared_image_url: null }), { shared_info: null, shared_image_url: null });
  // Unlinking clears both.
  assert.deepEqual(ok({ set_key: null, set_position: null }), { set_key: null, set_position: null });
  assert.match(err({ set_key: null, set_position: 2 }), /together/);
  assert.match(err({ set_position: 0 }), /1 to 20/);
  assert.match(err({ set_key: "" }), /set_key/);
  assert.match(err({ shared_image_url: "http://x" }), /https/);
  assert.match(err({}), /Nothing/);
});
