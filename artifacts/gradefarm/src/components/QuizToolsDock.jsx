import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { Calculator as CalculatorIcon, BookOpen, Wrench, ExternalLink } from 'lucide-react'
import { appZoom } from '../lib/appZoom'
import { THEMES } from '../lib/theme'
import { evaluate, formatResult, CalcError } from '../lib/calculator'

const NAVY = '#0c1037'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_M = "'JetBrains Mono', monospace"

// ── Tool registry ───────────────────────────────────────────────────────────
// The data booklet is the subject's official SACE / VCAA booklet or formula
// sheet (a PDF uploaded in Admin → Curricula → Student features), never a
// generic list of formulas, so it's only offered once one is uploaded.
const TOOLS = [
  { id: 'calc',     icon: CalculatorIcon, label: 'Calculator',   w: 340, h: 580 },
  { id: 'booklet',  icon: BookOpen,       label: 'Data booklet', w: 720, h: 620 },
]

// ── Draggable / resizable floating window ────────────────────────────────────
function FloatingWindow({ tool, theme, onClose, initial, zIndex, onFocus, isMobile, booklet }) {
  const t = THEMES[theme]
  const [pos, setPos] = useState(initial)
  const dragRef = useRef(null)

  const onPointerDown = useCallback((e) => {
    if (isMobile) return
    onFocus?.()
    const startX = e.clientX
    const startY = e.clientY
    const origin = { ...pos }
    dragRef.current = { startX, startY, origin }
    const move = (ev) => {
      // Pointer moves are in screen pixels; the dock sits inside the zoomed app.
      const z = appZoom()
      const dx = (ev.clientX - dragRef.current.startX) / z
      const dy = (ev.clientY - dragRef.current.startY) / z
      const maxX = window.innerWidth / z - 120
      const maxY = window.innerHeight / z - 60
      setPos({
        x: Math.max(8, Math.min(maxX, dragRef.current.origin.x + dx)),
        y: Math.max(8, Math.min(maxY, dragRef.current.origin.y + dy)),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [pos, isMobile, onFocus])

  const frameStyle = isMobile
    ? { position: 'fixed', inset: '8px', width: 'auto', height: 'auto', maxHeight: 'calc(100vh - 16px)' }
    : { position: 'fixed', left: pos.x, top: pos.y, width: tool.w, maxWidth: `calc(100vw / ${appZoom()} - 16px)`, height: tool.h, maxHeight: `calc(100vh / ${appZoom()} - 16px)` }

  return (
    <div
      onPointerDown={onFocus}
      style={{
        ...frameStyle,
        zIndex,
        background: t.bgCard,
        border: `1px solid ${t.borderAccent}`,
        borderRadius: 16,
        boxShadow: t.shadowModal,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: FONT_B,
      }}
    >
      <div
        onPointerDown={onPointerDown}
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '9px 12px',
          background: t.bgSubtle,
          borderBottom: `1px solid ${t.border}`,
          cursor: isMobile ? 'default' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          <tool.icon size={15} style={{ flexShrink: 0 }} aria-hidden="true" />{tool.label}
        </span>
        <button
          onClick={onClose}
          aria-label="Close tool"
          style={{ border: 'none', background: 'transparent', color: t.textMuted, width: 24, height: 24, borderRadius: 7, fontSize: 16, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}
        >×</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {tool.id === 'calc' && <Calculator theme={theme} />}
        {tool.id === 'booklet' && <DataBooklet theme={theme} booklet={booklet} />}
      </div>
    </div>
  )
}

// ── Scientific calculator ────────────────────────────────────────────────────
// A text box the student types into (or fills from the keypad, which inserts
// at the cursor), worked out by lib/calculator.js. Keys: Enter or = works it
// out, Esc clears, ↑ ↓ bring back earlier sums. After an answer, an operator
// carries on from Ans and anything else starts a new sum, as on a calculator.
// The quiz's own shortcuts ignore keys typed into a text box, so typing "2"
// here never picks option 2.

const KEYPAD = [
  [{ l: 'sin', i: 'sin(' }, { l: 'cos', i: 'cos(' }, { l: 'tan', i: 'tan(' }, { l: '(', i: '(' }, { l: ')', i: ')' }],
  [{ l: 'sin⁻¹', i: 'sin⁻¹(' }, { l: 'cos⁻¹', i: 'cos⁻¹(' }, { l: 'tan⁻¹', i: 'tan⁻¹(' }, { l: 'x²', i: '²', k: '²' }, { l: 'xʸ', i: '^', k: '^' }],
  [{ l: 'ln', i: 'ln(' }, { l: 'log', i: 'log(' }, { l: '√', i: '√(' }, { l: 'eˣ', i: 'e^(' }, { l: '10ˣ', i: '10^(' }],
  [{ l: 'π', i: 'π' }, { l: 'e', i: 'e' }, { l: 'x!', i: '!', k: '!' }, { l: 'x⁻¹', i: '⁻¹' }, { l: '×10ˣ', i: 'E', k: 'E', title: 'Scientific notation: 6.02×10²³ is typed 6.02E23' }],
  [{ l: '7' }, { l: '8' }, { l: '9' }, { l: '÷', i: '÷', k: '/', op: true }, { l: 'nCr', i: 'nCr(', title: 'Combinations: nCr(5, 2)' }],
  [{ l: '4' }, { l: '5' }, { l: '6' }, { l: '×', i: '×', k: '*', op: true }, { l: '%', i: '%', k: '%' }],
  [{ l: '1' }, { l: '2' }, { l: '3' }, { l: '−', i: '-', k: '-', op: true }, { l: 'Ans', i: 'Ans', title: 'The last answer' }],
  [{ l: '0' }, { l: '.' }, { l: ',', i: ',', title: 'Separates two numbers, as in nCr(5, 2)' }, { l: '+', i: '+', k: '+', op: true }, { l: '=', eq: true, k: 'Enter' }],
]

// Typed characters shown the way the keypad writes them.
const TYPED = { '*': '×', '/': '÷' }
// After an answer, these carry on from it ("Ans×2"); anything else starts afresh.
const CARRIES_ON = /^([+\-×÷^²³!%]|⁻¹)/

function Calculator({ theme }) {
  const t = THEMES[theme]
  const inputRef = useRef(null)
  const [expr, setExpr] = useState('')
  const [shown, setShown] = useState(null)       // { text, mantissa?, exponent? } or { error }
  const [deg, setDeg] = useState(true)
  const [ans, setAns] = useState(0)
  const [history, setHistory] = useState([])     // newest first: { expr, text }
  const [histAt, setHistAt] = useState(-1)
  const [fresh, setFresh] = useState(false)      // the answer on show is for the sum in the box
  // On a touch screen the keypad is the keyboard, so the phone's own stays down.
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

  useEffect(() => { if (!touch) inputRef.current?.focus() }, [touch])

  // Where the cursor goes after the next render. Set straight after React
  // writes the box, before the next keystroke, so fast typing lands in order.
  const caretRef = useRef(null)
  useLayoutEffect(() => {
    const el = inputRef.current, caret = caretRef.current
    if (!el || caret == null) return
    caretRef.current = null
    if (!touch && document.activeElement !== el) el.focus()
    el.setSelectionRange(caret, caret)
  })

  const place = (next, caret) => {
    setExpr(next); setShown(null); setHistAt(-1)
    caretRef.current = caret
  }

  const insert = (txt) => {
    const el = inputRef.current
    if (fresh) {
      setFresh(false)
      const base = CARRIES_ON.test(txt) ? 'Ans' : ''
      place(base + txt, base.length + txt.length)
      return
    }
    const start = el?.selectionStart ?? expr.length
    const end = el?.selectionEnd ?? expr.length
    place(expr.slice(0, start) + txt + expr.slice(end), start + txt.length)
  }

  const backspace = () => {
    const el = inputRef.current
    setFresh(false)
    const start = el?.selectionStart ?? expr.length
    const end = el?.selectionEnd ?? expr.length
    if (start !== end) { place(expr.slice(0, start) + expr.slice(end), start); return }
    if (!start) return
    // ⁻¹ is two characters but one key.
    const cut = expr.slice(0, start).endsWith('⁻¹') ? 2 : 1
    place(expr.slice(0, start - cut) + expr.slice(start), start - cut)
  }

  const clear = () => { setFresh(false); place('', 0) }

  const equals = () => {
    if (!expr.trim()) return
    try {
      const v = evaluate(expr, { ans, deg })
      const out = formatResult(v)
      setAns(v)
      setShown(out)
      setFresh(true)
      setHistory(h => [{ expr, text: out.text }, ...h.filter(x => x.expr !== expr)].slice(0, 20))
      setHistAt(-1)
    } catch (e) {
      setShown({ error: e instanceof CalcError ? e.message : 'Syntax error' })
      setFresh(false)
    }
  }

  // While typing, the answer so far is shown faintly underneath.
  const preview = useMemo(() => {
    if (fresh || !expr.trim()) return ''
    try { return formatResult(evaluate(expr, { ans, deg })).text } catch { return '' }
  }, [expr, ans, deg, fresh])

  const onKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); return }
    if (e.key === 'Escape') { if (expr) { e.preventDefault(); e.stopPropagation(); clear() } return }
    if (e.key === 'Backspace' && fresh) { e.preventDefault(); setFresh(false); place(expr, expr.length); return }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!history.length) return
      e.preventDefault()
      const at = Math.max(-1, Math.min(history.length - 1, histAt + (e.key === 'ArrowUp' ? 1 : -1)))
      const next = at === -1 ? '' : history[at].expr
      setExpr(next); setHistAt(at); setShown(null); setFresh(false)
      caretRef.current = next.length
      return
    }
    if (e.key.length === 1 && (fresh || TYPED[e.key])) {
      e.preventDefault()
      insert(TYPED[e.key] || e.key)
    }
  }

  const keyBtn = (k, i) => {
    const label = k.l
    const isNum = /^[\d.]$/.test(label)
    return (
      <button
        key={i}
        type="button"
        title={k.title || (k.k ? `Key: ${k.k}` : undefined)}
        // Keep the cursor in the box, so typing carries on after a click.
        onMouseDown={e => e.preventDefault()}
        onClick={() => (k.eq ? equals() : insert(k.i ?? label))}
        style={{
          border: `1px solid ${t.border}`, borderRadius: 9, cursor: 'pointer', padding: 0, minHeight: 36,
          fontFamily: isNum || k.eq ? FONT_M : FONT_B, fontSize: isNum ? 15 : 12.5, fontWeight: isNum || k.eq || k.op ? 800 : 700,
          background: k.eq ? t.accent : k.op ? t.bgHover : isNum ? t.bgCard : t.bgSubtle,
          color: k.eq ? NAVY : isNum || k.op ? t.text : t.textSub,
        }}
      >{label}</button>
    )
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: '100%', boxSizing: 'border-box' }}
      onMouseDown={e => { if (e.target === e.currentTarget && !touch) { e.preventDefault(); inputRef.current?.focus() } }}>
      {/* Display: the sum (typed or keyed) and the answer */}
      <div style={{ background: t.bgSubtle, border: `1px solid ${t.border}`, borderRadius: 10, padding: '8px 10px' }}>
        <input
          ref={inputRef}
          value={expr}
          onChange={e => { setExpr(e.target.value); setShown(null); setFresh(false); setHistAt(-1) }}
          onKeyDown={onKeyDown}
          inputMode={touch ? 'none' : 'text'}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          aria-label="Calculation"
          placeholder="Type a sum, e.g. 0.40 × 2.5 × 44.0"
          style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', background: 'transparent', color: t.text, fontFamily: FONT_M, fontSize: 15, padding: '2px 0' }}
        />
        <div aria-live="polite" style={{ fontFamily: FONT_M, textAlign: 'right', minHeight: 30, wordBreak: 'break-all', fontWeight: 800,
          fontSize: shown ? 22 : 15, color: shown?.error ? t.danger : shown ? t.text : t.textFaint }}>
          {shown?.error ? shown.error
            : shown?.mantissa ? <>{shown.mantissa}<span style={{ fontWeight: 600 }}> × 10</span><sup style={{ fontSize: '0.6em' }}>{shown.exponent}</sup></>
            : shown ? shown.text
            : preview ? `= ${preview}` : ' '}
        </div>
      </div>

      {/* Mode row */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setDeg(d => !d)}
          title="Angles in degrees or radians" style={{ ...modeBtn(t), color: t.text }}>{deg ? 'DEG' : 'RAD'}</button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={backspace} title="Key: Backspace" aria-label="Delete" style={modeBtn(t)}>⌫</button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={clear} title="Key: Esc" style={{ ...modeBtn(t), color: t.danger }}>AC</button>
      </div>

      {/* Keypad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
        {KEYPAD.flat().map(keyBtn)}
      </div>

      {!touch && (
        <div style={{ fontSize: 10.5, color: t.textFaint, textAlign: 'center', lineHeight: 1.5 }}>
          Type with your keyboard · Enter = · Esc clears · ↑ ↓ earlier sums
        </div>
      )}
    </div>
  )
}

function modeBtn(t) {
  return {
    flex: 1, padding: '7px 0', borderRadius: 8, border: `1px solid ${t.border}`,
    background: t.bgSubtle, color: t.textMuted, fontSize: 12, fontWeight: 800,
    cursor: 'pointer', fontFamily: FONT_B,
  }
}

// ── Official data booklet ───────────────────────────────────────────────────
// The PDF itself, as the exam hands it out: the browser's PDF viewer scrolls,
// zooms and searches it. Phones that won't show a PDF inline get the link.
function DataBooklet({ theme, booklet }) {
  const t = THEMES[theme]
  if (!booklet?.url) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <iframe
        title={booklet.title || 'Data booklet'}
        src={`${booklet.url}#view=FitH&toolbar=1`}
        style={{ flex: 1, minHeight: 0, width: '100%', border: 'none', background: '#fff' }}
      />
      <a href={booklet.url} target="_blank" rel="noreferrer"
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderTop: `1px solid ${t.border}`, fontSize: 12, fontWeight: 700, color: t.textSub, textDecoration: 'none' }}>
        <ExternalLink size={13} aria-hidden="true" />Open in a new tab
      </a>
    </div>
  )
}

// ── Main dock ────────────────────────────────────────────────────────────────
/**
 * The tools a subject's questions call for, by its name: a calculator for
 * maths and the sciences, nothing for English, humanities or verbal
 * reasoning. The data booklet is added whenever the subject has its official
 * booklet uploaded (`booklet` from dataBookletFor in lib/subjects.js).
 */
export function toolsForSubject(name, booklet = null) {
  const n = String(name || '').toLowerCase()
  const withBooklet = (ids) => (booklet?.url ? [...ids, 'booklet'] : ids)
  if (/english|literary|literature|reading|writing|verbal|history|geograph|business|legal|essay/.test(n)) return withBooklet([])
  return withBooklet(['calc'])
}

/**
 * Study tools for a question: a "Tools" menu (or a single button when the
 * subject has one tool), and each tool opens in a window the student can
 * drag. `tools` limits which are offered. `inline` puts the launcher where
 * it's rendered (the quiz's top bar); otherwise it floats bottom-right.
 */
export default function QuizToolsDock({ theme = 'dark', tools = ['calc'], booklet = null, inline = false }) {
  const t = THEMES[theme]
  // The booklet's own name (e.g. "Formula sheet") labels its button.
  const offered = TOOLS
    .filter(tt => tools.includes(tt.id) && (tt.id !== 'booklet' || booklet?.url))
    .map(tt => (tt.id === 'booklet' && booklet?.title ? { ...tt, label: booklet.title } : tt))
  const [open, setOpen] = useState([])        // array of open tool ids
  const [expanded, setExpanded] = useState(false)
  const [topId, setTopId] = useState(null)     // which window is focused (on top)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 860)
  const menuRef = useRef(null)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 860)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  // Close the menu on a click outside it or Escape.
  useEffect(() => {
    if (!expanded) return
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setExpanded(false) }
    const onKey = (e) => { if (e.key === 'Escape') setExpanded(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [expanded])

  const toggleTool = (id) => {
    setOpen(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    setTopId(id)
    setExpanded(false)
  }
  const closeTool = (id) => setOpen(prev => prev.filter(x => x !== id))

  // Cascade initial positions so multiple windows don't stack perfectly.
  const initialFor = (id) => {
    const idx = TOOLS.findIndex(tt => tt.id === id)
    const w = TOOLS[idx]?.w || 360
    return { x: Math.max(16, window.innerWidth / appZoom() - w - 24 - idx * 28), y: 88 + idx * 28 }
  }

  if (!offered.length) return null
  const barBtn = (on) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${on ? t.text : t.border}`, background: t.bgCard, color: t.text,
    fontFamily: FONT_B, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
    ...(inline ? {} : { padding: '9px 14px', borderRadius: 10, fontSize: 13, boxShadow: t.shadowModal }),
  })
  const single = offered.length === 1 ? offered[0] : null

  return (
    <>
      {/* Open windows */}
      {open.map((id, i) => {
        const tool = offered.find(tt => tt.id === id)
        if (!tool) return null
        return (
          <FloatingWindow
            key={id}
            tool={tool}
            theme={theme}
            isMobile={isMobile}
            initial={initialFor(id)}
            zIndex={2000 + (topId === id ? open.length + 1 : i)}
            onFocus={() => setTopId(id)}
            onClose={() => closeTool(id)}
            booklet={booklet}
          />
        )
      })}

      {/* Launcher: one button for one tool, otherwise a menu */}
      <div style={inline ? { display: 'contents' } : { position: 'fixed', right: 16, bottom: 16, zIndex: 2100 }}>
      {single ? (
        <button type="button" onClick={() => toggleTool(single.id)} aria-pressed={open.includes(single.id)} style={barBtn(open.includes(single.id))}>
          <single.icon size={14} aria-hidden="true" />{isMobile ? null : single.label}
        </button>
      ) : (
        <div ref={menuRef} style={{ position: 'relative', fontFamily: FONT_B }}>
          <button type="button" onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-haspopup="menu" style={barBtn(expanded)}>
            <Wrench size={14} aria-hidden="true" />{isMobile ? null : 'Tools'}
          </button>
          {expanded && (
            <div role="menu" style={{ position: 'absolute', right: 0, ...(inline ? { top: 'calc(100% + 6px)' } : { bottom: 'calc(100% + 6px)' }), zIndex: 2100, minWidth: 190, padding: 5, borderRadius: 10, background: t.bgCard, border: `1px solid ${t.border}`, boxShadow: t.shadowModal, display: 'flex', flexDirection: 'column' }}>
              {offered.map(tool => {
                const isOpen = open.includes(tool.id)
                return (
                  <button key={tool.id} type="button" role="menuitemcheckbox" aria-checked={isOpen} onClick={() => toggleTool(tool.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: t.text, fontFamily: FONT_B, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => { e.currentTarget.style.background = t.bgHover }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <tool.icon size={15} style={{ flexShrink: 0, color: t.textMuted }} aria-hidden="true" />{tool.label}
                    {isOpen && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: t.textMuted }}>Open</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
      </div>
    </>
  )
}
