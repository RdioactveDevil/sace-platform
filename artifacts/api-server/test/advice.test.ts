import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAdvice, plainText, mathSegments } from "../src/lib/advice.ts";

const Q = "An excess of marble chips was added to $50.0\\ \\text{mL}$ of hydrochloric acid. Calculate the average rate of consumption of hydrochloric acid, in $\\text{mol L}^{-1}\\ \\text{s}^{-1}$.";

test("plain text blanks maths but keeps offsets", () => {
  assert.equal(plainText(Q).length, Q.length);
  assert.deepEqual(mathSegments(Q), ["$50.0\\ \\text{mL}$", "$\\text{mol L}^{-1}\\ \\text{s}^{-1}$"]);
  assert.equal(plainText(Q).includes("mL"), false);
});

test("notes must quote the question, outside maths or as a whole maths segment", () => {
  const a = validateAdvice(Q, {
    notes: [
      { quote: "An excess of marble chips", mark: "underline", note: "acid runs out first" },
      { quote: "$50.0\\ \\text{mL}$", mark: "circle", note: "= 0.0500 L" },
      { quote: "50.0", mark: "circle", note: "inside maths: dropped" },
      { quote: "marble chips was", mark: "underline", note: "overlaps: dropped" },
      { quote: "not in the question", mark: "box", note: "dropped" },
      { quote: "average rate of consumption", mark: "wiggle", note: "unknown mark becomes underline" },
      { quote: "hydrochloric acid", mark: "box", note: "" },
    ],
    cells: [{ row: 0, col: 1, note: "start" }, { row: 9, col: 0 }, { row: 0, col: 1 }],
    steps: ["one", "", 3, "two"],
  }, { rows: [["0.0", "152.315"], ["60.0", "151.875"]] });
  assert.deepEqual(a.notes.map((n) => n.quote), ["An excess of marble chips", "$50.0\\ \\text{mL}$", "average rate of consumption"]);
  assert.equal(a.notes[2].mark, "underline");
  assert.deepEqual(a.cells, [{ row: 0, col: 1, note: "start" }]);
  assert.deepEqual(a.steps, ["one", "two"]);
});
