import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeOutline, subtopicFieldHint } from "../src/lib/diagnostic-outline";

test("outline lists each topic with its subtopics", () => {
  assert.equal(
    scopeOutline([{ topic: "Functions", subtopics: ["Domain and range", "Inverse functions"] }, { topic: "Probability", subtopics: [] }]),
    "- Functions: Domain and range; Inverse functions\n- Probability",
  );
});

test("an empty scope gives an empty outline", () => {
  assert.equal(scopeOutline([]), "");
});

test("with a curriculum outline, the subtopic field asks for the exact name from the list", () => {
  assert.equal(subtopicFieldHint("- Functions: Domain and range"), "<subtopic name, copied exactly from the list>");
});

test("without an outline (built-in subjects or the whole course), the subtopic field stays free-form", () => {
  assert.equal(subtopicFieldHint(undefined), "<specific subtopic or concept>");
  assert.equal(subtopicFieldHint(""), "<specific subtopic or concept>");
});
