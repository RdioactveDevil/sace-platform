// A written answer in a maths subject is a column of working: one step per
// line, each line either maths (typed in the maths box, stored as $latex$) or
// words. The answer string the marker sees is those lines, one per row:
//
//   $f'(x) = 3x^2 - 12$
//   Stationary points where f'(x) = 0
//   $x = \pm 2$
//
// so it reads naturally to the AI marker and renders through MathText.

let nextId = 0
const newId = () => `l${++nextId}`

/** A fresh line of working. */
export function newLine(kind = 'math', value = '') {
  return { id: newId(), kind, value }
}

/** Lines of working back from a stored answer (one empty maths line for none). */
export function parseWorking(answer) {
  const rows = String(answer ?? '').split('\n').filter(r => r.trim())
  if (!rows.length) return [newLine()]
  return rows.map(r => {
    const m = r.trim().match(/^\$([^$]*)\$$/)
    return m ? newLine('math', m[1].trim()) : newLine('text', r)
  })
}

/** The answer string for some lines of working; blank lines are left out. */
export function serializeWorking(lines) {
  return lines
    .map(l => (l.kind === 'math' ? (l.value.trim() ? `$${l.value.trim()}$` : '') : l.value.replace(/\s+$/, '')))
    .filter(r => r.trim())
    .join('\n')
}

/** True when an answer has at least one line of maths in it (so it renders as working). */
export function isMathWorking(answer) {
  return String(answer ?? '').split('\n').some(r => /^\$[^$]+\$$/.test(r.trim()))
}

/**
 * The rows of an answer with the mark points whose evidence falls on each,
 * from evidenceRanges' [start, end, point] ranges. Maths working is shown a
 * row at a time (a highlight can't cut through a rendered equation), so the
 * whole row is credited.
 */
export function workingRows(answer, ranges = []) {
  const rows = []
  let pos = 0
  for (const text of String(answer ?? '').split('\n')) {
    const start = pos
    const end = pos + text.length
    pos = end + 1
    if (!text.trim()) continue
    const points = ranges.filter(([s, e]) => s < end && e > start).map(([, , p]) => p)
    rows.push({ text, points: [...new Set(points)] })
  }
  return rows
}
