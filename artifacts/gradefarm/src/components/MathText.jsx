import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'katex/contrib/mhchem/mhchem.js' // enables \ce{} for chemical equations
import { parseMathText } from '../lib/mathMarkup.js'

/**
 * Renders text that may contain:
 *   1. Explicit LaTeX:  $...$, $$...$$, \(...\) or \[...\]
 *   2. Bare LaTeX commands outside delimiters:  "Simplify \frac{x^2-4}{x-2}"
 *   3. Auto-detected chemical equations:  SO2 + H2O → H2SO3 → H2SO4
 *   4. Auto-detected inline chemical formulas:  SO2, H2SO4, Ca(OH)2
 *
 * All parsing and repair lives in lib/mathMarkup.js (unit-tested); this
 * component only renders the resulting tokens.
 */

// Render one math token. A segment KaTeX can't parse falls back to its plain
// source rather than KaTeX's red error text.
function renderToken(part) {
  try {
    return katex.renderToString(part.content, {
      throwOnError: true,
      displayMode: part.display,
      strict: false,
    })
  } catch {
    return null
  }
}

export default function MathText({ text = '', style = {} }) {
  const parts = useMemo(
    () => parseMathText(text).map(p => (p.type === 'math' ? { ...p, html: renderToken(p) } : p)),
    [text],
  )

  if (!parts.length) return null

  if (!parts.some(p => p.type === 'math')) {
    return <span style={{ whiteSpace: 'pre-line', ...style }}>{parts.map(p => p.content).join('')}</span>
  }

  // Use a block container when any part is display math so we avoid the
  // invalid block-inside-inline pattern that breaks mobile layout.
  const hasDisplay = parts.some(p => p.type === 'math' && p.display)
  const Tag = hasDisplay ? 'div' : 'span'

  return (
    <Tag style={{ whiteSpace: 'pre-line', maxWidth: '100%', ...style }}>
      {parts.map((part, i) => {
        if (part.type === 'text') return <span key={i}>{part.content}</span>
        const { html } = part
        if (html === null) return <span key={i}>{part.content}</span>
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
      })}
    </Tag>
  )
}
