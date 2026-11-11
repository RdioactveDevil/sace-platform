import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { THEMES } from '../lib/theme'
import { mergeLineRects, textLineRects, placeNotes, penMarkStyle } from '../lib/advice'
import MathText from './MathText'
import TableView from './TableView'

// Titan's Advice: the question drawn with a teacher's pen marks over it —
// underlines, circles and boxes on the words and quantities that matter, table
// cells circled, and short handwritten notes. The marks come from
// /api/marked/advice ({ notes, cells, steps }).
//
// The marks are part of the question's text, not drawn over it: MathText wraps
// each quoted phrase in a PenMark (its stroke is the element's background) and
// the phrase's first and last word in NoteAnchors, and each note is positioned
// inside one of those words. So the browser keeps every mark and note on its
// words at any zoom, width or font, with nothing to line up; all that's
// measured is which side of its words a note fits on, and a note with no clear
// spot is listed under the question instead.

const HAND = "'Caveat', 'Comic Sans MS', cursive"
const NOTE_SIZE = 20
// The question's line spacing, in pixels: room between two lines for one line
// of handwriting, clear of the pen marks above and below it.
const annotatedLineHeight = (fontSize) => Math.round(fontSize * 1.5 + NOTE_SIZE * 1.1 + 18)
// The style a note is written in; notes are measured in it before they're placed.
const noteStyle = (pen) => ({
  fontFamily: HAND, fontSize: NOTE_SIZE, fontWeight: 600, fontStyle: 'normal', lineHeight: 1.1,
  letterSpacing: 'normal', textDecoration: 'none', textTransform: 'none', textAlign: 'left',
  color: pen, whiteSpace: 'nowrap', width: 'max-content',
})

export const penColor = (theme) => (theme === 'light' ? '#c2362d' : '#ff8f80')

// What the pen marks inside MathText need: the pen, each note and its mark,
// and where each note goes ({ anchor, left, top } in px from its word, or null).
const Pen = createContext(null)

function PenMark({ index, block, children }) {
  const pen = useContext(Pen)
  const kind = pen?.notes[index]?.mark || 'underline'
  const style = useMemo(() => penMarkStyle(kind, index * 5 + 1, pen?.color), [kind, index, pen?.color])
  if (block) return <div data-tm-mark={index} style={{ ...style, display: 'table', margin: '0 auto' }}>{children}</div>
  return <span data-tm-mark={index} style={style}>{children}</span>
}

function NoteAnchor({ index, which, block, children }) {
  const pen = useContext(Pen)
  const spot = pen?.placement?.[index]
  const note = pen?.notes[index]
  const here = spot && note && (which === 'both' || which === spot.anchor)
  const Tag = block ? 'div' : 'span'
  return (
    <Tag data-tm-anchor={index} data-tm-which={which} style={{ position: 'relative', whiteSpace: block ? undefined : 'nowrap' }}>
      {children}
      {here && (
        <span
          data-tm-note={index}
          aria-hidden="true"
          style={{ ...noteStyle(pen.color), position: 'absolute', left: spot.left, top: spot.top, transform: `rotate(${index % 2 ? 0.8 : -0.8}deg)`, pointerEvents: 'none', userSelect: 'none' }}
        >
          {note.note}
        </span>
      )}
    </Tag>
  )
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** The question (and its table) with Titan's pen marks on it. */
export function AnnotatedQuestion({ question, advice, theme = 'dark', fontSize = 17 }) {
  const t = THEMES[theme] || THEMES.dark
  const color = penColor(theme)
  const boxRef = useRef(null)
  const textRef = useRef(null)
  const sizerRef = useRef(null)
  const [placement, setPlacement] = useState(null)
  const notes = useMemo(() => advice?.notes || [], [advice])
  const marks = useMemo(() => ({ quotes: notes.map(n => n.quote), Mark: PenMark, Anchor: NoteAnchor }), [notes])
  const pen = useMemo(() => ({ color, notes, placement }), [color, notes, placement])

  // Decide which side of its words each note goes. Everything is read in the
  // screen's pixels, compared only with itself, and turned back into the
  // page's own pixels (the app is zoomed) as an offset from the note's word.
  const measure = useCallback(() => {
    const text = textRef.current
    if (!text) return
    const area = text.getBoundingClientRect()
    const scale = text.offsetWidth ? area.width / text.offsetWidth : 1
    const R = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })
    const fragments = (el) => (el ? mergeLineRects([...el.getClientRects()]).map(R) : [])
    const word = (i, which) => text.querySelector(`[data-tm-anchor="${i}"][data-tm-which="${which}"], [data-tm-anchor="${i}"][data-tm-which="both"]`)
    const sizes = [...(sizerRef.current?.children || [])].map(el => ({ w: el.offsetWidth * scale, h: el.offsetHeight * scale }))
    const obstacles = [...textLineRects(text).map(R), ...[...text.querySelectorAll('[data-tm-mark]')].flatMap(fragments)]
    const wanted = notes.map((n, i) => {
      const start = word(i, 'start'), end = word(i, 'end')
      if (!start || !end || !sizes[i]) return null
      return {
        ...sizes[i],
        anchors: { start: R(start.getBoundingClientRect()), end: R(end.getBoundingClientRect()) },
        frags: fragments(text.querySelector(`[data-tm-mark="${i}"]`)),
      }
    })
    // Within the question's own text (not up over its table and the table's notes).
    const bounds = { left: area.left, right: area.right, top: area.top, bottom: area.bottom + 12 * scale }
    const spots = placeNotes(wanted, obstacles, bounds, { clear: 3 * scale, gap: 10 * scale })
    const px = (v) => Math.round(v * 2) / 2
    const next = spots.map((s, i) => {
      if (!s) return null
      const a = wanted[i].anchors[s.anchor]
      return { anchor: s.anchor, left: px((s.x - a.x) / scale), top: px((s.y - a.y) / scale) }
    })
    setPlacement(prev => (same(prev, next) ? prev : next))
  }, [notes])

  useLayoutEffect(() => { measure() }, [measure, question?.question, fontSize])
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    // One measure per frame, however many events fire.
    let frame = 0
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => measure()) }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    ro?.observe(box)
    if (textRef.current) ro?.observe(textRef.current)
    window.addEventListener('resize', schedule)
    // The page around it settles after the first paint (the marks panel slides in).
    const late = setTimeout(schedule, 350)
    // KaTeX and the handwriting font load late and change the text's widths: measure again when any font arrives.
    const fonts = document.fonts
    let live = true
    const again = () => { if (live) schedule() }
    fonts?.ready?.then(again)
    fonts?.addEventListener?.('loadingdone', again)
    return () => {
      live = false
      cancelAnimationFrame(frame)
      clearTimeout(late)
      ro?.disconnect()
      window.removeEventListener('resize', schedule)
      fonts?.removeEventListener?.('loadingdone', again)
    }
  }, [measure])

  // Table cells: circled where they are, with their notes under the table.
  const table = question.table_data
  const cells = (advice?.cells || []).filter(c => Array.isArray(table?.rows?.[c.row]) && c.col < table.rows[c.row].length)
  const circled = new Map(cells.map((c, i) => [`${c.row}:${c.col}`, i]))
  const renderCell = (v, at) => {
    const i = at && !at.header ? circled.get(`${at.row}:${at.col}`) : undefined
    return i === undefined ? v : <span data-tm-cell style={penMarkStyle('circle', 50 + i, color)}>{v}</span>
  }
  const cellNotes = cells.map(c => c.note).filter(Boolean)
  // Notes with no clear spot beside their words (or whose words weren't found), so they don't cover the question.
  const extra = placement ? notes.filter((_, i) => !placement[i]) : []

  return (
    <Pen.Provider value={pen}>
      <div ref={boxRef} style={{ position: 'relative', paddingTop: 6 }}>
        {table && (
          <div>
            <TableView table={table} theme={theme} renderCell={renderCell} />
            {cellNotes.length > 0 && (
              <div style={{ fontFamily: HAND, fontSize: NOTE_SIZE, color, lineHeight: 1.2, margin: '-6px 0 10px', transform: 'rotate(-1deg)' }}>
                {cellNotes.map((n, i) => <div key={i}>↑ {n}</div>)}
              </div>
            )}
          </div>
        )}
        <div ref={textRef} style={{ fontSize, fontWeight: 700, color: t.text, lineHeight: `${annotatedLineHeight(fontSize)}px`, paddingTop: 12, marginBottom: 12 }}>
          <MathText text={question.question} marks={marks} />
        </div>
        {extra.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {extra.map((n, i) => (
              <li key={i} style={{ ...noteStyle(color), whiteSpace: 'normal', width: 'auto' }}>
                <span style={{ opacity: 0.75, fontFamily: 'inherit' }}>“<MathText text={n.quote} />”</span> → {n.note}
              </li>
            ))}
          </ul>
        )}
        {/* Hidden copies of the notes, to measure them in the font they're drawn in. */}
        <div ref={sizerRef} aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 0, overflow: 'hidden', visibility: 'hidden', pointerEvents: 'none' }}>
          {notes.map((n, i) => <span key={i} style={{ ...noteStyle(color), position: 'absolute', left: 0, top: 0 }}>{n.note}</span>)}
        </div>
        {/* The notes, readable by screen readers. */}
        <ul style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', margin: 0, padding: 0 }}>
          {notes.map((n, i) => <li key={i}>{n.quote.replace(/\$/g, '')}: {n.note}</li>)}
        </ul>
      </div>
    </Pen.Provider>
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
