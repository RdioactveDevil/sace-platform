import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'katex/contrib/mhchem/mhchem.js' // enables \ce{} for chemical equations
import { parseMathText, restoreLiteralNewlines } from '../lib/mathMarkup.js'
import { splitMarkdownBlocks, applyBold } from '../lib/markdownBlocks.js'
import { markParts } from '../lib/advice.js'

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
 *
 * marks (optional): { quotes, Mark, Anchor } wraps each quoted phrase in
 * <Mark index> and its first and last word in <Anchor index which>, so pen
 * marks drawn on those elements sit on exactly those words (Titan's Advice).
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

const isDisplay = (p) => p.type === 'math' && p.display && p.html !== null

// Consecutive parts of the same mark, kept together so the mark can wrap them.
function groupMarked(parts) {
  const groups = []
  parts.forEach((part) => {
    const last = groups[groups.length - 1]
    if (part.mark === undefined) groups.push({ part })
    else if (last && last.mark === part.mark) last.parts.push(part)
    else groups.push({ mark: part.mark, parts: [part] })
  })
  return groups
}

function InlineMath({ text, tokens, style, marks }) {
  const parts = useMemo(
    () => (tokens || applyBold(parseMathText(text))).map(p => (p.type === 'math' ? { ...p, html: renderToken(p) } : p)),
    [text, tokens],
  )

  if (!parts.length) return null

  if (!marks && !parts.some(p => p.type === 'math' || p.bold)) {
    return <span style={{ whiteSpace: 'pre-line', ...style }}>{parts.map(p => p.content).join('')}</span>
  }

  // Use a block container when any part is display math so we avoid the
  // invalid block-inside-inline pattern that breaks mobile layout.
  const hasDisplay = parts.some(p => p.type === 'math' && p.display)
  const Tag = hasDisplay ? 'div' : 'span'

  const renderPart = (part, i) => {
    const weight = part.bold ? { fontWeight: 700 } : undefined
    if (part.type === 'text') return <span key={i} style={weight}>{part.content}</span>
    const { html } = part
    if (html === null) return <span key={i} style={weight}>{part.content}</span>
    // data-tex: the segment's source, so Titan's Advice can find it on screen.
    if (part.display) {
      return (
        <div
          key={i}
          data-tex={part.content}
          className="mt-display"
          dangerouslySetInnerHTML={{ __html: html }}
          style={{ overflowX: 'auto', textAlign: 'center', margin: '8px 0', maxWidth: '100%' }}
        />
      )
    }
    return (
      <span
        key={i}
        data-tex={part.content}
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ verticalAlign: 'middle', ...weight }}
      />
    )
  }

  const { Mark, Anchor } = marks || {}
  return (
    <Tag style={{ whiteSpace: 'pre-line', maxWidth: '100%', ...style }}>
      {marks
        ? groupMarked(parts).map((g, i) => (g.mark === undefined ? renderPart(g.part, i) : (
          <Mark key={i} index={g.mark} block={g.parts.some(isDisplay)}>
            {g.parts.map((p, j) => (p.anchor
              ? <Anchor key={j} index={g.mark} which={p.anchor} block={isDisplay(p)}>{renderPart(p, j)}</Anchor>
              : renderPart(p, j)))}
          </Mark>
        )))
        : parts.map(renderPart)}
    </Tag>
  )
}

const cellStyle = { border: '1px solid rgba(127,127,127,0.35)', padding: '4px 12px', textAlign: 'center' }

function MarkdownTable({ header, rows }) {
  return (
    <div className="mt-table" style={{ overflowX: 'auto', maxWidth: '100%', margin: '8px 0' }}>
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

export default function MathText({ text = '', style = {}, marks }) {
  const blocks = useMemo(
    () => splitMarkdownBlocks(typeof text === 'string' ? restoreLiteralNewlines(text) : text),
    [text],
  )
  const hasTable = blocks.some(b => b.type === 'table')
  const quotes = marks?.quotes
  // With marks: every block's tokens, each quote found once across them all
  // (never across a table), then handed back block by block.
  const marked = useMemo(() => {
    if (!quotes?.length) return null
    const textBlocks = hasTable ? blocks : [{ type: 'text', content: text }]
    const all = []
    textBlocks.forEach((b, block) => {
      if (block) all.push({ type: 'break', content: '' })
      if (b.type === 'text') applyBold(parseMathText(b.content)).forEach(p => all.push({ ...p, block }))
    })
    const { parts } = markParts(all, quotes)
    return textBlocks.map((b, block) => parts.filter(p => p.block === block && p.type !== 'break'))
  }, [text, blocks, hasTable, quotes])
  const inlineMarks = marked ? marks : undefined

  if (!hasTable) return <InlineMath text={text} tokens={marked?.[0]} marks={inlineMarks} style={style} />

  return (
    <div style={{ maxWidth: '100%', ...style }}>
      {blocks.map((b, i) => (b.type === 'table'
        ? <MarkdownTable key={i} header={b.header} rows={b.rows} />
        : <div key={i}><InlineMath text={b.content} tokens={marked?.[i]} marks={inlineMarks} /></div>))}
    </div>
  )
}
