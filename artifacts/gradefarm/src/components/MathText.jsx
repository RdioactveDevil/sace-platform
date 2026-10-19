import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'katex/contrib/mhchem/mhchem.js' // enables \ce{} for chemical equations
import { parseMathText, restoreLiteralNewlines } from '../lib/mathMarkup.js'
import { splitMarkdownBlocks, applyBold } from '../lib/markdownBlocks.js'

/**
 * Renders text that may contain:
 *   1. Explicit LaTeX:  $...$, $$...$$, \(...\) or \[...\]
 *   2. Bare LaTeX commands outside delimiters:  "Simplify \frac{x^2-4}{x-2}"
 *   3. Auto-detected chemical equations:  SO2 + H2O → H2SO3 → H2SO4
 *   4. Auto-detected inline chemical formulas:  SO2, H2SO4, Ca(OH)2
 *   5. Markdown pipe tables and **bold**, as written by generated questions
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

function InlineMath({ text, style }) {
  const parts = useMemo(
    () => applyBold(parseMathText(text)).map(p => (p.type === 'math' ? { ...p, html: renderToken(p) } : p)),
    [text],
  )

  if (!parts.length) return null

  if (!parts.some(p => p.type === 'math' || p.bold)) {
    return <span style={{ whiteSpace: 'pre-line', ...style }}>{parts.map(p => p.content).join('')}</span>
  }

  // Use a block container when any part is display math so we avoid the
  // invalid block-inside-inline pattern that breaks mobile layout.
  const hasDisplay = parts.some(p => p.type === 'math' && p.display)
  const Tag = hasDisplay ? 'div' : 'span'

  return (
    <Tag style={{ whiteSpace: 'pre-line', maxWidth: '100%', ...style }}>
      {parts.map((part, i) => {
        const weight = part.bold ? { fontWeight: 700 } : undefined
        if (part.type === 'text') return <span key={i} style={weight}>{part.content}</span>
        const { html } = part
        if (html === null) return <span key={i} style={weight}>{part.content}</span>
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
            style={{ verticalAlign: 'middle', ...weight }}
          />
        )
      })}
    </Tag>
  )
}

const cellStyle = { border: '1px solid rgba(127,127,127,0.35)', padding: '4px 12px', textAlign: 'center' }

function MarkdownTable({ header, rows }) {
  return (
    <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '8px 0' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 'inherit' }}>
        {header && (
          <thead>
            <tr>{header.map((c, i) => <th key={i} style={{ ...cellStyle, fontWeight: 700 }}><InlineMath text={c} /></th>)}</tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>{row.map((c, i) => <td key={i} style={cellStyle}><InlineMath text={c} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function MathText({ text = '', style = {} }) {
  const blocks = useMemo(
    () => splitMarkdownBlocks(typeof text === 'string' ? restoreLiteralNewlines(text) : text),
    [text],
  )
  if (!blocks.some(b => b.type === 'table')) return <InlineMath text={text} style={style} />

  return (
    <div style={{ maxWidth: '100%', ...style }}>
      {blocks.map((b, i) => (b.type === 'table'
        ? <MarkdownTable key={i} header={b.header} rows={b.rows} />
        : <div key={i}><InlineMath text={b.content} /></div>))}
    </div>
  )
}
