import { useState, useRef, useEffect, useCallback } from 'react'
import { THEMES } from '../lib/theme'
import { ELEMENTS, CATEGORIES } from '../lib/periodicTable'
import { CONSTANTS, FORMULAS } from '../lib/dataSheet'
import { UNIT_CATEGORIES, convert } from '../lib/unitConversions'
import MathText from './MathText'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const NAVY = '#0c1037'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_M = "'JetBrains Mono', monospace"

// ── Tool registry ───────────────────────────────────────────────────────────
const TOOLS = [
  { id: 'calc',     icon: '🧮', label: 'Calculator',    w: 300, h: 440 },
  { id: 'periodic', icon: '⚛',  label: 'Periodic Table', w: 640, h: 480 },
  { id: 'data',     icon: '📐', label: 'Data Sheet',     w: 360, h: 460 },
  { id: 'convert',  icon: '🔁', label: 'Unit Converter', w: 320, h: 360 },
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
function FloatingWindow({ tool, theme, onClose, initial, zIndex, onFocus, isMobile }) {
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
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      const maxX = window.innerWidth - 120
      const maxY = window.innerHeight - 60
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
    : { position: 'fixed', left: pos.x, top: pos.y, width: tool.w, maxWidth: 'calc(100vw - 16px)', height: tool.h, maxHeight: 'calc(100vh - 16px)' }

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
          padding: '10px 12px',
          background: `linear-gradient(135deg,${GOLD},${GOLDL})`,
          cursor: isMobile ? 'default' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, color: NAVY, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>{tool.icon}</span>{tool.label}
        </span>
        <button
          onClick={onClose}
          aria-label="Close tool"
          style={{ border: 'none', background: 'rgba(0,0,0,0.12)', color: NAVY, width: 24, height: 24, borderRadius: 7, fontSize: 14, fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}
        >×</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {tool.id === 'calc' && <Calculator theme={theme} />}
        {tool.id === 'periodic' && <PeriodicTable theme={theme} />}
        {tool.id === 'data' && <DataSheet theme={theme} />}
        {tool.id === 'convert' && <UnitConverter theme={theme} />}
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
        <button onClick={() => setDeg(d => !d)} style={{ ...modeBtn(t), color: GOLD, borderColor: t.borderAccent }}>
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
                background: equalsKey ? `linear-gradient(135deg,${GOLD},${GOLDL})`
                  : isOp(k) ? t.bgHover
                  : isFn(k) ? t.accentGlow2
                  : t.bgSubtle,
                color: equalsKey ? NAVY : isFn(k) ? GOLD : t.text,
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

// ── Periodic table ───────────────────────────────────────────────────────────
function PeriodicTable({ theme }) {
  const t = THEMES[theme]
  const [sel, setSel] = useState(null)

  return (
    <div style={{ padding: 12 }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(18, minmax(26px, 1fr))',
          gridTemplateRows: 'repeat(10, auto)',
          gap: 2,
          minWidth: 560,
        }}>
          {ELEMENTS.map(el => {
            const c = CATEGORIES[el.cat]?.color || CATEGORIES.unknown.color
            const active = sel?.n === el.n
            return (
              <button
                key={el.n}
                onClick={() => setSel(el)}
                title={`${el.name} — ${el.mass}`}
                style={{
                  gridColumn: el.x, gridRow: el.y,
                  aspectRatio: '1 / 1',
                  border: `1px solid ${active ? GOLD : c + '66'}`,
                  background: active ? c + '44' : c + '1f',
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  padding: 1, lineHeight: 1, overflow: 'hidden',
                }}
              >
                <span style={{ fontSize: 7, color: t.textMuted }}>{el.n}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: t.text }}>{el.sym}</span>
              </button>
            )
          })}
          {/* f-block placeholder markers in the main grid */}
          <div style={{ gridColumn: 3, gridRow: 6, ...markerCell(t) }}>57–71</div>
          <div style={{ gridColumn: 3, gridRow: 7, ...markerCell(t) }}>89–103</div>
        </div>
      </div>

      {/* Detail / legend strip */}
      {sel ? (
        <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, background: t.bgSubtle, border: `1px solid ${t.border}`, display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 54, height: 54, borderRadius: 10, flexShrink: 0, background: (CATEGORIES[sel.cat]?.color || '#888') + '2a', border: `1px solid ${CATEGORIES[sel.cat]?.color}66`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 9, color: t.textMuted }}>{sel.n}</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: t.text }}>{sel.sym}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>{sel.name}</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
              Atomic mass <b style={{ color: GOLD }}>{sel.mass}</b> · Group {sel.group} · Period {sel.period}
            </div>
            <div style={{ fontSize: 11, color: CATEGORIES[sel.cat]?.color, marginTop: 2, fontWeight: 700 }}>{CATEGORIES[sel.cat]?.label}</div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.values(CATEGORIES).map(cat => (
            <span key={cat.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: t.textMuted }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: cat.color }} />{cat.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function markerCell(t) {
  return {
    aspectRatio: '1 / 1', borderRadius: 4, border: `1px dashed ${t.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 7, color: t.textFaint, fontWeight: 700,
  }
}

// ── Data sheet ───────────────────────────────────────────────────────────────
function DataSheet({ theme }) {
  const t = THEMES[theme]
  const subjects = Object.keys(FORMULAS)
  const [tab, setTab] = useState('Constants')
  const tabs = ['Constants', ...subjects]
  const rows = tab === 'Constants'
    ? CONSTANTS.map(c => ({ left: c.sym ? <MathText text={c.sym} /> : c.name, sub: c.sym ? c.name : null, right: <MathText text={c.value} /> }))
    : (FORMULAS[tab] || []).map(f => ({ left: f.name, sub: null, right: <MathText text={f.value} /> }))

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
        {tabs.map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            style={{
              padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              fontFamily: FONT_B, transition: 'all 0.12s',
              border: `1px solid ${tab === tb ? t.borderAccent : t.border}`,
              background: tab === tb ? t.accentGlow : 'transparent',
              color: tab === tb ? GOLD : t.textMuted,
            }}>{tb}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '9px 11px', borderRadius: 9,
            background: i % 2 ? t.bgSubtle : 'transparent',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>{r.left}</div>
              {r.sub && <div style={{ fontSize: 11, color: t.textMuted }}>{r.sub}</div>}
            </div>
            <div style={{ fontSize: 13, color: GOLD, textAlign: 'right', flexShrink: 0 }}>{r.right}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Unit converter ───────────────────────────────────────────────────────────
function UnitConverter({ theme }) {
  const t = THEMES[theme]
  const categories = Object.keys(UNIT_CATEGORIES)
  const [cat, setCat] = useState('Length')
  const units = Object.keys(UNIT_CATEGORIES[cat].units)
  const [from, setFrom] = useState(units[0])
  const [to, setTo] = useState(units[1] || units[0])
  const [value, setValue] = useState('1')

  // Reset units when category changes.
  const onCat = (c) => {
    const u = Object.keys(UNIT_CATEGORIES[c].units)
    setCat(c); setFrom(u[0]); setTo(u[1] || u[0])
  }

  const num = parseFloat(value)
  const out = isNaN(num) ? '' : convert(cat, num, from, to)
  const outStr = out === '' ? '' : String(parseFloat(Number(out).toPrecision(8)))

  const sel = {
    width: '100%', padding: '9px 10px', borderRadius: 9, fontSize: 13,
    border: `1px solid ${t.border}`, background: t.bgSubtle, color: t.text,
    fontFamily: FONT_B, cursor: 'pointer',
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <select value={cat} onChange={e => onCat(e.target.value)} style={sel}>
        {categories.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      <div>
        <label style={lbl(t)}>From</label>
        <input
          type="number"
          value={value}
          onChange={e => setValue(e.target.value)}
          style={{ ...sel, fontFamily: FONT_M, marginBottom: 6 }}
        />
        <select value={from} onChange={e => setFrom(e.target.value)} style={sel}>
          {units.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      <div style={{ textAlign: 'center', color: GOLD, fontSize: 18 }}>↓</div>

      <div>
        <label style={lbl(t)}>To</label>
        <div style={{ ...sel, fontFamily: FONT_M, marginBottom: 6, color: GOLD, fontWeight: 800, minHeight: 38, display: 'flex', alignItems: 'center' }}>
          {outStr || '—'}
        </div>
        <select value={to} onChange={e => setTo(e.target.value)} style={sel}>
          {units.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
    </div>
  )
}

function lbl(t) {
  return { display: 'block', fontSize: 10, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }
}

// ── Main dock ────────────────────────────────────────────────────────────────
export default function QuizToolsDock({ theme = 'dark' }) {
  const t = THEMES[theme]
  const [open, setOpen] = useState([])        // array of open tool ids
  const [expanded, setExpanded] = useState(false)
  const [topId, setTopId] = useState(null)     // which window is focused (on top)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 860)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 860)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const toggleTool = (id) => {
    setOpen(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    setTopId(id)
    if (isMobile) setExpanded(false)
  }
  const closeTool = (id) => setOpen(prev => prev.filter(x => x !== id))

  // Cascade initial positions so multiple windows don't stack perfectly.
  const initialFor = (id) => {
    const idx = TOOLS.findIndex(tt => tt.id === id)
    return { x: Math.max(16, window.innerWidth - 380 - idx * 28), y: 88 + idx * 28 }
  }

  return (
    <>
      {/* Open windows */}
      {open.map((id, i) => {
        const tool = TOOLS.find(tt => tt.id === id)
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
          />
        )
      })}

      {/* Launcher */}
      <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 2100, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, fontFamily: FONT_B }}>
        {expanded && TOOLS.map(tool => {
          const isOpen = open.includes(tool.id)
          return (
            <button
              key={tool.id}
              onClick={() => toggleTool(tool.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 14px 8px 12px', borderRadius: 999,
                border: `1px solid ${isOpen ? t.borderAccent : t.border}`,
                background: isOpen ? t.accentGlow : t.bgCard,
                color: isOpen ? GOLD : t.text,
                boxShadow: t.shadowCard, cursor: 'pointer',
                fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                animation: 'gf-tooldock-in 0.16s ease',
              }}
            >
              <span style={{ fontSize: 16 }}>{tool.icon}</span>{tool.label}
              {isOpen && <span style={{ fontSize: 10, color: GOLD }}>● open</span>}
            </button>
          )
        })}
        <button
          onClick={() => setExpanded(e => !e)}
          aria-label="Study tools"
          style={{
            width: 56, height: 56, borderRadius: '50%',
            border: 'none', cursor: 'pointer',
            background: `linear-gradient(135deg,${GOLD},${GOLDL})`,
            color: NAVY, fontSize: 24, boxShadow: '0 6px 20px rgba(241,190,67,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.18s',
            transform: expanded ? 'rotate(45deg)' : 'none',
          }}
        >
          {expanded ? '+' : '🧰'}
        </button>
      </div>
      <style>{`@keyframes gf-tooldock-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </>
  )
}
