import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRewrite, hasUnicodeMath, outsideMath, repairControlChars } from "./unicode-math";

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

// Real rewrites from the first production dry run that were accepted — they must stay accepted.
test("keeps accepting the dry run's good rewrites", () => {
  const accepted: [string, string][] = [
    ["Mass number = protons + neutrons. Carbon has 6 protons. 14 − 6 = 8 neutrons.",
      "Mass number = protons + neutrons. Carbon has 6 protons. $14 - 6 = 8$ neutrons."],
    ["How many moles are in 44g of CO₂? (Molar mass = 44 g/mol)",
      "How many moles are in $44$g of $\\ce{CO2}$? (Molar mass $= 44$ g/mol)"],
    ["n = m ÷ M. The three-way triangle: n, m, M.", "$n = m \\div M$. The three-way triangle: $n$, $m$, $M$."],
    ["Mg is oxidised (0→+2), H is reduced (+1→0). Electron transfer = redox.",
      "$\\ce{Mg}$ is oxidised ($0 \\to +2$), $\\ce{H}$ is reduced ($+1 \\to 0$). Electron transfer = redox."],
    ["slope ≈ 0.0725 $ppm^{-1}$", "slope $\\approx 0.0725\\ \\text{ppm}^{-1}$"],
    ["CₙH₂ₙ₊₂O", "$\\ce{C_{n}H_{2n+2}O}$"],
    ["C₆H₈O₆ → C₆H₆O₆ + 2H^+ + 2e^-", "$\\ce{C6H8O6 -> C6H6O6 + 2H+ + 2e-}$"],
  ];
  for (const [before, after] of accepted) assert.equal(checkRewrite(before, after), null, before);
});

// Rejected in the first dry run although only the notation changed.
test("accepts notation that regroups letters or digits", () => {
  assert.equal(checkRewrite("above the pKa of the carboxylic acid (~4.2)", "above the $\\mathrm{p}K_a$ of the carboxylic acid (~4.2)"), null);
  assert.equal(checkRewrite("methylamine (pKaH ~10.64)", "methylamine ($\\mathrm{p}K_{aH}$ ~10.64)"), null);
  assert.equal(checkRewrite("They form stable compounds with CO and NOx", "They form stable compounds with $\\ce{CO}$ and $\\ce{NO_x}$"), null);
  assert.equal(checkRewrite("carbonate ions (CO32−) and Ca2+", "carbonate ions ($\\ce{CO3^2-}$) and $\\ce{Ca^2+}$"), null);
});

test("leaves Greek letters that name things in prose alone", () => {
  const before = "α-cleavage gives CH₃CO^+ at m/z = 43";
  assert.equal(hasUnicodeMath("GABA (γ-aminobutyric acid) is a β-amino acid"), false);
  assert.equal(checkRewrite(before, "α-cleavage gives $\\ce{CH3CO+}$ at $m/z = 43$"), null);
});

test("accepts e-notation and an x multiplication sign written as LaTeX", () => {
  // s2_023 from the second dry run: "e-4" inside $...$ renders as "e minus 4".
  assert.equal(
    checkRewrite(
      "Moles KMnO4 = 0.0150 x 0.0164 = 2.46e-4 mol; = 6.15e-4/0.025",
      "Moles $\\ce{KMnO4}$ = $0.0150 \\times 0.0164 = 2.46 \\times 10^{-4}$ mol; = $\\frac{6.15 \\times 10^{-4}}{0.025}$",
    ),
    null,
  );
  assert.equal(checkRewrite("1.2e5 Pa", "$1.2 \\times 10^{5}$ Pa"), null);
  // s2_098 from the third dry run: "x" after a unit
  assert.equal(
    checkRewrite("salicylic acid is limiting, and 0.100 mol x 180 g/mol = 18.0 g aspirin",
      "salicylic acid is limiting, and $0.100 \\text{ mol} \\times 180 \\text{ g/mol} = 18.0 \\text{ g}$ aspirin"),
    null,
  );
  // ...or the model may leave that x as text between formulas
  assert.equal(checkRewrite("0.100 mol x 180 g/mol", "$0.100$ mol x $180$ g/mol"), null);
});

test("still rejects changed, added or moved digits", () => {
  // a wrong exponent in the scientific-notation rewrite
  assert.match(checkRewrite("2.46e-4 mol", "$2.46 \\times 10^{-3}$ mol") ?? "", /numbers changed/);
  // a 10 that wasn't in the original
  assert.match(checkRewrite("2.46 mol", "$2.46 \\times 10$ mol") ?? "", /numbers changed/);
  // a moved decimal point keeps the same digits
  assert.match(checkRewrite("√n = 25.76", "$\\sqrt{n} = 2.576$") ?? "", /decimal point moved/);
  // swapped digits
  assert.match(checkRewrite("14 − 6 = 8", "$14 - 8 = 6$") ?? "", /numbers changed/);
  // a changed short word the old 3-letter rule ignored
  assert.match(checkRewrite("x is 5", "$x$ at 5") ?? "", /words changed/);
});

test("rejects flipped or dropped signs", () => {
  assert.match(checkRewrite("14 − 6 = 8", "$14 + 6 = 8$") ?? "", /signs changed/);
  assert.match(checkRewrite("2.46e-4 mol", "$2.46 \\times 10^{4}$ mol") ?? "", /signs changed/);
  assert.match(checkRewrite("x ≤ 5 and y > 2", "$x \\leq 5$ and $y < 2$") ?? "", /signs changed/);
  // arrows and ion charges are notation, not sign changes
  assert.equal(checkRewrite("CO32− + H+ ⇌ HCO3−", "$\\ce{CO3^2- + H+ <=> HCO3-}$"), null);
  assert.equal(checkRewrite("SO₄²⁻ and CₙH₂ₙ₊₂", "$\\ce{SO4^2-}$ and $\\ce{C_{n}H_{2n+2}}$"), null);
});

// Rejected in the full apply run although only the notation changed (real "before" text).
test("handles escaped dollar signs in money questions", () => {
  const before = "Brand A: $3.50 ÷ 500 = $0.007 per mL. Brand B: $4.50 ÷ 750 = $0.006 per mL.";
  assert.equal(hasUnicodeMath(before), true);
  assert.equal(checkRewrite(before, "Brand A: $\\$3.50 \\div 500 = \\$0.007$ per mL. Brand B: $\\$4.50 \\div 750 = \\$0.006$ per mL."), null);
  assert.equal(checkRewrite(before, "Brand A: \\$3.50 $\\div$ 500 = \\$0.007 per mL. Brand B: \\$4.50 $\\div$ 750 = \\$0.006 per mL."), null);
  assert.equal(outsideMath("It costs \\$5 and $x$ more"), "It costs $5 and   more");
});

test("accepts plain-text maths notation written as LaTeX", () => {
  const cases: [string, string][] = [
    ["sqrt(16) = 4", "$\\sqrt{16} = 4$"],
    ["Area = pi r^2 = 25pi cm²", "Area $= \\pi r^2 = 25\\pi \\text{ cm}^2$"],
    ["504 = 2ᵃ × 3ᵇ × 7ᶜ", "$504 = 2^a \\times 3^b \\times 7^c$"],
    ["f(x) = eˣ", "$f(x) = e^x$"],
    ["∫ₐᵇ f(x) dx", "$\\int_a^b f(x)\\,dx$"],
    ["∛27 = 3", "$\\sqrt[3]{27} = 3$"],
    ["x ∈ ℝ", "$x \\in \\mathbb{R}$"],
    ["P(|Z|<=2.5) = 2*Phi(2.5)-1 ≈ 98.76%", "$P(|Z| \\leq 2.5) = 2\\Phi(2.5) - 1 \\approx 98.76\\%$"],
    ["v(t)=20-2t>=0, so distance = integral_0^10 (20-2t)dt", "$v(t) = 20 - 2t \\geq 0$, so distance $= \\int_0^{10} (20 - 2t)\\,dt$"],
    ["dy/dx|ₓ₌₁ = 2a(1) = 6", "$\\left.\\frac{dy}{dx}\\right|_{x=1} = 2a(1) = 6$"],
    ["tan 30 deg × 5 m", "$\\tan 30^\\circ \\times 5$ m"],
    ["P(A) x P(B) = 0.06", "$P(A) \\times P(B) = 0.06$"],
    ["±2 or +/-2", "$\\pm 2$ or $\\pm 2$"],
  ];
  for (const [before, after] of cases) assert.equal(checkRewrite(before, after), null, before);
});

test("compares decimal points by position, not as separate numbers", () => {
  assert.equal(checkRewrite("So x₀.₈₀³ = 0.80, giving x₀.₈₀ ≈ 0.928.", "So $x_{0.80}^3 = 0.80$, giving $x_{0.80} \\approx 0.928$."), null);
  assert.equal(checkRewrite("P = ∫₀.₅¹ 3x² dx = 0.875", "$P = \\int_{0.5}^{1} 3x^2\\,dx = 0.875$"), null);
  assert.equal(checkRewrite("P is at 0.3̅ (0.333...), which is 1/3", "P is at $0.\\overline{3}$ ($0.333\\ldots$), which is $\\frac{1}{3}$"), null);
});

test("treats Greek before a digit as prose", () => {
  assert.equal(hasUnicodeMath("joined by a β-1,4-glycosidic bond"), false);
});

test("repairs \\text that arrived as a tab", () => {
  const before = "600 ÷ 4 = 150 mL";
  const broken = "$600 \\div 4 = 150\t" + "ext{ mL}$";
  assert.match(checkRewrite(before, broken) ?? "", /words changed/);
  const fixed = repairControlChars(broken, before);
  assert.equal(fixed, "$600 \\div 4 = 150\\text{ mL}$");
  assert.equal(checkRewrite(before, fixed), null);
  // a tab the original already had is left alone
  assert.equal(repairControlChars("a\tb", "x\ty"), "a\tb");
});
