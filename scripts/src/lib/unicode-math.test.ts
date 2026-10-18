import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRewrite, hasUnicodeMath, outsideMath } from "./unicode-math";

// The Central Limit Theorem question that prompted this backfill.
const SOLUTION =
  "Using the margin of error formula: ME = z(σ/√n). For 99% confidence, z ≈ 2.576. " +
  "Setting 1 = 2.576(10/√n), we get √n = 25.76, so n ≈ 664.";
const SOLUTION_LATEX =
  "Using the margin of error formula: $ME = z\\left(\\frac{\\sigma}{\\sqrt{n}}\\right)$. " +
  "For 99% confidence, $z \\approx 2.576$. Setting $1 = 2.576\\left(\\frac{10}{\\sqrt{n}}\\right)$, " +
  "we get $\\sqrt{n} = 25.76$, so $n \\approx 664$.";

test("finds Unicode maths outside $...$ only", () => {
  assert.equal(hasUnicodeMath(SOLUTION), true);
  assert.equal(hasUnicodeMath("margin of error of ±1"), true);
  assert.equal(hasUnicodeMath("area is x²"), true);
  assert.equal(hasUnicodeMath(SOLUTION_LATEX), false);
  assert.equal(hasUnicodeMath("Already $\\sigma = 2$ here"), false);
  assert.equal(hasUnicodeMath("n = 664"), false);
  assert.equal(hasUnicodeMath("Heat to 25°C"), false);
  assert.equal(hasUnicodeMath(null), false);
});

test("outsideMath keeps currency text", () => {
  assert.equal(outsideMath("It costs $5 and $10."), "It costs $5 and $10.");
});

test("accepts a formatting-only rewrite", () => {
  assert.equal(checkRewrite(SOLUTION, SOLUTION_LATEX), null);
  assert.equal(checkRewrite("n = 664", "$n = 664$"), null);
  assert.equal(checkRewrite("x² + 10³", "$x^2 + 10^3$"), null);
  assert.equal(checkRewrite("half is ½", "half is $\\frac{1}{2}$"), null);
  assert.equal(checkRewrite("find sin θ", "find $\\sin \\theta$"), null);
  assert.equal(checkRewrite("ethanol (CH₃CH₂OH)", "ethanol ($\\ce{CH3CH2OH}$)"), null);
  assert.equal(checkRewrite("NAD⁺ and SO₄²⁻", "$\\ce{NAD+}$ and $\\ce{SO4^2-}$"), null);
});

test("rejects a rewrite that changes a number", () => {
  const why = checkRewrite(SOLUTION, SOLUTION_LATEX.replace("25.76", "25.8"));
  assert.match(why ?? "", /numbers changed/);
});

test("rejects a rewrite that changes the wording", () => {
  const why = checkRewrite(SOLUTION, SOLUTION_LATEX.replace("we get", "we obtain"));
  assert.match(why ?? "", /words changed/);
});

test("rejects output KaTeX cannot render", () => {
  assert.match(checkRewrite("√n", "$\\sqrt{n$") ?? "", /KaTeX/);
});

test("rejects leftover Unicode maths, bare LaTeX and \\( \\) delimiters", () => {
  assert.match(checkRewrite("z ≈ 2", "z ≈ $2$") ?? "", /Unicode/);
  assert.match(checkRewrite("√n", "\\sqrt{n}") ?? "", /outside/);
  assert.match(checkRewrite("√n", "\\(\\sqrt{n}\\)") ?? "", /delimiters/);
});
