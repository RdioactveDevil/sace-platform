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
 * Pre-process plain text to insert $\ce{...}$ delimiters so that the
 * main KaTeX renderer can pick them up.
 *
 * Rules (applied in order):
 *   1. If the text already has $ signs → skip (it uses explicit LaTeX)
 *   2. If the text has a reaction arrow AND a chemical formula →
 *      treat the whole text as a chemical equation
 *   3. Otherwise scan for subscript-bearing formula tokens (e.g. SO2)
 *      and wrap each individually
 */
function preprocess(text) {
  if (!text || text.includes('$')) return text

  const hasArrow = /[→←⇌⟶⟵⟷⇒]/.test(text)

  if (hasArrow && hasChemFormula(text)) {
    // The whole string is (or contains) a reaction equation
    return `$\\ce{${toMhchem(text)}}$`
  }

  if (!hasChemFormula(text)) return text

  // Inline formula pass: find tokens like SO2, H2SO4, CO2, NH3, Ca2+
  // Each group: [A-Z][a-z]? (element symbol) + \d* (optional subscript)
  // Optionally followed by charge like 2+ or 3-
  return text.replace(
    /(?:[A-Z][a-z]?\d*(?:\([^)]+\)\d*)?)+(?:[+-])?/g,
    (match) => {
      // Only wrap if the match contains a digit (subscript is present)
      // and is longer than 1 character to avoid single letters like "I"
      if (/\d/.test(match) && match.length > 1) {
        return `$\\ce{${match}}$`
      }
      return match
    }
  )
}

/**
 * Split preprocessed text on $...$ / $$...$$ and render each math segment
 * with KaTeX (mhchem already loaded above).
 */
export default function MathText({ text = '', style = {} }) {
  if (!text || typeof text !== 'string') return null

  const processed = preprocess(text)

  if (!processed.includes('$')) return <span style={style}>{processed}</span>

  const parts = []
  const pattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g
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

  return (
    <span style={style}>
      {parts.map((part, i) => {
        if (part.type === 'text') return <span key={i}>{part.content}</span>
        try {
          const html = katex.renderToString(part.content, {
            throwOnError: false,
            displayMode: part.display,
            strict: false,
          })
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: html }}
              style={part.display ? { display: 'block', textAlign: 'center', margin: '8px 0' } : {}}
            />
          )
        } catch {
          return <span key={i}>{part.display ? `$$${part.content}$$` : `$${part.content}$`}</span>
        }
      })}
    </span>
  )
}
