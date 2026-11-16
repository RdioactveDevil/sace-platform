import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExtendedUpdate } from "../src/lib/extended-edit.ts";

test("an exam question's parts are checked and totalled", () => {
  const r = buildExtendedUpdate({
    question: " A ball is thrown upwards. ",
    parts: [
      { label: "(a)", level: 1, text: "Find the time to the top.", marks: 2, solution: "t = 1.5 s" },
      { label: "b.", level: 2, text: "Find the height.", marks: "3", solution: "h = 11 m", image_url: "https://x/y.png" },
    ],
  }) as { update: Record<string, unknown> };
  assert.equal(r.update.question, "A ball is thrown upwards.");
  assert.equal(r.update.total_marks, 5);
  assert.equal(r.update.solution, "a. t = 1.5 s\nb. h = 11 m");
  assert.deepEqual((r.update.parts as { label: string }[]).map((p) => p.label), ["a", "b"]);
  assert.equal((r.update.parts as { image_url: string | null }[])[1].image_url, "https://x/y.png");
});

test("bad parts are refused", () => {
  const err = (b: unknown) => (buildExtendedUpdate(b) as { error: string }).error;
  assert.match(err({ question: "Q", parts: [] }), /at least one part/);
  assert.match(err({ question: "Q", parts: [{ text: "x", marks: -1 }] }), /marks/);
  assert.match(err({ question: "Q", parts: [{ text: "x", marks: 1.5 }] }), /marks/);
  assert.match(err({ question: "Q", parts: [{ text: "", marks: 2 }] }), /needs its question/);
  assert.match(err({ question: "Q", parts: [{ text: "x", marks: 0 }] }), /at least one mark/);
});
