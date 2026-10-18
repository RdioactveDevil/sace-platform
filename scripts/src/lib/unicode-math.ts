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

type Token = { type: "text"; content: string } | { type: "math"; display: boolean; content: string };

/**
 * Split on $...$ / $$...$$ exactly as the app's renderer does
 * (artifacts/gradefarm/src/lib/tokenizeMath.js): `\$` is a literal dollar, an
 * opening `$` must be followed by a non-space, and a closing `$` must follow a
 * non-space and not be followed by a digit, so "$3.50 and $4.50" stays text.
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let buf = "";
  const flush = () => { if (buf) { tokens.push({ type: "text", content: buf }); buf = ""; } };
  const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\" && text[i + 1] === "$") { buf += "$"; i += 2; continue; }
    if (ch === "$") {
      if (text[i + 1] === "$") {
        const end = text.indexOf("$$", i + 2);
        if (end !== -1) { flush(); tokens.push({ type: "math", display: true, content: text.slice(i + 2, end) }); i = end + 2; continue; }
        buf += "$$"; i += 2; continue;
      }
      const next = text[i + 1];
      if (next !== undefined && next !== "$" && !isSpace(next)) {
        let j = i + 1, close = -1;
        while (j < text.length) {
          if (text[j] === "\\" && text[j + 1] === "$") { j += 2; continue; }
          if (text[j] === "\n") break;
          if (text[j] === "$" && !isSpace(text[j - 1]) && !/[0-9]/.test(text[j + 1] ?? "")) { close = j; break; }
          j++;
        }
        if (close !== -1) { flush(); tokens.push({ type: "math", display: false, content: text.slice(i + 1, close) }); i = close + 1; continue; }
      }
      buf += "$"; i += 1; continue;
    }
    buf += ch; i += 1;
  }
  flush();
  return tokens;
}

/** Text with every $...$ / $$...$$ segment removed. */
export function outsideMath(s: string): string {
  return tokenize(s).map((t) => (t.type === "text" ? t.content : " ")).join("");
}

/** The contents of every $...$ / $$...$$ segment, with its display flag. */
export function mathSegments(s: string): { tex: string; display: boolean }[] {
  return tokenize(s).flatMap((t) => (t.type === "math" ? [{ tex: t.content, display: t.display }] : []));
}

// Greek letters naming something in prose ("α-cleavage", "β-sheet",
// "γ-aminobutyric acid", "β-1,4-glycosidic") read fine as text and aren't maths.
const PROSE_GREEK_RE = /[α-ωΑ-Ω]-(?=[A-Za-z0-9])/g;

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
  // superscript letters ("2ᵃ", "eˣ", "∫ₐᵇ")
  "ᵃ": "a", "ᵇ": "b", "ᶜ": "c", "ᵈ": "d", "ᵉ": "e", "ᶠ": "f", "ᵍ": "g", "ʰ": "h", "ⁱ": "i",
  "ʲ": "j", "ᵏ": "k", "ˡ": "l", "ᵐ": "m", "ⁿ": "n", "ᵒ": "o", "ᵖ": "p", "ʳ": "r", "ˢ": "s",
  "ᵗ": "t", "ᵘ": "u", "ᵛ": "v", "ʷ": "w", "ˣ": "x", "ʸ": "y", "ᶻ": "z",
  // subscript letters; ᵧ (a subscript gamma) is used for y in the bank ("vᵧ")
  "ₐ": "a", "ₑ": "e", "ₒ": "o", "ₓ": "x", "ₕ": "h", "ₖ": "k", "ₗ": "l", "ₘ": "m", "ₙ": "n",
  "ₚ": "p", "ₛ": "s", "ₜ": "t", "ᵢ": "i", "ᵣ": "r", "ᵤ": "u", "ᵥ": "v", "ⱼ": "j", "ᵧ": "y",
  // number sets → \mathbb{R} etc.
  "ℝ": "R", "ℕ": "N", "ℤ": "Z", "ℚ": "Q", "ℂ": "C",
  // ∛27 → \sqrt[3]{27}
  "∛": "3", "∜": "4",
};

const SCRIPT_SIGNS: Record<string, string> = {
  "⁺": "+", "⁻": "-", "⁼": "=", "₊": "+", "₋": "-", "₌": "=", "−": "-", "–": "-", "—": "-",
};

// Words the original may write in plain text for what LaTeX writes as a
// command: "sqrt(x)" → \sqrt{x}, "pi r^2" → \pi r^2, "Phi(2.5)" → \Phi(2.5),
// "30 deg" → 30^\circ. Dropped from both sides before comparing letters.
const NOTATION_WORDS_RE =
  /(?<![A-Za-z])(?:sqrt|cbrt|pi|theta|phi|alpha|beta|gamma|delta|lambda|mu|sigma|omega|rho|tau|epsilon|infinity|inf|deg|degrees?)(?![A-Za-z])|(?<![A-Za-z])integral(?=\s*[_(])/gi;

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
    .replace(/([A-Za-z)]\$?)\s+x\s+(?=\$?[\d(])/g, "$1 × ")
    // between function values: "P(A) x P(B)"
    .replace(/\)\s+x\s+(?=[A-Za-z]\()/g, ") × ");
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
  return s
    .replace(/\\(?:left|right|bigl|bigr|Bigl|Bigr)\./g, " ") // invisible delimiters, not decimal points
    .replace(/\\([A-Za-z]+)/g, (_, name: string) => (FUNCTION_NAMES.has(name) ? name : " "));
}

const digitStream = (s: string) => s.replace(/[^0-9]/g, "");
const letterStream = (s: string) => s.replace(NOTATION_WORDS_RE, " ").replace(/[^A-Za-z]/g, "").toLowerCase();
// Arrows ("->" in \ce, "<=>" for ⇌) are notation, not signs; so are ASCII
// spellings of ≤ ≥ ≠ ± that become \leq \geq \neq \pm.
const signStream = (s: string) =>
  s.replace(/<=>|<->|<-|->|=>|<=|>=|!=|\+\/-|\+-|-\+/g, " ").replace(/[^-+=<>]/g, "");
// Digits with each decimal point kept in place, so a moved point is caught:
// "25.76" vs "2.576". Ellipses ("0.333...") and sentence-final full stops are
// not decimal points.
const dottedDigits = (s: string) => s.replace(/[^0-9.]/g, "").replace(/\.{2,}/g, "").replace(/\.(?!\d)/g, "");

/**
 * Restore LaTeX commands whose backslash escape the model under-escaped in its
 * JSON ("\text" arriving as TAB + "ext"), for control characters the original
 * didn't contain.
 */
export function repairControlChars(after: string, before: string): string {
  const escapes: [string, string][] = [["\t", "t"], ["\f", "f"], ["\b", "b"], ["\r", "r"], ["\v", "v"]];
  let out = after;
  for (const [ctrl, letter] of escapes) {
    if (before.includes(ctrl) || !out.includes(ctrl)) continue;
    out = out.replace(new RegExp(`${ctrl}(?=[A-Za-z])`, "g"), `\\${letter}`);
  }
  return out;
}

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
  if (digitStream(b) !== digitStream(a)) {
    return `numbers changed (${firstDifference(digitStream(b), digitStream(a))})`;
  }
  if (dottedDigits(b) !== dottedDigits(a)) {
    return `decimal point moved (${firstDifference(dottedDigits(b), dottedDigits(a))})`;
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
