import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { THEMES } from '../lib/theme'
import { findQuoteRects, mergeLineRects, layoutNotes, noteSize, handPath } from '../lib/advice'
import MathText from './MathText'
import TableView from './TableView'

// Titan's Advice: the question drawn with a teacher's pen marks over it —
// underlines, circles and boxes on the words and quantities that matter, table
// cells circled, and short handwritten notes with arrows. The marks come from
// /api/marked/advice ({ notes, cells, steps }); this finds each quoted phrase
// on screen and draws over it, so it works at any width.

const HAND = "'Caveat', 'Comic Sans MS', cursive"
const NOTE_SIZE = 20

export const penColor = (theme) => (theme === 'light' ? '#c2362d' : '#ff8f80')

function Mark({ kind, rect, seed, pen }) {
  const common = { fill: 'none', stroke: pen, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const at = (x, y, w, h, k, sd) => <path transform={`translate(${x} ${y})`} d={handPath(k, sd, w, h)} {...common} />
  const { x, y, w, h } = rect
  if (kind === 'circle') return at(x - 10, y - 6, w + 20, h + 12, 'circle', seed)
  if (kind === 'box') return at(x - 4, y - 3, w + 8, h + 6, 'box', seed)
  if (kind === 'double_underline') return <g>{at(x - 2, y + h - 2, w + 4, 5, 'underline', seed)}{at(x - 2, y + h + 3, w + 4, 5, 'underline', seed + 7)}</g>
  return at(x - 2, y + h - 1, w + 4, 6, 'underline', seed)
}

function Arrow({ from, to, pen }) {
  const midX = (from[0] + to[0]) / 2 + (to[1] > from[1] ? -10 : 10)
  const midY = (from[1] + to[1]) / 2
  const ang = Math.atan2(to[1] - midY, to[0] - midX)
  const head = (a) => `${to[0] + 8 * Math.cos(a)} ${to[1] + 8 * Math.sin(a)}`
  return (
    <g fill="none" stroke={pen} strokeWidth={1.8} strokeLinecap="round">
      <path d={`M ${from[0]} ${from[1]} Q ${midX} ${midY} ${to[0]} ${to[1]}`} />
      <path d={`M ${head(ang + Math.PI - 0.45)} L ${to[0]} ${to[1]} L ${head(ang + Math.PI + 0.45)}`} />
    </g>
  )
}

/** The question (and its table) with Titan's pen marks drawn over it. */
export function AnnotatedQuestion({ question, advice, theme = 'dark', fontSize = 17 }) {
  const t = THEMES[theme] || THEMES.dark
  const pen = penColor(theme)
  const boxRef = useRef(null)
  const textRef = useRef(null)
  const tableRef = useRef(null)
  const [layout, setLayout] = useState(null)

  const measure = useCallback(() => {
    const box = boxRef.current
    if (!box || !advice) return
    const origin = box.getBoundingClientRect()
    const width = box.clientWidth
    // Relative to the box, and cut at its right edge (a long equation can overflow on a phone).
    const rel = (r) => {
      const x = r.left - origin.left
      return { x, y: r.top - origin.top, w: Math.max(0, Math.min(r.width, width - 4 - x)), h: r.height }
    }
    const marks = []
    const targets = []
    ;(advice.notes || []).forEach((n, i) => {
      const rects = findQuoteRects(textRef.current, n.quote).map(rel)
      if (!rects.length) return
      // A circle or box around words that wrap onto two lines reads badly: underline those instead.
      const kind = rects.length > 1 && (n.mark === 'circle' || n.mark === 'box') ? 'underline' : n.mark
      rects.forEach((r, j) => marks.push({ kind, rect: r, seed: i * 5 + j + 1 }))
      const first = rects[0]
      const sz = noteSize(n.note, NOTE_SIZE)
      // Notes keep clear of the words and of the pen marks under them.
      const below = kind === 'double_underline' ? 9 : kind === 'underline' ? 6 : 3
      const keepOut = rects.map(r => ({ ...r, h: r.h + below }))
      targets.push({ ...first, rects: keepOut, nw: sz.w, nh: sz.h, text: n.note })
    })
    const cellNotes = []
    const rows = tableRef.current?.querySelectorAll('tbody tr') || []
    ;(advice.cells || []).forEach((c, i) => {
      const td = rows[c.row]?.children?.[c.col]
      if (!td) return
      const range = document.createRange()
      range.selectNodeContents(td)
      const [r] = mergeLineRects([...range.getClientRects()])
      if (!r) return
      marks.push({ kind: 'circle', rect: rel({ left: r.left, top: r.top, width: r.width, height: r.height }), seed: 50 + i })
      if (c.note) cellNotes.push(c.note)
    })
    const placed = layoutNotes(targets, width)
    const notes = targets.map((tg, i) => {
      const p = placed[i]
      // Short arrows: point at the part of the target under the note, start from the part of the note over it.
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, Math.max(lo, hi)))
      const toX = clamp(p.x + tg.nw / 2, tg.x + 8, tg.x + tg.w - 8)
      const fromX = clamp(toX, p.x + 10, p.x + tg.nw - 10)
      const from = p.above ? [fromX, p.y + tg.nh] : [fromX, p.y]
      const to = p.above ? [toX, tg.y - 3] : [toX, tg.y + tg.h + 4]
      return { ...p, w: tg.nw, h: tg.nh, text: tg.text, from, to, tilt: i % 2 ? 1.5 : -1.5 }
    })
    setLayout({ marks, notes, cellNotes, w: width, h: box.scrollHeight })
  }, [advice])

  useLayoutEffect(() => { measure() }, [measure, question?.question, fontSize])
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null
    ro?.observe(box)
    if (textRef.current) ro?.observe(textRef.current)
    // KaTeX and the handwriting font load late and change the text's widths: measure again when any font arrives.
    const fonts = document.fonts
    let live = true
    const again = () => { if (live) measure() }
    fonts?.ready?.then(again)
    fonts?.addEventListener?.('loadingdone', again)
    return () => { live = false; ro?.disconnect(); fonts?.removeEventListener?.('loadingdone', again) }
  }, [measure])

  return (
    <div ref={boxRef} style={{ position: 'relative', paddingTop: 6 }}>
      {question.table_data && (
        <div ref={tableRef}>
          <TableView table={question.table_data} theme={theme} />
          {layout?.cellNotes?.length > 0 && (
            <div style={{ fontFamily: HAND, fontSize: NOTE_SIZE, color: pen, lineHeight: 1.2, margin: '-6px 0 10px', transform: 'rotate(-1deg)' }}>
              {layout.cellNotes.map((n, i) => <div key={i}>↑ {n}</div>)}
            </div>
          )}
        </div>
      )}
      <div ref={textRef} style={{ fontSize, fontWeight: 700, color: t.text, lineHeight: 2.75, paddingTop: 14, marginBottom: 12 }}>
        <MathText text={question.question} />
      </div>
      {layout && (
        <>
          <svg width={layout.w} height={layout.h} aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
            {layout.marks.map((m, i) => <Mark key={`m${i}`} {...m} pen={pen} />)}
            {layout.notes.map((n, i) => (Math.hypot(n.to[0] - n.from[0], n.to[1] - n.from[1]) > 16 ? <Arrow key={`a${i}`} from={n.from} to={n.to} pen={pen} /> : null))}
          </svg>
          {layout.notes.map((n, i) => (
            <div key={`n${i}`} style={{ position: 'absolute', left: n.x, top: n.y, width: n.w + 20, fontFamily: HAND, fontSize: NOTE_SIZE, fontWeight: 600, lineHeight: 1.1, color: pen, whiteSpace: 'nowrap', transform: `rotate(${n.tilt}deg)`, pointerEvents: 'none' }}>
              {n.text}
            </div>
          ))}
        </>
      )}
      {/* The notes, readable by screen readers and when a phrase couldn't be found on screen. */}
      <ul style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', margin: 0, padding: 0 }}>
        {(advice?.notes || []).map((n, i) => <li key={i}>{n.quote.replace(/\$/g, '')}: {n.note}</li>)}
      </ul>
    </div>
  )
}

/** The steps from the question to the answer, and where this student's answer went wrong. */
export function AdviceSteps({ advice, marking, theme = 'dark' }) {
  const t = THEMES[theme] || THEMES.dark
  const missed = (marking?.marks || []).find(m => m.awarded < m.of)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontFamily: HAND, fontSize: 26, fontWeight: 700, color: penColor(theme), lineHeight: 1 }}>Titan's Advice</div>
      {(advice?.steps || []).length > 0 && (
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5, lineHeight: 1.6, color: t.textSub }}>
          {advice.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
      {missed?.comment && (
        <div style={{ fontSize: 13, lineHeight: 1.6, color: t.textSub, padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgSubtle }}>
          <strong style={{ color: t.text }}>Where your answer went wrong: </strong><MathText text={missed.comment} />
        </div>
      )}
    </div>
  )
}
