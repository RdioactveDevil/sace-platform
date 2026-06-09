import { test } from "node:test";
import assert from "node:assert/strict";
import { repairLatexJson, parseLatexJson } from "./repair-latex-json.ts";

test("the reported bug: \\frac with a single backslash no longer becomes 'rac'", () => {
  // What the model emits (single backslash — invalid JSON, but `\f` is a valid
  // escape so a naive JSON.parse silently corrupts it).
  const raw = '[{"question":"common difference \\frac{1}{2}. 11th term?"}]';
  const naive = JSON.parse(raw) as { question: string }[];
  // Demonstrate the corruption the fix addresses: form feed + "rac".
  assert.equal(naive[0].question.includes("rac{1}{2}"), true);
  assert.equal(naive[0].question.includes("\\frac"), false);

  const fixed = parseLatexJson(raw) as { question: string }[];
  assert.equal(fixed[0].question, "common difference \\frac{1}{2}. 11th term?");
});

test("invalid-escape commands that used to throw now parse", () => {
  // `\sqrt`, `\times`, `\,` are invalid JSON escapes → naive JSON.parse throws,
  // losing the whole batch.
  const raw = '[{"q":"$\\sqrt{2} \\times 3$ and $\\int_0^1 x\\,dx$"}]';
  assert.throws(() => JSON.parse(raw));
  const fixed = parseLatexJson(raw) as { q: string }[];
  assert.equal(fixed[0].q, "$\\sqrt{2} \\times 3$ and $\\int_0^1 x\\,dx$");
});

test("each control-escape-initial command is repaired", () => {
  const cases: Array<[string, string]> = [
    ['{"v":"\\frac{a}{b}"}', "\\frac{a}{b}"],
    ['{"v":"\\theta + \\times"}', "\\theta + \\times"],
    ['{"v":"\\beta and \\binom{n}{k}"}', "\\beta and \\binom{n}{k}"],
    ['{"v":"x \\neq y, \\nabla f"}', "x \\neq y, \\nabla f"],
    ['{"v":"\\rho \\rightarrow 0"}', "\\rho \\rightarrow 0"],
  ];
  for (const [raw, expected] of cases) {
    assert.equal((parseLatexJson(raw) as { v: string }).v, expected, raw);
  }
});

test("genuine whitespace escapes are preserved", () => {
  // A real escaped newline between sentences must stay a newline, not become
  // a literal backslash-n.
  const raw = '{"v":"Step one.\\nStep two is \\frac{1}{2}."}';
  const parsed = parseLatexJson(raw) as { v: string };
  assert.equal(parsed.v, "Step one.\nStep two is \\frac{1}{2}.");
});

test("already-valid JSON is unchanged (idempotent)", () => {
  const valid = '[{"q":"$\\\\frac{1}{2}$ and a real newline\\nhere"}]';
  assert.equal(repairLatexJson(valid), valid);
  const parsed = parseLatexJson(valid) as { q: string }[];
  assert.equal(parsed[0].q, "$\\frac{1}{2}$ and a real newline\nhere");
});

test("real unicode escapes survive", () => {
  const raw = '{"v":"\\u00b0 then \\frac{1}{2}"}';
  assert.equal((parseLatexJson(raw) as { v: string }).v, "° then \\frac{1}{2}");
});

test("escaped quotes inside strings keep the parser in sync", () => {
  const raw = '{"v":"He said \\"\\frac{1}{2}\\" loudly"}';
  assert.equal((parseLatexJson(raw) as { v: string }).v, 'He said "\\frac{1}{2}" loudly');
});

test("dollar currency outside math is untouched", () => {
  const raw = '{"v":"It costs $5, slope is \\frac{1}{2}"}';
  assert.equal((parseLatexJson(raw) as { v: string }).v, "It costs $5, slope is \\frac{1}{2}");
});
