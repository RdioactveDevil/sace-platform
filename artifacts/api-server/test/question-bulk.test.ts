import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBulkRequest, conceptTag, chunks, BULK_MAX_IDS } from "../src/lib/question-bulk.ts";

const base = { curriculumId: "c1", ids: ["q1", "q2", "q2", ""] };

test("a bulk request needs a known action, a subject and some questions", () => {
  assert.deepEqual(parseBulkRequest({ ...base, action: "hide" }), { action: "hide", curriculumId: "c1", ids: ["q1", "q2"] });
  assert.match((parseBulkRequest({ ...base, action: "nuke" }) as { error: string }).error, /action must be one of/);
  assert.match((parseBulkRequest({ action: "hide", ids: ["q1"] }) as { error: string }).error, /curriculumId/);
  assert.match((parseBulkRequest({ ...base, action: "hide", ids: [] }) as { error: string }).error, /at least one/);
  const tooMany = Array.from({ length: BULK_MAX_IDS + 1 }, (_, i) => `q${i}`);
  assert.match((parseBulkRequest({ ...base, action: "hide", ids: tooMany }) as { error: string }).error, /Up to/);
});

test("moving needs a subtopic, and difficulty must be 1 to 5", () => {
  assert.match((parseBulkRequest({ ...base, action: "move" }) as { error: string }).error, /subtopic/);
  assert.equal((parseBulkRequest({ ...base, action: "move", subtopicId: "s1" }) as { subtopicId: string }).subtopicId, "s1");
  assert.equal((parseBulkRequest({ ...base, action: "difficulty", difficulty: "4" }) as { difficulty: number }).difficulty, 4);
  for (const d of [0, 6, 2.5, "hard", undefined]) {
    assert.match((parseBulkRequest({ ...base, action: "difficulty", difficulty: d }) as { error: string }).error, /1 to 5/);
  }
});

test("moved questions get the concept tag new ones would", () => {
  assert.equal(conceptTag("VCE Methods", "Quadratics", "The discriminant"), "vce methods|quadratics|the discriminant");
  assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
