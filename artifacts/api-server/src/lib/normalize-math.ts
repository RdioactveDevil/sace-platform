/**
 * Normalises mathematical text into KaTeX-renderable LaTeX.
 *
 * The question bank historically stored maths in three inconsistent forms:
 *   1. Proper LaTeX:        "$x^2 + 3x$"            (correct — left untouched)
 *   2. Plain caret/derivs:  "e^x", "f''(x)"          (wrapped in $...$)
 *   3. Unicode superscripts: "x³", "10²"             (converted to x^3 then wrapped)
 *
 * Applying this at generation time (and via a one-time backfill) means the
 * stored data is consistent LaTeX, so the frontend renderer no longer has to
 * guess. The client-side MathText fallback remains as defence-in-depth.
 *
 * Scope is intentionally limited to caret exponents, derivative notation and
 * Unicode superscripts — the notations that actually appear in the bank. Free
 * Unicode operators in prose (×, ≤, √ …) are NOT auto-wrapped, because wrapping
 * a prose sentence in $...$ would mangle it.
 *
 * NOTE: a byte-identical copy of this logic lives in
 * scripts/src/backfill-math-latex.ts (a run-once script in a separate workspace
 * package that cannot import across packages cleanly). Keep them in sync.
 */

// Unicode superscript characters → their ASCII equivalent.
const SUPERSCRIPT_MAP: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-", "ⁿ": "n", "ⁱ": "i",
};

// A maximal run of superscript chars after a base char → caret notation.
// "x³" → "x^3", "10²" → "10^2", "x¹⁰" → "x^{10}".
const SUPERSCRIPT_RE =
  /([0-9A-Za-z)\]])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱ]+)/g;

function convertUnicodeSuperscripts(text: string): string {
  return text.replace(SUPERSCRIPT_RE, (whole, base: string, sup: string) => {
    const mapped = Array.from(sup)
      .map((c) => SUPERSCRIPT_MAP[c] ?? "")
      .join("");
    if (!mapped) return whole;
    return `${base}^${mapped.length > 1 ? `{${mapped}}` : mapped}`;
  });
}

// Apply fn only to text segments outside existing $...$ / $$...$$ blocks.
function applyOutsideMath(s: string, fn: (seg: string) => string): string {
  const re = /\$\$[\s\S]+?\$\$|\$(?!\d+\s)[^$\n]+?\$/g;
  const parts: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) parts.push(fn(s.slice(last, m.index)));
    parts.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(fn(s.slice(last)));
  return parts.join("");
}

/**
 * Wrap caret-exponent, derivative and fraction expressions in $...$.
 *   - Pure math strings (answer options like "e^x") → wrap entirely.
 *   - Mixed prose+math (questions) → wrap individual sub-expressions inline.
 *   - (a)/(b) fraction notation → \frac{a}{b}.
 */
function autoWrapMath(text: string): string {
  // Normalize en/em-dashes to ASCII hyphen — the AI uses – as a minus sign in
  // expressions like "V(x) = x(24 – x²)/2", which would otherwise fail the
  // isMathOnly character-class check.
  const t = text.replace(/[–—]/g, "-");
  const hasCaret = /[a-zA-Z0-9]\^[a-zA-Z0-9({]/.test(t);
  const hasDerivative = /[a-z]'{1,3}\([a-z]\)/.test(t);
  const hasFraction = /\([^()]+\)\/\([^()]+\)/.test(t);
  // e.g. "log(3x + 2y)", "sin(θ)", "sqrt(n)" — negative lookbehind avoids "catalog"
  const hasMathFunc = /(?<![a-zA-Z])(?:log|ln|sin|cos|tan|cot|sec|csc|exp|sqrt)\s*\([^)]*[a-zA-Z][^)]*\)/.test(t);
  if (!hasCaret && !hasDerivative && !hasFraction && !hasMathFunc) return text;

  const isMathOnly =
    !/[?!]/.test(t) &&
    !/\.\s/.test(t) &&
    !/^[A-Z][a-z]/.test(t) &&
    /^[a-zA-Z0-9\s^+\-*/()'=,.]+$/.test(t);

  if (isMathOnly) {
    // Convert (a)/(b) to \frac{a}{b} before wrapping the whole expression in $...$
    const withFrac = t.replace(
      /\(([^()]+)\)\/\(([^()]+)\)/g,
      (m, num: string, den: string) =>
        /[\d^+\-]/.test(num) || /[\d^+\-]/.test(den) ? `\\frac{${num}}{${den}}` : m,
    );
    return `$${withFrac.trim()}$`;
  }

  // Mixed text: convert (a)/(b) to $\frac{a}{b}$ first, then wrap remaining
  // exponent/derivative sub-expressions only in plain-text segments.
  let result = t;

  result = result.replace(
    /\(([^()]+)\)\/\(([^()]+)\)/g,
    (m, num: string, den: string) =>
      /[\d^+\-]/.test(num) || /[\d^+\-]/.test(den) ? `$\\frac{${num}}{${den}}$` : m,
  );

  result = applyOutsideMath(result, (seg) => {
    seg = seg.replace(
      /(?:\([^()]*\)|[a-zA-Z0-9])+\^(?:\{[^}]*\}|[a-zA-Z0-9]+)/g,
      (m) => `$${m}$`,
    );
    seg = seg.replace(
      /([a-zA-Z]'{1,3}\([a-zA-Z0-9]\))/g,
      (m) => `$${m}$`,
    );
    seg = seg.replace(
      /(?<![a-zA-Z])(?:log|ln|sin|cos|tan|cot|sec|csc|exp|sqrt)\s*\([^)]*[a-zA-Z][^)]*\)/g,
      (m) => `$${m}$`,
    );
    return seg;
  });

  return result;
}

/**
 * Heal JSON-escape corruption from single-backslash LaTeX.
 *
 * When a model emits `\frac` (single backslash) inside a JSON string and that
 * JSON is parsed naively, `\f` is read as a form feed (U+000C), leaving an
 * invisible control char followed by "rac" — which renders as "rac{1}{2}".
 * The same trap turns `\beta`/`\binom` into backspace (U+0008) + rest.
 *
 * Form feed and backspace never legitimately occur in question text, so their
 * presence unambiguously marks a lost `\f`/`\b`; restore the backslash. (The
 * other JSON whitespace escapes — `\n`, `\r`, `\t` — are NOT reversed because
 * they have legitimate uses.) The parse-time fix lives in repair-latex-json.ts;
 * this heals data that was already stored corrupted.
 */
function healLatexControlChars(text: string): string {
  // U+000C form feed (a lost \f) and U+0008 backspace (a lost \b). Restore the
  // backslash so the LaTeX command is whole again.
  if (text.indexOf("\u000c") === -1 && text.indexOf("\u0008") === -1) return text;
  return text.replace(/\u000c/g, "\\f").replace(/\u0008/g, "\\b");
}

/**
 * Normalise a single string. Returns the input unchanged when it already
 * contains a `$` (assumed to be intentional LaTeX) or contains no maths.
 */
export function normalizeMathText(input: unknown): unknown {
  if (typeof input !== "string" || !input) return input;
  const healed = healLatexControlChars(input);
  if (healed.includes("$")) return healed; // already explicitly delimited
  const withCarets = convertUnicodeSuperscripts(healed);
  return autoWrapMath(withCarets);
}

/** Normalise a question record's maths-bearing fields in place-safe fashion. */
export function normalizeQuestionFields<
  T extends {
    question?: unknown;
    options?: unknown;
    solution?: unknown;
    tip?: unknown;
  },
>(q: T): T {
  return {
    ...q,
    question: normalizeMathText(q.question),
    options: Array.isArray(q.options)
      ? q.options.map((o) => normalizeMathText(o))
      : q.options,
    solution: normalizeMathText(q.solution),
    tip: normalizeMathText(q.tip),
  };
}
