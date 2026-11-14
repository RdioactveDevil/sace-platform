// Rough work on the quiz screen: a board drawn straight over the question
// (a sheet on phones). It holds pen strokes and typed text (which can be
// maths, rendered with KaTeX). Everything here is pure so it can be tested;
// components/RoughWork.jsx draws it and handles the pointer.
//
// Coordinates are CSS pixels from the board's top-centre: x is measured from
// the middle, so ink stays on the (centred) question when the window resizes.

/** @typedef {{ x: number, y: number, p?: number }} Pt */
/** @typedef {{ id: string, type: 'stroke', color: string, size: number, points: Pt[], pressured?: boolean }} Stroke */
/** @typedef {{ id: string, type: 'text', color: string, x: number, y: number, text: string, math?: boolean }} TextItem */

export const INKS = ['ink', 'gold', 'blue']
const BLUE = { dark: '#6aa8f0', light: '#2563eb' }

/** The CSS colour for an ink name in a theme ({ text, goldText }). */
export function inkColor(name, t, theme = 'dark') {
  if (name === 'gold') return t.goldText
  if (name === 'blue') return BLUE[theme] || BLUE.dark
  return t.text
}

let seq = 0
export const newId = () => `rw${Date.now().toString(36)}${(seq++).toString(36)}`

// ── The board and its history ────────────────────────────────────────────────

export const EMPTY_BOARD = Object.freeze({ items: [], past: [], future: [] })
export const HISTORY_LIMIT = 60

function commit(state, items) {
  return { items, past: [...state.past, state.items].slice(-HISTORY_LIMIT), future: [] }
}

/**
 * Every change is one undo step: a stroke, a finished text box, a move, an
 * eraser drag (all it touched), or Clear.
 */
export function boardReducer(state, action) {
  switch (action.type) {
    case 'add':
      return commit(state, [...state.items, action.item])
    case 'update': {
      let changed = false
      const items = state.items.map(it => {
        if (it.id !== action.id) return it
        const next = { ...it, ...action.patch }
        if (Object.keys(action.patch).some(k => next[k] !== it[k])) changed = true
        return next
      })
      return changed ? commit(state, items) : state
    }
    case 'remove': {
      const ids = new Set(action.ids)
      const items = state.items.filter(it => !ids.has(it.id))
      return items.length === state.items.length ? state : commit(state, items)
    }
    case 'clear':
      return state.items.length ? commit(state, []) : state
    case 'undo': {
      if (!state.past.length) return state
      return { items: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [state.items, ...state.future] }
    }
    case 'redo': {
      if (!state.future.length) return state
      return { items: state.future[0], past: [...state.past, state.items], future: state.future.slice(1) }
    }
    default:
      return state
  }
}

// ── Strokes ─────────────────────────────────────────────────────────────────

/** Width of the line at a point: a pen presses thicker; a mouse or finger is even. */
export function widthAt(p, size, pressured) {
  if (!pressured) return size
  const pr = typeof p === 'number' && p > 0 ? Math.min(1, p) : 0.5
  return size * (0.45 + pr * 1.1)
}

/** Drop points closer than `min` to the last kept one, then soften the corners. */
export function smoothPoints(points, min = 1.2) {
  const kept = []
  for (const pt of points) {
    const last = kept[kept.length - 1]
    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= min) kept.push(pt)
  }
  if (kept.length < 3) return kept
  return kept.map((pt, i) => {
    if (i === 0 || i === kept.length - 1) return pt
    const a = kept[i - 1], b = kept[i + 1]
    return { x: (a.x + 2 * pt.x + b.x) / 4, y: (a.y + 2 * pt.y + b.y) / 4, p: pt.p }
  })
}

const r2 = (n) => Math.round(n * 100) / 100
const dot = (x, y, r) => `M${r2(x - r)} ${r2(y)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0Z`

/**
 * A filled SVG path for a stroke: its outline, so a pen's pressure can make
 * the line thicker and thinner along the way, with round ends.
 */
export function strokePath(stroke) {
  const pts = smoothPoints(stroke.points || [])
  if (!pts.length) return ''
  const w = (pt) => widthAt(pt.p, stroke.size, stroke.pressured) / 2
  if (pts.length === 1) return dot(pts[0].x, pts[0].y, w(pts[0]))
  const left = [], right = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len
    const hw = w(pts[i])
    left.push([pts[i].x + nx * hw, pts[i].y + ny * hw])
    right.push([pts[i].x - nx * hw, pts[i].y - ny * hw])
  }
  const outline = [...left, ...right.reverse()].map(([x, y], i) => `${i ? 'L' : 'M'}${r2(x)} ${r2(y)}`).join('') + 'Z'
  const first = pts[0], last = pts[pts.length - 1]
  return outline + dot(first.x, first.y, w(first)) + dot(last.x, last.y, w(last))
}

function distToSegment(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

/** Does the eraser at (x, y) with radius r touch this stroke? */
export function strokeHit(stroke, x, y, r) {
  const pts = stroke.points || []
  const reach = r + (stroke.size || 0) / 2
  if (pts.length === 1) return Math.hypot(pts[0].x - x, pts[0].y - y) <= reach
  for (let i = 1; i < pts.length; i++) if (distToSegment(x, y, pts[i - 1], pts[i]) <= reach) return true
  return false
}

/** How far down the ink goes, so the board can grow to fit it. */
export function inkBottom(items) {
  let max = 0
  for (const it of items) {
    if (it.type === 'stroke') for (const pt of it.points) max = Math.max(max, pt.y)
    else if (it.type === 'text') max = Math.max(max, it.y + 24 * (String(it.text).split('\n').length))
  }
  return max
}

// ── Typed text and maths ────────────────────────────────────────────────────

/**
 * What a text box shows, as MathText input. A maths box is LaTeX: each line
 * is shown as maths (\displaystyle, so fractions are full size).
 */
export function displayText(item) {
  const text = String(item?.text ?? '')
  if (!item?.math) return text
  return text.split('\n').map(l => (l.trim() ? `$\\displaystyle ${l.trim()}$` : '')).join('\n')
}

/** Typed lines, top to bottom then left to right (for Titan; maths stays LaTeX). */
export function typedLines(items) {
  return items
    .filter(it => it.type === 'text' && String(it.text).trim())
    .slice()
    .sort((a, b) => (Math.abs(a.y - b.y) > 12 ? a.y - b.y : a.x - b.x))
    .map(it => (it.math ? String(it.text).trim().split('\n').filter(l => l.trim()).map(l => `$${l.trim()}$`).join('\n') : String(it.text).trim()))
}

/** Insert `snippet` at the selection; `|` in the snippet marks where the cursor goes. */
export function insertSnippet(value, start, end, snippet) {
  const at = snippet.indexOf('|')
  const clean = snippet.replace('|', '')
  const text = value.slice(0, start) + clean + value.slice(end)
  const caret = start + (at >= 0 ? at : clean.length)
  return { text, caret }
}

export const MATH_SNIPPETS = [
  { label: 'a/b', snippet: '\\frac{|}{}', title: 'Fraction' },
  { label: 'x²', snippet: '^{|}', title: 'Power' },
  { label: 'x₁', snippet: '_{|}', title: 'Subscript' },
  { label: '√', snippet: '\\sqrt{|}', title: 'Square root' },
  { label: '×', snippet: '\\times ', title: 'Times' },
  { label: '÷', snippet: '\\div ', title: 'Divide' },
  { label: '±', snippet: '\\pm ', title: 'Plus or minus' },
  { label: 'π', snippet: '\\pi ', title: 'Pi' },
  { label: 'θ', snippet: '\\theta ', title: 'Theta' },
  { label: '→', snippet: '\\rightarrow ', title: 'Arrow' },
]

// ── Titan checks the working ────────────────────────────────────────────────

/**
 * Titan's instructions for "Check my working". `questionSection` describes the
 * question (lib/questionHelp's questionHelpSystemSection). Before the student
 * has answered, Titan never gives away the answer.
 */
export function checkWorkingSystem({ questionSection = '', answered = false, firstName = '' } = {}) {
  return [
    `You are Titan, a friendly, encouraging tutor${firstName ? ` helping ${firstName}` : ''}. The student is in a practice quiz and has sent a picture of their rough work for the question below: handwriting and anything they typed (typed maths is also given as LaTeX).`,
    questionSection,
    '',
    'HOW TO CHECK THEIR WORKING:',
    '- Reply in at most 3 short sentences.',
    '- Say what is right so far, then point to the FIRST line that goes wrong and why, as a hint they can act on. Don\'t redo the working for them.',
    '- If everything so far is right, say so and tell them what to do next.',
    '- If part of the handwriting is unreadable, say which part.',
    answered
      ? '- They have already answered, so you may mention the correct answer if it helps.'
      : '- They have NOT answered yet. Never say which option is correct and never give the final value, even if asked.',
    '- Write any maths with $...$ (KaTeX). No headings or lists.',
  ].filter(s => s !== null).join('\n')
}

/** The student's message: the picture plus their typed lines. */
export function checkWorkingMessage(image, lines) {
  const text = lines.length
    ? `Can you check my working? What I typed:\n${lines.join('\n')}`
    : 'Can you check my working?'
  return [
    ...(image ? [{ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } }] : []),
    { type: 'text', text },
  ]
}

/** The saved picture's file name: rough-work-<topic>-<yyyy-mm-dd>.png */
export function roughWorkFileName(topic, date = new Date()) {
  const slug = String(topic || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return `rough-work-${slug ? `${slug}-` : ''}${d}.png`
}
