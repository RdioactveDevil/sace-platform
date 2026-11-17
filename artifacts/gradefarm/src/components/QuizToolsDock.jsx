import { useState, useRef, useEffect, useCallback } from 'react'
import { Calculator as CalculatorIcon, BookOpen, Wrench, ExternalLink } from 'lucide-react'
import { appZoom } from '../lib/appZoom'
import { THEMES } from '../lib/theme'

const NAVY = '#0c1037'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_M = "'JetBrains Mono', monospace"

// ── Tool registry ───────────────────────────────────────────────────────────
// The data booklet is the subject's official SACE / VCAA booklet or formula
// sheet (a PDF uploaded in Admin → Curricula → Student features), never a
// generic list of formulas, so it's only offered once one is uploaded.
const TOOLS = [
  { id: 'calc',     icon: CalculatorIcon, label: 'Calculator',   w: 300, h: 440 },
  { id: 'booklet',  icon: BookOpen,       label: 'Data booklet', w: 720, h: 620 },
]

// ── Safe calculator evaluator ────────────────────────────────────────────────
function evaluateExpression(raw, deg) {
  let s = String(raw)
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, '(PI)')
    .replace(/√/g, 'sqrt')
    .replace(/\^/g, '**')
    .replace(/%/g, '/100')
    // standalone e → Euler's number (not part of an identifier like "exp")
    .replace(/(?<![a-zA-Z0-9_])e(?![a-zA-Z0-9_])/g, '(E)')
  // factorial: 5! → fact(5)
  s = s.replace(/(\d+(?:\.\d+)?)!/g, 'fact($1)')

  const k = deg ? Math.PI / 180 : 1
  // eslint-disable-next-line no-new-func
  const fn = new Function(`"use strict";
    const {abs,exp,floor,ceil,round,sign,pow,PI,E}=Math;
    const sqrt=Math.sqrt, ln=Math.log, log=Math.log10;
    const sin=(x)=>Math.sin(x*${k}), cos=(x)=>Math.cos(x*${k}), tan=(x)=>Math.tan(x*${k});
    const asin=(x)=>Math.asin(x)/${k}, acos=(x)=>Math.acos(x)/${k}, atan=(x)=>Math.atan(x)/${k};
    const fact=(n)=>{n=Math.round(n); if(n<0||n>170)return NaN; let r=1; for(let i=2;i<=n;i++)r*=i; return r;};
    return (${s});`)
  const val = fn()
  if (typeof val !== 'number' || !isFinite(val)) return 'Error'
  // Trim floating-point noise, keep up to 10 significant digits.
  return String(parseFloat(val.toPrecision(10)))
}

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
function Calculator({ theme }) {
  const t = THEMES[theme]
  const [expr, setExpr] = useState('')
  const [result, setResult] = useState('')
  const [deg, setDeg] = useState(true)
  const [ans, setAns] = useState('0')

  const push = (token) => { setExpr(e => e + token); setResult('') }
  const clear = () => { setExpr(''); setResult('') }
  const back = () => setExpr(e => e.slice(0, -1))
  const equals = () => {
    if (!expr.trim()) return
    const r = evaluateExpression(expr, deg)
    setResult(r)
    if (r !== 'Error') setAns(r)
  }

  const KEYS = [
    ['sin(', 'cos(', 'tan(', '(', ')'],
    ['ln(', 'log(', '√(', 'π', 'e'],
    ['7', '8', '9', '÷', '^'],
    ['4', '5', '6', '×', '!'],
    ['1', '2', '3', '−', '%'],
    ['0', '.', 'Ans', '+', '='],
  ]

  const isOp = (k) => ['÷', '×', '−', '+', '^'].includes(k)
  const isFn = (k) => /[a-zπe√√]/i.test(k) && k !== 'Ans'

  const handle = (k) => {
    if (k === '=') return equals()
    if (k === 'Ans') return push(ans)
    push(k)
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      {/* Display */}
      <div style={{ background: t.bgSubtle, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 12px', minHeight: 64 }}>
        <div style={{ fontFamily: FONT_M, fontSize: 13, color: t.textMuted, wordBreak: 'break-all', minHeight: 18 }}>{expr || ' '}</div>
        <div style={{ fontFamily: FONT_M, fontSize: 22, fontWeight: 800, color: result === 'Error' ? t.danger : t.text, textAlign: 'right', wordBreak: 'break-all' }}>
          {result !== '' ? result : ' '}
        </div>
      </div>

      {/* Mode row */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setDeg(d => !d)} style={{ ...modeBtn(t), color: t.text, borderColor: t.border }}>
          {deg ? 'DEG' : 'RAD'}
        </button>
        <button onClick={back} style={modeBtn(t)}>⌫</button>
        <button onClick={clear} style={{ ...modeBtn(t), color: t.danger }}>AC</button>
      </div>

      {/* Keypad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, flex: 1 }}>
        {KEYS.flat().map((k, i) => {
          const equalsKey = k === '='
          return (
            <button
              key={i}
              onClick={() => handle(k)}
              style={{
                border: `1px solid ${t.border}`,
                borderRadius: 9,
                fontFamily: FONT_M,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                padding: '0',
                minHeight: 38,
                transition: 'all 0.12s',
                background: equalsKey ? t.accent
                  : isOp(k) ? t.bgHover
                  : t.bgSubtle,
                color: equalsKey ? NAVY : isFn(k) ? t.textSub : t.text,
              }}
            >{k}</button>
          )
        })}
      </div>
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
