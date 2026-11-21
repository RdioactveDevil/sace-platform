import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeOutline } from "../src/lib/diagnostic-outline";

test("outline lists each topic with its subtopics", () => {
  assert.equal(
    scopeOutline([{ topic: "Functions", subtopics: ["Domain and range", "Inverse functions"] }, { topic: "Probability", subtopics: [] }]),
    "- Functions: Domain and range; Inverse functions\n- Probability",
  );
});

test("an empty scope gives an empty outline", () => {
  assert.equal(scopeOutline([]), "");
});
