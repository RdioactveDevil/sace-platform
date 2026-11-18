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
  assert.match(err({ question: "Q", parts: [{ label: "a", text: "x", marks: 1 }, { label: "b", text: "", marks: 2 }] }), /Part 2 needs its question/);
  assert.match(err({ question: "", parts: [{ text: "", marks: 2 }] }), /needs its question/);
  assert.match(err({ question: "Q", parts: [{ text: "x", marks: 0 }] }), /at least one mark/);
});

test("a question without lettered parts keeps its text in the stem and an empty answer part", () => {
  const r = buildExtendedUpdate({ question: "Explain the viscosities.", parts: [{ label: "", text: "", marks: 5 }] });
  assert.ok("update" in r);
  assert.equal(r.update.question, "Explain the viscosities.");
  assert.deepEqual((r.update.parts as { text: string; marks: number }[]).map((p) => [p.text, p.marks]), [["", 5]]);
});

test("an empty stem stays empty: part (a)'s text isn't copied into it", () => {
  const r = buildExtendedUpdate({ question: "", parts: [{ label: "a", text: "For the functions below, determine dy/dx.", marks: 0 }, { label: "i", level: 2, text: "y = 3cos(2+7x)", marks: 2 }] });
  assert.ok("update" in r);
  assert.equal(r.update.question, "");
});

test("a part that is only a label introducing its sub-parts, like (c) before (i) and (ii), can be saved", () => {
  const parts = [
    { label: "a", text: "Find f'(x).", marks: 2 },
    { label: "c", level: 1, text: "", marks: 0 },
    { label: "i", level: 2, text: "Find the inflection points.", marks: 3 },
    { label: "ii", level: 2, text: "Are they stationary?", marks: 2 },
  ];
  const r = buildExtendedUpdate({ question: "The graph of f is shown.", parts });
  assert.ok("update" in r, JSON.stringify(r));
  assert.deepEqual((r.update.parts as { label: string; text: string }[]).map((p) => [p.label, p.text]), [["a", "Find f'(x)."], ["c", ""], ["i", "Find the inflection points."], ["ii", "Are they stationary?"]]);
  // Without sub-parts after it, or with marks of its own, it still needs its question.
  assert.match((buildExtendedUpdate({ question: "Q", parts: [{ label: "a", text: "x", marks: 1 }, { label: "c", text: "", marks: 0 }] }) as { error: string }).error, /Part 2 needs its question/);
  assert.match((buildExtendedUpdate({ question: "Q", parts: [{ label: "c", text: "", marks: 2 }, { label: "i", level: 2, text: "x", marks: 1 }] }) as { error: string }).error, /Part 1 needs its question/);
});
