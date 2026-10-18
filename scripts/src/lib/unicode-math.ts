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

/** True when the string has Unicode maths outside any $...$ segment. */
export function hasUnicodeMath(s: unknown): boolean {
  return typeof s === "string" && UNICODE_MATH_RE.test(outsideMath(s));
}

// ─── fidelity check ──────────────────────────────────────────────────────────

const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";
const VULGAR: Record<string, string> = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3" };

// \sin, \log ... carry a word the original wrote in plain text ("sin x").
const FUNCTION_NAMES = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan",
  "sinh", "cosh", "tanh", "log", "ln", "exp", "lim", "max", "min", "det", "gcd",
]);

function plainDigits(s: string): string {
  return s
    .replace(new RegExp(`[${SUPERSCRIPTS}]+`, "g"), (run) => ` ${[...run].map((c) => SUPERSCRIPTS.indexOf(c)).join("")} `)
    .replace(new RegExp(`[${SUBSCRIPTS}]+`, "g"), (run) => ` ${[...run].map((c) => SUBSCRIPTS.indexOf(c)).join("")} `)
    .replace(/[½¼¾⅓⅔]/g, (c) => ` ${VULGAR[c]} `);
}

function numbers(s: string): string[] {
  return (plainDigits(s).match(/\d+(?:\.\d+)?/g) ?? []).sort();
}

function words(s: string, isLatex: boolean): string[] {
  let t = s;
  if (isLatex) {
    t = t.replace(/\\([A-Za-z]+)/g, (_, name: string) => (FUNCTION_NAMES.has(name) ? ` ${name} ` : " "));
  }
  return (t.match(/[A-Za-z]{3,}/g) ?? []).map((w) => w.toLowerCase()).sort();
}

function diff(a: string[], b: string[]): string {
  const counts = new Map<string, number>();
  for (const x of a) counts.set(x, (counts.get(x) ?? 0) + 1);
  for (const x of b) counts.set(x, (counts.get(x) ?? 0) - 1);
  const lost = [...counts].filter(([, n]) => n > 0).map(([k]) => k);
  const added = [...counts].filter(([, n]) => n < 0).map(([k]) => k);
  return [lost.length ? `lost ${lost.join(", ")}` : "", added.length ? `added ${added.join(", ")}` : ""]
    .filter(Boolean)
    .join("; ");
}

/**
 * Returns null when `after` is a formatting-only rewrite of `before`, else a
 * reason it was rejected.
 */
export function checkRewrite(before: string, after: string): string | null {
  if (/(?<!\\)\\[([]/.test(after)) return "uses \\( \\) or \\[ \\] delimiters";
  if (/\\[A-Za-z]/.test(outsideMath(after))) return "LaTeX command outside $...$";
  if (hasUnicodeMath(after)) return "Unicode maths left outside $...$";

  const n = diff(numbers(before), numbers(after));
  if (n) return `numbers changed (${n})`;
  const w = diff(words(before, false), words(after, true));
  if (w) return `words changed (${w})`;

  for (const { tex, display } of mathSegments(after)) {
    try {
      katex.renderToString(tex, { throwOnError: true, displayMode: display, strict: false });
    } catch (err) {
      return `KaTeX can't render "${tex}": ${(err as Error).message.slice(0, 80)}`;
    }
  }
  return null;
}
