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

/**
 * Wrap caret-exponent and derivative expressions in $...$.
 *   - Pure math strings (answer options like "e^x") → wrap entirely.
 *   - Mixed prose+math (questions) → wrap individual sub-expressions inline.
 */
function autoWrapMath(text: string): string {
  const hasCaret = /[a-zA-Z0-9]\^[a-zA-Z0-9({]/.test(text);
  const hasDerivative = /[a-z]'{1,3}\([a-z]\)/.test(text);
  if (!hasCaret && !hasDerivative) return text;

  const isMathOnly =
    !/[?!]/.test(text) &&
    !/\.\s/.test(text) &&
    !/^[A-Z][a-z]/.test(text) &&
    /^[a-zA-Z0-9\s^+\-*/()'=,.]+$/.test(text);

  if (isMathOnly) return `$${text.trim()}$`;

  let result = text;
  // Exponent expressions: x^2, xe^x, e^{2x}, (x+1)^2, (x + 2)e^x.
  // A base is a run of alphanumerics and/or whole parenthesised groups.
  result = result.replace(
    /(?:\([^()]*\)|[a-zA-Z0-9])+\^(?:\{[^}]*\}|[a-zA-Z0-9]+)/g,
    (m) => `$${m}$`,
  );
  // Derivative notation: f'(x), f''(x), g'(t)
  result = result.replace(
    /([a-zA-Z]'{1,3}\([a-zA-Z0-9]\))/g,
    (m) => `$${m}$`,
  );
  return result;
}

/**
 * Normalise a single string. Returns the input unchanged when it already
 * contains a `$` (assumed to be intentional LaTeX) or contains no maths.
 */
export function normalizeMathText(input: unknown): unknown {
  if (typeof input !== "string" || !input) return input;
  if (input.includes("$")) return input; // already explicitly delimited
  const withCarets = convertUnicodeSuperscripts(input);
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
