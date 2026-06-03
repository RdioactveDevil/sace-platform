import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'katex/contrib/mhchem/mhchem.js' // enables \ce{} for chemical equations

/**
 * Renders text that may contain:
 *   1. Explicit LaTeX:  $...$  or  $$...$$
 *   2. Auto-detected chemical equations:  SO2 + H2O → H2SO3 → H2SO4
 *   3. Auto-detected inline chemical formulas:  SO2, H2SO4, Ca(OH)2
 *
 * Plain Unicode arrows (→, ⇌) and symbols render as-is when they appear
 * outside any detectable chemical context.
 */

// Convert Unicode reaction arrows to mhchem notation
function toMhchem(str) {
  return str
    .replace(/→|⟶/g, '->')
    .replace(/⇌|⟷/g, '<->')
    .replace(/←|⟵/g, '<-')
    .replace(/⇒/g, '=>')
}

// Returns true if the string contains at least one chemical formula token
// (an element symbol immediately followed by a subscript digit, e.g. SO2, H2O)
function hasChemFormula(str) {
  return /[A-Z][a-z]?\d/.test(str)
}

/**
 * Detect numbered-list patterns like "(1) ... (2) ..." and insert \n
 * before each item so equations appear on their own lines.
 */
function insertLineBreaks(text) {
  if (!text || text.includes('\n')) return text
  if (!/\(1\)/.test(text) || !/\(2\)/.test(text)) return text
  return text.replace(/\s*(\(\d+\))/g, '\n$1')
}

// Unicode superscript characters → ASCII, so "x³" becomes "x^3" before wrapping.
const SUPERSCRIPT_MAP = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', 'ⁿ': 'n', 'ⁱ': 'i',
}

function convertUnicodeSuperscripts(text) {
  return text.replace(/([0-9A-Za-z)\]])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱ]+)/g, (whole, base, sup) => {
    const mapped = Array.from(sup).map((c) => SUPERSCRIPT_MAP[c] ?? '').join('')
    if (!mapped) return whole
    return `${base}^${mapped.length > 1 ? `{${mapped}}` : mapped}`
  })
}

/**
 * Auto-detect math expressions not already wrapped in $ delimiters.
 * Handles two cases:
 *   A. Pure math strings (answer options like "e^x", "(x+2)e^x") — wrap entirely.
 *   B. Mixed prose+math (questions like "If f(x)=xe^x, what is f''(x)?") — wrap
 *      individual sub-expressions.
 * Unicode superscripts (x², x³) are converted to caret notation first.
 */
function autoWrapMath(rawText) {
  // Normalize en/em-dashes to ASCII hyphen so expressions like "x(24 – x²)/2"
  // are recognised as pure math (en-dashes are used as minus signs in generated output).
  const text = convertUnicodeSuperscripts(rawText).replace(/[–—]/g, '-')
  const hasCaret = /[a-zA-Z0-9]\^[a-zA-Z0-9({]/.test(text)
  const hasDerivative = /[a-z]'{1,3}\([a-z]\)/.test(text)
  if (!hasCaret && !hasDerivative) return text

  // A pure math string: no sentence punctuation, only math-compatible characters,
  // and doesn't start with a capitalised English word (e.g. "Find").
  const isMathOnly =
    !/[?!]/.test(text) &&
    !/\.\s/.test(text) &&
    !/^[A-Z][a-z]/.test(text) &&
    /^[a-zA-Z0-9\s^+\-*/()\'=,.]+$/.test(text)

  if (isMathOnly) return `$${text.trim()}$`

  // Mixed text: wrap individual math sub-expressions inline.
  let result = text

  // Exponent expressions: x^2, xe^x, e^{2x}, (x+1)^2, (x + 2)e^x.
  // A base is a run of alphanumerics and/or whole parenthesised groups.
  result = result.replace(
    /(?:\([^()]*\)|[a-zA-Z0-9])+\^(?:\{[^}]*\}|[a-zA-Z0-9]+)/g,
    (m) => `$${m}$`,
  )

  // Derivative notation: f'(x), f''(x), g'(t)
  result = result.replace(
    /([a-zA-Z]'{1,3}\([a-zA-Z0-9]\))/g,
    (m) => `$${m}$`,
  )

  return result
}

/**
 * Pre-process plain text to insert LaTeX delimiters so that the
 * main KaTeX renderer can pick them up.
 *
 * Rules (applied in order):
 *   1. If the text already has $ signs → skip (it uses explicit LaTeX)
 *   2. If the text has a reaction arrow AND a chemical formula →
 *      treat the whole text as a chemical equation
 *   3. Scan for subscript-bearing formula tokens (e.g. SO2) and wrap individually
 *   4. If no $ signs were introduced by the chemical pass, auto-detect math
 *      expressions (caret exponents, derivative notation) and wrap them
 */
function preprocess(text) {
  if (!text || text.includes('$')) return text

  const hasArrow = /[→←⇌⟶⟵⟷⇒]/.test(text)

  if (hasArrow && hasChemFormula(text)) {
    // The whole string is (or contains) a reaction equation
    return `$\\ce{${toMhchem(text)}}$`
  }

  let result = text

  if (hasChemFormula(text)) {
    // Inline formula pass: find tokens like SO2, H2SO4, CO2, NH3, Ca2+
    result = result.replace(
      /(?:[A-Z][a-z]?\d*(?:\([^)]+\)\d*)?)+(?:[+-])?/g,
      (match) => {
        // Only wrap if the match contains a digit (subscript is present)
        // and is longer than 1 character to avoid single letters like "I"
        if (/\d/.test(match) && match.length > 1) {
          return `$\\ce{${match}}$`
        }
        return match
      },
    )
  }

  // Auto-detect math (caret / derivative notation) only when the chemical pass
  // did not already introduce any $ signs.
  if (!result.includes('$')) {
    result = autoWrapMath(result)
  }

  return result
}

/**
 * Split preprocessed text on $...$ / $$...$$ and render each math segment
 * with KaTeX (mhchem already loaded above).
 */
export default function MathText({ text = '', style = {} }) {
  if (!text || typeof text !== 'string') return null

  const withBreaks = insertLineBreaks(text)
  const processed = preprocess(withBreaks)

  if (!processed.includes('$')) return <span style={{ whiteSpace: 'pre-line', ...style }}>{processed}</span>

  const parts = []
  // \$(?!\d+\s) — allow $10x but not $10 (dollar amount: digits followed by space)
  const pattern = /(\$\$[\s\S]+?\$\$|\$(?!\d+\s)[^$\n]+?\$)/g
  let lastIndex = 0
  let match

  pattern.lastIndex = 0
  while ((match = pattern.exec(processed)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: processed.slice(lastIndex, match.index) })
    }
    const raw = match[0]
    const isDisplay = raw.startsWith('$$')
    const latex = isDisplay ? raw.slice(2, -2) : raw.slice(1, -1)
    parts.push({ type: 'math', content: latex, display: isDisplay })
    lastIndex = match.index + raw.length
  }

  if (lastIndex < processed.length) {
    parts.push({ type: 'text', content: processed.slice(lastIndex) })
  }

  // Use a block container when any part is display math so we avoid the
  // invalid block-inside-inline pattern that breaks mobile layout.
  const hasDisplay = parts.some(p => p.type === 'math' && p.display)
  const Tag = hasDisplay ? 'div' : 'span'

  return (
    <Tag style={{ whiteSpace: 'pre-line', maxWidth: '100%', ...style }}>
      {parts.map((part, i) => {
        if (part.type === 'text') return <span key={i}>{part.content}</span>
        try {
          const html = katex.renderToString(part.content, {
            throwOnError: false,
            displayMode: part.display,
            strict: false,
          })
          if (part.display) {
            return (
              <div
                key={i}
                dangerouslySetInnerHTML={{ __html: html }}
                style={{ overflowX: 'auto', textAlign: 'center', margin: '8px 0', maxWidth: '100%' }}
              />
            )
          }
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: html }}
              style={{ verticalAlign: 'middle' }}
            />
          )
        } catch {
          return <span key={i}>{part.display ? `$$${part.content}$$` : `$${part.content}$`}</span>
        }
      })}
    </Tag>
  )
}
