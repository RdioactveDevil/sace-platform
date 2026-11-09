import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeResponse, revealOf, withoutAnswers, calcXP, partMarksXP, cleanResponse, questionType } from "../src/lib/grade.ts";
import { seal, unseal } from "../src/lib/sealed.ts";

process.env.REMEDIATION_SIGNING_SECRET ||= "test-secret";

test("marks every question type the way the app used to", () => {
  assert.equal(gradeResponse({ id: "a", answer_index: 2 }, 2), true);
  assert.equal(gradeResponse({ id: "a", answer_index: 2 }, "2"), false);
  assert.equal(gradeResponse({ id: "a", answer_index: 0 }, null), false);
  assert.equal(gradeResponse({ id: "b", question_type: "multi_select", answer_indices: [0, 3] }, [3, 0]), true);
  assert.equal(gradeResponse({ id: "b", question_type: "multi_select", answer_indices: "[0,3]" }, [0]), false);
  assert.equal(gradeResponse({ id: "c", question_type: "numeric", answer: 9.81, tolerance: 0.01 }, "9.8"), true);
  assert.equal(gradeResponse({ id: "c", question_type: "numeric", answer: 9.81, tolerance: 0 }, "9.8"), false);
  assert.equal(gradeResponse({ id: "d", question_type: "short_text", accept: ["Mitochondria"] }, "  mitochondria "), true);
  assert.equal(gradeResponse({ id: "d", question_type: "short_text", accept: ["NaCl"], case_sensitive: true }, "nacl"), false);
  assert.equal(gradeResponse({ id: "e", question_type: "order", items: ["x", "y", "z"] }, ["x", "y", "z"]), true);
  assert.equal(gradeResponse({ id: "e", question_type: "order", items: ["x", "y", "z"] }, ["y", "x", "z"]), false);
  assert.equal(gradeResponse({ id: "f", question_type: "hotspot", hotspots: [{}, { correct: true }] }, 1), true);
  assert.equal(gradeResponse({ id: "g", question_type: "image_label", markers: [{ answer: "A" }, { answer: "B" }] }, ["A", "B"]), true);
  // Written answers are marked against their scheme, never by key.
  assert.equal(gradeResponse({ id: "h", question_type: "marked", solution: "x" }, "x"), false);
  assert.equal(questionType({ question_type: "nonsense" }), "mcq");
});

test("a student's copy has no answers; the reveal has them", () => {
  const q = { id: "q", question: "?", options: ["a", "b"], answer_index: 1, solution: "because", tip: "t", items: ["1", "2", "3"], parts: [{ text: "p", marks: 2, solution: "s" }] };
  const shown = withoutAnswers(q);
  assert.equal("answer_index" in shown, false);
  assert.equal("solution" in shown, false);
  assert.equal("tip" in shown, false);
  assert.deepEqual([...(shown.items as string[])].sort(), ["1", "2", "3"]);
  assert.deepEqual(shown.parts, [{ text: "p", marks: 2 }]);
  const reveal = revealOf(q);
  assert.equal(reveal.answer_index, 1);
  assert.equal(reveal.solution, "because");
  assert.equal("question" in reveal, false);
});

test("XP: runs of right answers earn more, wrong answers cost the base", () => {
  assert.equal(calcXP(true, 3, 0), 36);
  assert.equal(calcXP(true, 3, 5), 54);
  assert.equal(calcXP(true, 3, 40), 72);
  assert.equal(calcXP(false, 3, 9), -36);
  assert.equal(calcXP(true, 99, 0), 60);
  assert.equal(partMarksXP(2, 1, 4), 6);
  assert.equal(partMarksXP(1, 1, 100), 1);
});

test("responses are kept small and plain", () => {
  assert.equal(cleanResponse(Infinity), null);
  assert.equal(cleanResponse({ evil: true }), null);
  assert.equal((cleanResponse("x".repeat(30_000)) as string).length, 20_000);
  assert.deepEqual(cleanResponse([1, "a", { b: 1 }]), [1, "a", null]);
});

test("sealed tokens can't be read or changed, and are tied to their purpose", () => {
  const token = seal("variant", { answer_index: 2, uid: "u" });
  assert.equal(token.includes("answer_index"), false);
  assert.equal(Buffer.from(token, "base64url").toString("utf8").includes("answer_index"), false);
  assert.deepEqual(unseal("variant", token), { answer_index: 2, uid: "u" });
  assert.equal(unseal("batch", token), null);
  const raw = Buffer.from(token, "base64url");
  raw[raw.length - 1] ^= 1;
  assert.equal(unseal("variant", raw.toString("base64url")), null);
  assert.equal(unseal("variant", "nonsense"), null);
});
