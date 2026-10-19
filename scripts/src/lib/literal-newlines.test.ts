import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreLiteralNewlines } from "./literal-newlines";

test("turns literal \\n into line breaks", () => {
  // The live question that prompted this backfill.
  assert.equal(
    restoreLiteralNewlines("Look at this sequence: $3, 6, 9, 12, 15, \\ldots$\\n\\nWhich rule describes the $n$th term?"),
    "Look at this sequence: $3, 6, 9, 12, 15, \\ldots$\n\nWhich rule describes the $n$th term?",
  );
  assert.equal(restoreLiteralNewlines("Step 1\\n2x = 4"), "Step 1\n2x = 4");
  assert.equal(restoreLiteralNewlines("end\\n"), "end\n");
});

test("leaves LaTeX \\n-commands and row breaks alone", () => {
  for (const s of [
    "$x \\neq 0$",
    "$\\nabla f$",
    "$\\frac{1}{2}\\nu$",
    "$\\begin{matrix} a \\\\ b \\end{matrix}$",
    "$a \\\\ n$",
    "No backslashes here",
  ]) {
    assert.equal(restoreLiteralNewlines(s), s);
  }
});
