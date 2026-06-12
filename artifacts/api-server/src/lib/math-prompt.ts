/**
 * Single source of truth for the LaTeX formatting rule injected into every
 * question-generation prompt (bulk generate, admin per-subtopic generate,
 * diagnostic builder, image transcription).
 *
 * Kept strict on purpose: the frontend renders with KaTeX via $-delimited
 * segments (see gradefarm MathText.jsx), so any bare/Unicode maths the model
 * emits shows up as raw text in the quiz UI.
 */
export function latexPromptRule(extraExamples = ""): string {
  const examples = ["$x^2 + 3x - 4$", "$e^{-0.5x}$", "$f''(x)$", "$(x+2)e^x$", extraExamples]
    .filter(Boolean)
    .join(", ");
  return [
    "IMPORTANT: Use LaTeX notation for ALL mathematical expressions — in the question, EVERY option, and the solution.",
    `Wrap inline math in $...$ and display equations in $$...$$. Examples: ${examples}.`,
    'Always write exponents with a caret and braces inside $...$ (e.g. $x^2$, $e^{-0.5x}$) — NEVER Unicode superscripts like "x²" and NEVER plain-text exponents like "e^(-0.5x)" outside $...$.',
    "Always wrap derivative notation like $f'(x)$ and $f''(x)$ in $...$.",
    "Always use \\frac{numerator}{denominator} for fractions — NEVER (a)/(b) slash notation (e.g. write $\\frac{x^2-4}{x-1}$, NOT $(x^2-4)/(x-1)$).",
    "NEVER use the Unicode maths characters ×, ÷, −, ⋅, √ or π — write \\times, \\div, -, \\cdot, \\sqrt{} and \\pi inside $...$ instead. The variable x must always be the ASCII letter x, never the × sign.",
    "Use proper LaTeX commands: \\sin \\cos \\tan for trig, \\ln \\log for logs, \\int \\sum \\lim for calculus, \\infty \\theta etc. for symbols.",
    "Never emit a bare mathematical expression outside $...$.",
  ].join(" ");
}
