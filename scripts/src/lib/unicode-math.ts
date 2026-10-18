/**
 * Pure helpers for backfill-unicode-math.ts: find question text that writes
 * maths with Unicode symbols instead of LaTeX, and check that a rewrite only
 * changed formatting (same numbers, same words, renders in KaTeX).
 */

import katex from "katex";
import "katex/contrib/mhchem";

// Maths symbols that should be LaTeX inside $...$. Arrows and ° are left out:
// reaction arrows already render via the client's \ce auto-detection, and
// "25°C" reads fine as text.
const UNICODE_MATH_RE =
  /[√∛∜σμπθλΔΣΩαβγδεφωρτ≈≠≤≥±∓×÷−·∙∞∑∫∂∇⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ₀₁₂₃₄₅₆₇₈₉½¼¾⅓⅔]/;

const MATH_SEGMENT_RE = /\$\$([\s\S]+?)\$\$|\$(?=\S)([^$\n]*?\S)\$(?!\d)/g;

/** Text with every $...$ / $$...$$ segment removed. */
export function outsideMath(s: string): string {
  return s.replace(MATH_SEGMENT_RE, " ");
}

/** The contents of every $...$ / $$...$$ segment, with its display flag. */
export function mathSegments(s: string): { tex: string; display: boolean }[] {
  const out: { tex: string; display: boolean }[] = [];
  for (const m of s.matchAll(MATH_SEGMENT_RE)) {
    out.push(m[1] !== undefined ? { tex: m[1], display: true } : { tex: m[2], display: false });
  }
  return out;
}

// Greek letters naming something in prose ("α-cleavage", "β-sheet",
// "γ-aminobutyric acid") read fine as text and aren't maths.
const PROSE_GREEK_RE = /[α-ωΑ-Ω]-(?=[A-Za-z])/g;

/** True when the string has Unicode maths outside any $...$ segment. */
export function hasUnicodeMath(s: unknown): boolean {
  return typeof s === "string" && UNICODE_MATH_RE.test(outsideMath(s).replace(PROSE_GREEK_RE, ""));
}

// ─── fidelity check ──────────────────────────────────────────────────────────
//
// A formatting-only rewrite keeps every digit and every Latin letter, in the
// same order. Comparing them as ordered streams (rather than as bags of words
// and numbers) accepts notation that splits or regroups them — "pKa" →
// "\mathrm{p}K_a", "NOx" → "\ce{NO_x}", "CO32−" → "\ce{CO3^2-}" — while still
// catching any added, dropped or reordered character.

const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";
const VULGAR: Record<string, string> = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3" };
const SCRIPT_LETTERS: Record<string, string> = {
  "ⁿ": "n", "ⁱ": "i", "ₐ": "a", "ₑ": "e", "ₒ": "o", "ₓ": "x", "ₕ": "h", "ₖ": "k",
  "ₗ": "l", "ₘ": "m", "ₙ": "n", "ₚ": "p", "ₛ": "s", "ₜ": "t",
};

const SCRIPT_SIGNS: Record<string, string> = { "⁺": "+", "⁻": "-", "₊": "+", "₋": "-", "−": "-", "–": "-", "—": "-" };

// \sin, \log ... carry a word the original wrote in plain text ("sin x").
const FUNCTION_NAMES = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan",
  "sinh", "cosh", "tanh", "log", "ln", "exp", "lim", "max", "min", "det", "gcd",
]);

/** Map Unicode super/subscripts and vulgar fractions to plain characters. */
function plain(s: string): string {
  return [...s]
    .map((c) => {
      const sup = SUPERSCRIPTS.indexOf(c);
      if (sup !== -1) return String(sup);
      const sub = SUBSCRIPTS.indexOf(c);
      if (sub !== -1) return String(sub);
      return VULGAR[c] ?? SCRIPT_LETTERS[c] ?? SCRIPT_SIGNS[c] ?? c;
    })
    .join("");
}

/**
 * An "x" used as a multiplication sign ("0.0150 x 0.0164", "0.100 mol x 180
 * g/mol") may become \\times or stay as text; both compare as "×".
 */
function normaliseTimes(s: string): string {
  return s
    .replace(/(\d\$?)\s*x\s*(?=\$?[\d(])/g, "$1 × ")
    .replace(/([A-Za-z)]\$?)\s+x\s+(?=\$?[\d(])/g, "$1 × ");
}

/**
 * E-notation in the original ("2.46e-4") compares equal to scientific
 * notation ("2.46 \\times 10^{-4}"). Only the original is normalised: e-notation
 * left inside $...$ renders as "2.46e − 4", so a rewrite that keeps it fails.
 */
function normaliseENotation(s: string): string {
  return s.replace(/(\d(?:\.\d+)?)e([-+]?)(\d+)/g, (_, m: string, sign: string, exp: string) => `${m} × 10^${sign === "-" ? "-" : ""}${exp}`);
}

/** Drop LaTeX command names, keeping function names like \sin as their word. */
function stripCommands(s: string): string {
  return s.replace(/\\([A-Za-z]+)/g, (_, name: string) => (FUNCTION_NAMES.has(name) ? name : " "));
}

const digitStream = (s: string) => s.replace(/[^0-9]/g, "");
const letterStream = (s: string) => s.replace(/[^A-Za-z]/g, "").toLowerCase();
// Arrows ("->" in \ce, "<=>" for ⇌) are notation, not signs.
const signStream = (s: string) => s.replace(/<=>|<->|<-|->|=>/g, " ").replace(/[^-+=<>]/g, "");
const decimals = (s: string) => (s.match(/\d+\.\d+/g) ?? []).sort().join(" ");

/** Where two streams first differ, as "…before|after…" context from each side. */
function firstDifference(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const from = Math.max(0, i - 6);
  return `"…${a.slice(from, i + 6)}…" became "…${b.slice(from, i + 6)}…"`;
}

/**
 * Returns null when `after` is a formatting-only rewrite of `before`, else a
 * reason it was rejected.
 */
export function checkRewrite(before: string, after: string): string | null {
  if (/(?<!\\)\\[([]/.test(after)) return "uses \\( \\) or \\[ \\] delimiters";
  if (/\\[A-Za-z]/.test(outsideMath(after))) return "LaTeX command outside $...$";
  if (hasUnicodeMath(after)) return "Unicode maths left outside $...$";

  const b = stripCommands(plain(normaliseTimes(normaliseENotation(before))));
  const a = stripCommands(plain(normaliseTimes(after)));
  if (digitStream(b) !== digitStream(a) || decimals(b) !== decimals(a)) {
    return `numbers changed (${firstDifference(digitStream(b), digitStream(a))})`;
  }
  if (signStream(b) !== signStream(a)) {
    return `signs changed (${firstDifference(signStream(b), signStream(a))})`;
  }
  if (letterStream(b) !== letterStream(a)) {
    return `words changed (${firstDifference(letterStream(b), letterStream(a))})`;
  }

  for (const { tex, display } of mathSegments(after)) {
    try {
      katex.renderToString(tex, { throwOnError: true, displayMode: display, strict: false });
    } catch (err) {
      return `KaTeX can't render "${tex}": ${(err as Error).message.slice(0, 80)}`;
    }
  }
  return null;
}
