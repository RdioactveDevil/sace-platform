import { test } from "node:test";
import assert from "node:assert/strict";
import { lastFreeMessageNote } from "../src/lib/ai-quota.ts";

test("Titan wraps up only on the last free message", () => {
  assert.equal(lastFreeMessageNote(null), "");
  assert.equal(lastFreeMessageNote({ chat_used: 4, chat_limit: 10 }), "");
  assert.equal(lastFreeMessageNote({ chat_used: 10, chat_limit: null }), "");
  assert.match(lastFreeMessageNote({ chat_used: 10, chat_limit: 10 }), /last free Titan message/);
});
