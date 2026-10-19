/**
 * The small slice of Markdown that generated questions use: pipe tables
 * ("| $x$ | 1 | 2 |") and **bold**. Without this, students saw the raw pipes
 * and asterisks. Everything else stays plain text for parseMathText.
 */

// A table row starts and ends with a pipe.
const isRowLine = (line) => /^\s*\|.*\|\s*$/.test(line)
// "|-----|:---:|" separates a header row from the body.
const isSeparatorLine = (line) => /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(line)

/** Split a row into cells on pipes outside $...$ (so `$|x|$` stays whole). */
export function splitRow(line) {
  const inner = line.trim().slice(1, -1)
  const cells = []
  let cell = ''
  let inMath = false
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === '\\' && inner[i + 1] === '$') { cell += ch + inner[++i]; continue }
    if (ch === '$') inMath = !inMath
    if (ch === '|' && !inMath) { cells.push(cell.trim()); cell = ''; continue }
    cell += ch
  }
  cells.push(cell.trim())
  return cells
}

/**
 * Split text into text and table blocks. A table is two or more consecutive
 * pipe rows, so a lone line like "|x - 2| < 5|" is left as text. Newlines
 * next to a table are dropped, since the table is already a block.
 */
export function splitMarkdownBlocks(text) {
  if (!text || typeof text !== 'string') return []
  if (!text.includes('|')) return [{ type: 'text', content: text }]

  const lines = text.split('\n')
  const blocks = []
  let textLines = []
  const flushText = () => {
    const content = textLines.join('\n')
    textLines = []
    if (content) blocks.push({ type: 'text', content })
  }

  let i = 0
  while (i < lines.length) {
    let j = i
    while (j < lines.length && isRowLine(lines[j])) j++
    if (j - i < 2) {
      textLines.push(lines[i])
      i++
      continue
    }
    const rowLines = lines.slice(i, j)
    const sepIdx = rowLines.findIndex(isSeparatorLine)
    const header = sepIdx === 1 ? splitRow(rowLines[0]) : null
    const rows = rowLines
      .filter((line, k) => !isSeparatorLine(line) && !(header && k === 0))
      .map(splitRow)
    // Trim blank lines either side of the table.
    while (textLines.length && !textLines[textLines.length - 1].trim()) textLines.pop()
    flushText()
    blocks.push({ type: 'table', header, rows })
    i = j
    while (i < lines.length && !lines[i].trim()) i++
  }
  flushText()
  return blocks
}

/**
 * Mark tokens that fall between `**` pairs as bold, dropping the markers.
 * Markers are only read from text tokens, so bold can wrap maths
 * ("**$x = 2$**"). An unpaired `**` is left as written.
 */
export function applyBold(tokens) {
  const markers = tokens
    .filter((t) => t.type === 'text')
    .reduce((n, t) => n + (t.content.match(/\*\*/g) || []).length, 0)
  if (!markers || markers % 2) return tokens

  const out = []
  let bold = false
  for (const tok of tokens) {
    if (tok.type !== 'text') { out.push(bold ? { ...tok, bold } : tok); continue }
    tok.content.split('**').forEach((piece, k) => {
      if (k > 0) bold = !bold
      if (piece) out.push(bold ? { type: 'text', content: piece, bold } : { type: 'text', content: piece })
    })
  }
  return out
}
