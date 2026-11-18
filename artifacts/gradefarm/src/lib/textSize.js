// Printed size of chosen words or equations in a question's text, set with
// the Bigger / Smaller buttons in Admin's question editors (EditorTools.jsx).
//
// In the text:  <big>…</big> prints 1.2× larger, <small>…</small> 0.85×;
// they nest (<big><big>…</big></big> is 1.44×) and can wrap maths
// ("<big>$\frac{1}{2}$</big>"). Inside an equation, part of it is sized with
// LaTeX instead: "$x = {\large \frac{1}{2}}$". MathText draws both.

import { parseMathText } from './mathMarkup.js'
import { insideMath } from './mathInsert.js'

export const SIZE_SCALE = { big: 1.2, small: 0.85 }
const TAG = /<(\/?)(big|small)>/g
const MAX_DEPTH = { big: 3, small: 2 }
// KaTeX's sizes, smallest to largest; '' is the equation's own size.
const LATEX_SIZES = ['\\footnotesize', '\\small', '', '\\large', '\\Large', '\\LARGE']

/**
 * Each part of `text` with its scale: the text split at the size tags, each
 * piece parsed for maths (parseMathText), tags removed. Text whose tags don't
 * pair up is parsed as written.
 */
export function parseSized(text) {
  const s = String(text ?? '')
  if (!/<\/?(big|small)>/.test(s)) return parseMathText(s)
  const pieces = []
  const open = []
  let last = 0
  for (const m of s.matchAll(TAG)) {
    pieces.push({ text: s.slice(last, m.index), scale: scaleOf(open) })
    if (m[1]) {
      if (open[open.length - 1] !== m[2]) return parseMathText(s)
      open.pop()
    } else open.push(m[2])
    last = m.index + m[0].length
  }
  if (open.length) return parseMathText(s)
  pieces.push({ text: s.slice(last), scale: 1 })
  const out = []
  for (const p of pieces) {
    if (!p.text) continue
    for (const t of parseMathText(p.text)) out.push(p.scale === 1 ? t : { ...t, scale: p.scale })
  }
  return out
}

function scaleOf(open) {
  return Math.round(open.reduce((x, tag) => x * SIZE_SCALE[tag], 1) * 1000) / 1000
}

/** The text without size tags, for plain-text snippets. */
export function stripSizeTags(text) {
  return String(text ?? '').replace(TAG, '')
}

const isSpace = (c) => c === ' ' || c === '\n' || c === '\t'

/**
 * The Bigger (dir 1) or Smaller (dir -1) button on the selection start…end of
 * `value`. Returns { value, start, end } with the selection kept on the same
 * words, so pressing again steps again, or { error } to show the person.
 */
export function resizeSelection(value, start, end, dir) {
  const text = String(value ?? '')
  while (start < end && isSpace(text[start])) start++
  while (end > start && isSpace(text[end - 1])) end--
  if (start >= end) return { error: 'Select the words or equation to resize first.' }

  let inStart = insideMath(text, start)
  const inEnd = insideMath(text, end)
  let chem = false
  if (inStart && inEnd && !text.slice(start, end).includes('$')) {
    const open = text.lastIndexOf('$', start - 1)
    const close = text.indexOf('$', end)
    const head = text.slice(open + 1, start)
    const tail = text.slice(end, close)
    // A whole equation selected without its $ signs, or a formula without its
    // \ce{ }: size it with them, as text.
    if (!head.replace(/^\$/, '').replace(/^\\[a-zA-Z]+\{$/, '') && !tail.replace(/\$$/, '').replace(/^\}$/, '')) {
      const d = text[open - 1] === '$' && text[close + 1] === '$' ? 2 : 1
      start = open + 1 - d
      end = close + d
      inStart = false
    } else chem = /\\ce\{[^}]*$/.test(head)
  }
  const sel = text.slice(start, end)
  if (inStart !== insideMath(text, end) || (inStart && sel.includes('$'))) {
    return { error: 'Select a whole equation (with its $ signs), or a part inside one, not a bit of each.' }
  }
  // mhchem can't size part of a formula or reaction.
  if (chem) return { error: 'In chemistry, select the whole formula or reaction to resize it.' }
  return inStart ? resizeInMath(text, start, end, dir) : resizeText(text, start, end, dir)
}

function resizeText(text, start, end, dir) {
  const grow = dir > 0 ? 'big' : 'small'
  const undo = dir > 0 ? 'small' : 'big'
  const before = text.slice(0, start)
  const after = text.slice(end)
  const sel = text.slice(start, end)
  const o = (t) => `<${t}>`
  const c = (t) => `</${t}>`

  // One step the other way is undone rather than wrapped again.
  if (before.endsWith(o(undo)) && after.startsWith(c(undo))) {
    const n = o(undo).length
    return { value: before.slice(0, -n) + sel + after.slice(c(undo).length), start: start - n, end: end - n }
  }
  if (sel.startsWith(o(undo)) && sel.endsWith(c(undo)) && parsesAlone(sel.slice(o(undo).length, -c(undo).length))) {
    const inner = sel.slice(o(undo).length, -c(undo).length)
    return { value: before + inner + after, start, end: start + inner.length }
  }

  let depth = 0
  while (before.slice(0, before.length - depth * o(grow).length).endsWith(o(grow))
    && after.slice(depth * c(grow).length).startsWith(c(grow))) depth++
  if (depth >= MAX_DEPTH[grow]) return { error: dir > 0 ? 'That is as big as it goes.' : 'That is as small as it goes.' }

  const n = o(grow).length
  return { value: before + o(grow) + sel + c(grow) + after, start: start + n, end: end + n }
}

// Whether `s` has its size tags paired, so unwrapping around it is safe.
function parsesAlone(s) {
  const open = []
  for (const m of s.matchAll(TAG)) {
    if (!m[1]) open.push(m[2])
    else if (open.pop() !== m[2]) return false
  }
  return open.length === 0
}

function resizeInMath(text, start, end, dir) {
  const before = text.slice(0, start)
  const after = text.slice(end)
  const sel = text.slice(start, end)
  const m = before.match(/\{(\\(?:footnotesize|small|large|Large|LARGE)) $/)
  const level = m && after.startsWith('}') ? LATEX_SIZES.indexOf(m[1]) : 2
  const next = level + dir
  if (next < 0 || next >= LATEX_SIZES.length) return { error: dir > 0 ? 'That is as big as it goes.' : 'That is as small as it goes.' }
  const cut = m && after.startsWith('}') ? m[0].length : 0
  const rest = cut ? after.slice(1) : after
  const head = before.slice(0, before.length - cut)
  if (!LATEX_SIZES[next]) return { value: head + sel + rest, start: head.length, end: head.length + sel.length }
  const open = `{${LATEX_SIZES[next]} `
  return { value: head + open + sel + '}' + rest, start: head.length + open.length, end: head.length + open.length + sel.length }
}
