import { useState, useRef, useReducer, useEffect, useLayoutEffect, useMemo, memo } from 'react'
import { Pencil, Eraser, Type, Sigma, Undo2, Redo2, Grid3x3, Download, X } from 'lucide-react'
import { toast } from 'sonner'
import MathText from './MathText'
import { THEMES } from '../lib/theme'
import { supabase } from '../lib/supabase'
import {
  EMPTY_BOARD, INKS, boardReducer, strokePath, strokeHit, inkBottom, inkColor, newId, displayText, typedLines,
  insertSnippet, MATH_SNIPPETS, checkWorkingSystem, checkWorkingMessage, roughWorkFileName,
} from '../lib/roughWork'

// Rough work on the quiz screen.
//   mode "overlay" (desktop): the page becomes paper. The board covers the
//     question area (render it inside that scrolling element, which must be
//     position: relative) and scrolls with it; ink stays visible after "Done".
//   mode "sheet" (phones): a sheet slides up with its own paper; the question
//     stays in view above it.
// The board is kept by the caller per question (initial / onChange).

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_M = "'JetBrains Mono', ui-monospace, monospace"
const PEN_SIZE = 2.6
const ERASER_R = 10
const ERASER_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22'%3E%3Ccircle cx='11' cy='11' r='9' fill='rgba(255,255,255,0.15)' stroke='%23a1a1aa' stroke-width='1.5'/%3E%3C/svg%3E") 11 11, auto`
const BLANK_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const TOOL_LIST = [
  { id: 'pen', icon: Pencil, label: 'Pen', key: 'P' },
  { id: 'eraser', icon: Eraser, label: 'Eraser', key: 'E' },
  { id: 'text', icon: Type, label: 'Type', key: 'T' },
  { id: 'math', icon: Sigma, label: 'Maths (KaTeX)', key: 'M' },
]

// ── Ink ─────────────────────────────────────────────────────────────────────
// A nested <svg x="50%"> puts (0, 0) at the top-centre, the board's origin.
const InkLayer = memo(function InkLayer({ items, hidden, colorOf }) {
  return (
    <svg aria-hidden="true" width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
      <svg x="50%" overflow="visible">
        {items.map(it => it.type === 'stroke' && (
          <path key={it.id} d={strokePath(it)} fill={colorOf(it.color)} opacity={hidden?.has(it.id) ? 0.2 : 1} />
        ))}
      </svg>
    </svg>
  )
})

function TextItems({ items, hidden, colorOf, editingId, drag, interactive, movable }) {
  return items.map(it => {
    if (it.type !== 'text' || it.id === editingId) return null
    const x = drag?.id === it.id ? drag.x : it.x
    const y = drag?.id === it.id ? drag.y : it.y
    return (
      <div key={it.id} data-rw-text={it.id}
        style={{
          position: 'absolute', left: `calc(50% + ${x}px)`, top: y, padding: '2px 4px', maxWidth: 560,
          color: colorOf(it.color), fontFamily: FONT_B, fontSize: 16, lineHeight: 1.55, whiteSpace: 'pre-wrap',
          opacity: hidden?.has(it.id) ? 0.2 : 1, pointerEvents: interactive ? 'auto' : 'none',
          cursor: movable ? 'move' : undefined, userSelect: 'none', borderRadius: 6,
        }}>
        <MathText text={displayText(it)} />
      </div>
    )
  })
}

// ── Typing a text or maths box ──────────────────────────────────────────────
function TextEditor({ draft, setDraft, onDone, t, ink }) {
  const ref = useRef(null)
  const boxRef = useRef(null)
  const [shift, setShift] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
    const box = boxRef.current
    const parent = box?.offsetParent
    if (box && parent) setShift(Math.max(0, box.offsetLeft + box.offsetWidth - (parent.clientWidth - 8)))
  }, [draft.text]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  const lines = draft.text.split('\n')
  const widthCh = Math.min(60, Math.max(draft.math ? 26 : 20, ...lines.map(l => l.length + 2)))
  const showPreview = draft.math ? draft.text.trim() : /\$|\\[a-zA-Z]/.test(draft.text)
  const insert = (snippet) => {
    const el = ref.current
    const { text, caret } = insertSnippet(draft.text, el.selectionStart, el.selectionEnd, snippet)
    setDraft({ ...draft, text })
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret) })
  }
  const keep = (e) => e.preventDefault() // buttons don't take focus from the box
  return (
    <div ref={boxRef} data-rw-editor style={{ position: 'absolute', left: `calc(50% + ${draft.x}px)`, top: draft.y, transform: shift ? `translateX(-${shift}px)` : undefined, zIndex: 3, display: 'flex', flexDirection: 'column', gap: 6, width: 'max-content', maxWidth: 'min(560px, calc(100vw - 32px))' }}>
      <textarea ref={ref} value={draft.text} rows={1} spellCheck={!draft.math}
        aria-label={draft.math ? 'Type maths in KaTeX' : 'Type your working'}
        placeholder={draft.math ? 'Maths, e.g. \\frac{4.0}{16} = 0.25' : 'Type your working'}
        onChange={e => setDraft({ ...draft, text: e.target.value })}
        onBlur={onDone}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onDone() } }}
        style={{
          width: `calc(${widthCh}ch + 24px)`, maxWidth: '100%', resize: 'none', outline: 'none', boxSizing: 'border-box',
          padding: '6px 9px', borderRadius: 8, border: `1.5px dashed ${t.accent}`, background: t.bgCard,
          color: ink, fontFamily: draft.math ? FONT_M : FONT_B, fontSize: draft.math ? 14 : 16, lineHeight: 1.55,
        }} />
      {draft.math && (
        <div role="group" aria-label="Maths symbols" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {MATH_SNIPPETS.map(s => (
            <button key={s.label} type="button" title={s.title} onMouseDown={keep} onPointerDown={keep} onClick={() => insert(s.snippet)}
              style={{ minWidth: 30, height: 28, padding: '0 7px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      {showPreview && (
        <div aria-live="polite" style={{ padding: '6px 10px', borderRadius: 8, background: t.bgSubtle || t.bgCard, border: `1px solid ${t.border}`, color: ink, fontSize: 16, whiteSpace: 'pre-wrap' }}>
          <MathText text={displayText({ ...draft })} />
        </div>
      )}
    </div>
  )
}

// ── The board ───────────────────────────────────────────────────────────────
export default function RoughWork({
  mode = 'overlay', open, onClose, theme = 'dark',
  initial = EMPTY_BOARD, onChange,
  gridDefault = false,
  questionText = '', topic = '',
  titan = null,           // { subject, topic, questionSection, answered, firstName }: Titan can check the working
  onCheckAnswer = null,   // sheet: check the chosen answer from inside the sheet
  canCheckAnswer = false,
  captureHost = null,     // overlay: the question area, saved and sent with the ink
  sheetHeight = 520,
}) {
  const t = THEMES[theme]
  const [board, dispatch] = useReducer(boardReducer, initial)
  const items = board.items
  const [tool, setTool] = useState('pen')
  const [ink, setInk] = useState('ink')
  const [grid, setGrid] = useState(gridDefault)
  const [live, setLive] = useState(null)
  const [erasing, setErasing] = useState(() => new Set())
  const [drag, setDrag] = useState(null)
  const [draft, setDraftState] = useState(null)
  const [reply, setReply] = useState(null)        // Titan: { status: 'loading' | 'done' | 'error', text }
  const [busy, setBusy] = useState(null)          // 'save' | 'check'
  const [exporting, setExporting] = useState(false)
  const [hostH, setHostH] = useState(0)

  const surfaceRef = useRef(null)
  const exportRef = useRef(null)
  const liveRef = useRef(null)
  const erasingRef = useRef(null)
  const dragRef = useRef(null)
  const draftRef = useRef(null)
  const pointerRef = useRef(null)
  const penSeen = useRef(false)
  const frame = useRef(0)

  const colorOf = useMemo(() => (name) => inkColor(name, t, theme), [t, theme])
  const setDraft = (d) => { draftRef.current = d; setDraftState(d) }

  useEffect(() => { onChange?.(board) }, [board]) // eslint-disable-line react-hooks/exhaustive-deps

  // Overlay: as tall as everything in the question area (or the ink, if lower).
  useLayoutEffect(() => {
    if (mode !== 'overlay') return
    const host = surfaceRef.current?.parentElement
    if (!host) return
    const measure = () => {
      let bottom = host.clientHeight
      for (const c of host.children) if (c !== surfaceRef.current) bottom = Math.max(bottom, c.offsetTop + c.offsetHeight + 48)
      setHostH(bottom)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    for (const c of host.children) if (c !== surfaceRef.current) ro.observe(c)
    return () => ro.disconnect()
  }, [mode])
  const boardH = mode === 'overlay' ? Math.max(hostH, inkBottom(items) + (open ? 120 : 24)) : undefined

  const finishDraft = () => {
    const d = draftRef.current
    if (!d) return
    setDraft(null)
    const text = d.text.replace(/\s+$/, '')
    if (d.id) {
      if (!text.trim()) dispatch({ type: 'remove', ids: [d.id] })
      else dispatch({ type: 'update', id: d.id, patch: { text, math: d.math } })
    } else if (text.trim()) {
      dispatch({ type: 'add', item: { id: newId(), type: 'text', color: d.color, x: d.x, y: d.y, text, math: d.math } })
    }
  }
  const chooseTool = (id) => { finishDraft(); setTool(id) }

  // Closing ends any typing.
  useEffect(() => { if (!open) finishDraft() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keys while the board is open (not while typing in a box).
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && (k === 'z' || k === 'y')) {
        e.preventDefault()
        dispatch({ type: k === 'y' || e.shiftKey ? 'redo' : 'undo' })
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const found = TOOL_LIST.find(tl => tl.key.toLowerCase() === k)
      if (found) { e.preventDefault(); chooseTool(found.id) }
      else if (e.key === 'Escape') { e.preventDefault(); onClose?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pointer position in board units: CSS pixels from the top-centre.
  const toLocal = (e) => {
    const el = surfaceRef.current
    const r = el.getBoundingClientRect()
    const scale = (r.width / el.offsetWidth) || 1
    return { x: (e.clientX - r.left) / scale - el.offsetWidth / 2, y: (e.clientY - r.top) / scale }
  }

  const eraseAt = (e, pt) => {
    const set = erasingRef.current
    for (const it of items) if (it.type === 'stroke' && !set.has(it.id) && strokeHit(it, pt.x, pt.y, ERASER_R)) set.add(it.id)
    for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
      const id = el.closest?.('[data-rw-text]')?.getAttribute('data-rw-text')
      if (id) set.add(id)
    }
    setErasing(new Set(set))
  }

  const onPointerDown = (e) => {
    if (!open || e.button > 0) return
    if (e.target.closest?.('[data-rw-ui]') || e.target.closest?.('[data-rw-editor]')) return
    // Palm rejection: once a pen has touched the board, fingers don't draw.
    if (e.pointerType === 'pen') penSeen.current = true
    else if (e.pointerType === 'touch' && penSeen.current) return
    const pt = toLocal(e)
    if (tool === 'text' || tool === 'math') {
      e.preventDefault()
      if (draftRef.current) { finishDraft(); return }
      const id = e.target.closest?.('[data-rw-text]')?.getAttribute('data-rw-text')
      const item = id && items.find(it => it.id === id)
      if (item) {
        surfaceRef.current.setPointerCapture?.(e.pointerId)
        dragRef.current = { id, sx: pt.x, sy: pt.y, ox: item.x, oy: item.y, moved: false }
        return
      }
      setDraft({ id: null, x: pt.x, y: Math.max(0, pt.y - 14), text: '', math: tool === 'math', color: ink })
      return
    }
    e.preventDefault()
    surfaceRef.current.setPointerCapture?.(e.pointerId)
    pointerRef.current = e.pointerId
    if (tool === 'pen') {
      liveRef.current = { id: newId(), type: 'stroke', color: ink, size: PEN_SIZE, pressured: e.pointerType === 'pen', points: [{ x: pt.x, y: pt.y, p: e.pressure }] }
      setLive(liveRef.current)
    } else if (tool === 'eraser') {
      erasingRef.current = new Set()
      eraseAt(e, pt)
    }
  }

  const onPointerMove = (e) => {
    const d = dragRef.current
    if (d) {
      const pt = toLocal(e)
      const dx = pt.x - d.sx, dy = pt.y - d.sy
      if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true
      if (d.moved) { d.x = d.ox + dx; d.y = Math.max(0, d.oy + dy); setDrag({ id: d.id, x: d.x, y: d.y }) }
      return
    }
    if (e.pointerId !== pointerRef.current) return
    if (liveRef.current) {
      const evs = e.getCoalescedEvents?.() || [e]
      const pts = liveRef.current.points
      for (const ev of (evs.length ? evs : [e])) {
        const pt = toLocal(ev)
        pts.push({ x: pt.x, y: pt.y, p: ev.pressure })
      }
      if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; if (liveRef.current) setLive({ ...liveRef.current, points: [...liveRef.current.points] }) })
    } else if (erasingRef.current) {
      eraseAt(e, toLocal(e))
    }
  }

  const onPointerUp = () => {
    const d = dragRef.current
    if (d) {
      dragRef.current = null
      setDrag(null)
      const item = items.find(it => it.id === d.id)
      if (!item) return
      if (d.moved) dispatch({ type: 'update', id: d.id, patch: { x: d.x, y: d.y } })
      else if (!d.moved) setDraft({ id: item.id, x: item.x, y: item.y, text: item.text, math: !!item.math, color: item.color })
      return
    }
    pointerRef.current = null
    if (liveRef.current) {
      const s = liveRef.current
      liveRef.current = null
      setLive(null)
      dispatch({ type: 'add', item: s })
    }
    if (erasingRef.current) {
      const ids = [...erasingRef.current]
      erasingRef.current = null
      setErasing(new Set())
      if (ids.length) dispatch({ type: 'remove', ids })
    }
  }

  // ── A picture of the board (with the question) ─────────────────────────────
  const capture = async (kind) => {
    finishDraft()
    if (mode === 'sheet') {
      setExporting(true) // renders the question + paper to picture
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    }
    try {
      const { toPng, toJpeg, getFontEmbedCSS } = await import('html-to-image')
      await document.fonts?.ready
      const overlay = mode === 'overlay' && captureHost
      const node = overlay ? captureHost : exportRef.current
      if (!node) throw new Error('Nothing to capture')
      const w = node.offsetWidth
      const h = overlay ? Math.max(node.scrollHeight, boardH || 0) : node.offsetHeight
      const fontEmbedCSS = await getFontEmbedCSS(node).catch(() => undefined)
      const opts = {
        width: w, height: h, backgroundColor: t.bg, fontEmbedCSS, imagePlaceholder: BLANK_PIXEL,
        style: overlay
          ? { overflow: 'visible', height: `${h}px`, maxHeight: 'none', flex: 'none', boxSizing: 'border-box' }
          : { position: 'static', left: '0', top: '0' },
        filter: (n) => !(n?.getAttribute && (n.getAttribute('data-rw-ui') != null || n.getAttribute('data-rw-skip') != null)),
      }
      if (kind === 'jpeg') {
        // Plenty for Titan to read, well under the upload limit.
        return await toJpeg(node, { ...opts, quality: 0.85, pixelRatio: Math.min(1.5, 1400 / Math.max(1, w)) })
      }
      return await toPng(node, { ...opts, pixelRatio: Math.min(2, 2600 / Math.max(1, w)) })
    } finally {
      setExporting(false)
    }
  }

  const saveBoard = async () => {
    if (busy) return
    setBusy('save')
    try {
      const dataUrl = await capture('png')
      const blob = await (await fetch(dataUrl)).blob()
      const name = roughWorkFileName(topic)
      const file = typeof File !== 'undefined' ? new File([blob], name, { type: 'image/png' }) : null
      const coarse = window.matchMedia?.('(pointer: coarse)').matches
      if (coarse && file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My rough work' }).catch(() => {})
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 4000)
        toast.success('Board saved to your downloads')
      }
    } catch {
      toast.error("Couldn't save your board. Try again.")
    }
    setBusy(null)
  }

  const checkWorking = async () => {
    if (!titan || busy || !items.length) return
    setBusy('check')
    setReply({ status: 'loading', text: '' })
    try {
      let image = null
      try {
        const dataUrl = await capture('jpeg')
        const base64 = dataUrl.split(',')[1] || ''
        if (base64) image = { mediaType: 'image/jpeg', base64 }
      } catch { /* typed lines alone */ }
      const lines = typedLines(items)
      if (!image && !lines.length) throw new Error('nothing to send')
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          purpose: 'titan_chat',
          subject: titan.subject || '',
          topic: titan.topic || '',
          system: checkWorkingSystem(titan),
          messages: [{ role: 'user', content: checkWorkingMessage(image, lines) }],
        }),
      })
      const data = await res.json().catch(() => ({}))
      const text = data?.code === 'parent_consent_required' || !res.ok
        ? (data?.error || "Titan couldn't check that just now. Try again in a moment.")
        : ((Array.isArray(data?.content) && data.content.find(b => b?.type === 'text')?.text) || '')
      setReply({ status: res.ok && data?.code !== 'parent_consent_required' ? 'done' : 'error', text: text || "Titan couldn't read that. Try again?" })
    } catch {
      setReply({ status: 'error', text: "Couldn't reach Titan. Check your connection and try again." })
    }
    setBusy(null)
  }

  const clearBoard = () => { finishDraft(); dispatch({ type: 'clear' }); setReply(null) }

  // ── Pieces ─────────────────────────────────────────────────────────────────
  const iconBtn = (on) => ({
    width: 36, height: 36, flexShrink: 0, borderRadius: 999, border: 'none', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: on ? t.text : 'transparent', color: on ? t.bg : t.textSub || t.textMuted,
  })
  const textBtn = {
    height: 36, padding: '0 12px', borderRadius: 999, border: 'none', background: 'transparent', cursor: 'pointer',
    color: t.textSub || t.textMuted, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  }
  const sep = <span aria-hidden="true" style={{ width: 1, height: 20, background: t.border, margin: '0 2px', flexShrink: 0 }} />

  const toolButtons = TOOL_LIST.map(tl => {
    const Icon = tl.icon
    return (
      <button key={tl.id} type="button" onClick={() => chooseTool(tl.id)} aria-pressed={tool === tl.id}
        aria-label={tl.label} title={`${tl.label} (${tl.key})`} style={iconBtn(tool === tl.id)}>
        <Icon size={16} aria-hidden="true" />
      </button>
    )
  })
  const swatches = (
    <span role="group" aria-label="Ink colour" style={{ display: 'inline-flex', gap: 6, padding: '0 6px' }}>
      {INKS.map(name => (
        <button key={name} type="button" onClick={() => setInk(name)} aria-pressed={ink === name}
          aria-label={{ ink: 'Plain ink', gold: 'Gold ink', blue: 'Blue ink' }[name]}
          style={{ width: 18, height: 18, padding: 0, borderRadius: 999, cursor: 'pointer', border: 'none', background: colorOf(name),
            boxShadow: ink === name ? `0 0 0 2px ${t.bgCard}, 0 0 0 3.5px ${colorOf(name)}` : 'none' }} />
      ))}
    </span>
  )
  const undoRedo = (
    <>
      <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={!board.past.length} aria-label="Undo" title="Undo (Ctrl+Z)" style={{ ...iconBtn(false), opacity: board.past.length ? 1 : 0.4 }}><Undo2 size={16} aria-hidden="true" /></button>
      <button type="button" onClick={() => dispatch({ type: 'redo' })} disabled={!board.future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" style={{ ...iconBtn(false), opacity: board.future.length ? 1 : 0.4 }}><Redo2 size={16} aria-hidden="true" /></button>
    </>
  )
  const gridBtn = (
    <button type="button" onClick={() => setGrid(g => !g)} aria-pressed={grid} aria-label="Grid paper" title="Grid paper"
      style={{ ...iconBtn(false), color: grid ? t.goldText : (t.textSub || t.textMuted) }}><Grid3x3 size={16} aria-hidden="true" /></button>
  )
  const empty = items.length === 0
  const saveBtn = (label) => (
    <button type="button" onClick={saveBoard} disabled={empty || !!busy} title="Save my board as a picture" style={{ ...textBtn, opacity: empty ? 0.45 : 1 }}>
      <Download size={15} aria-hidden="true" />{busy === 'save' ? 'Saving…' : label}
    </button>
  )
  const clearBtn = <button type="button" onClick={clearBoard} disabled={empty} style={{ ...textBtn, opacity: empty ? 0.45 : 1 }}>Clear</button>
  const titanBtn = (extra = {}) => titan && (
    <button type="button" onClick={checkWorking} disabled={empty || !!busy}
      style={{ ...textBtn, border: `1px solid ${t.borderMid || t.border}`, color: t.text, opacity: empty ? 0.45 : 1, ...extra }}>
      <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 999, background: t.accentGlow, color: t.goldText, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>T</span>
      {busy === 'check' ? 'Checking…' : 'Check my working'}
    </button>
  )

  const replyCard = reply && (
    <div data-rw-ui role="status" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 12px 12px 14px', borderRadius: 14, background: t.bgCard, border: `1px solid ${reply.status === 'error' ? t.border : t.borderAccent}`, boxShadow: t.shadowModal, color: t.text, fontSize: 14, lineHeight: 1.55, width: '100%', maxWidth: 560, boxSizing: 'border-box' }}>
      <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 999, background: t.accentGlow, color: t.goldText, fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>T</span>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
        {reply.status === 'loading' ? <span style={{ color: t.textMuted }}>Titan is reading your working…</span> : <MathText text={reply.text} />}
      </div>
      <button type="button" onClick={() => setReply(null)} aria-label="Close Titan's note" style={{ ...iconBtn(false), width: 28, height: 28 }}><X size={14} aria-hidden="true" /></button>
    </div>
  )

  const gridBg = (on) => on ? {
    backgroundImage: `radial-gradient(${t.borderMid || t.border} 1px, transparent 1.3px)`,
    backgroundSize: '22px 22px', backgroundPosition: '50% 0',
  } : {}
  const cursor = tool === 'pen' ? 'crosshair' : tool === 'eraser' ? ERASER_CURSOR : 'text'

  const surfaceContent = (
    <>
      <InkLayer items={items} hidden={erasing} colorOf={colorOf} />
      {live && (
        <svg aria-hidden="true" width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
          <svg x="50%" overflow="visible"><path d={strokePath(live)} fill={colorOf(live.color)} /></svg>
        </svg>
      )}
      <TextItems items={items} hidden={erasing} colorOf={colorOf} editingId={draft?.id} drag={drag}
        interactive={open} movable={open && (tool === 'text' || tool === 'math')} />
      {draft && <TextEditor draft={draft} setDraft={setDraft} onDone={finishDraft} t={t} ink={colorOf(draft.color)} />}
    </>
  )
  // A click on the paper mustn't take focus away from the box it just opened.
  const onMouseDown = (e) => {
    if (open && !e.target.closest?.('[data-rw-ui]') && !e.target.closest?.('[data-rw-editor]')) e.preventDefault()
  }
  const pointerHandlers = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onMouseDown }

  // ── Desktop: the page becomes paper ────────────────────────────────────────
  if (mode === 'overlay') {
    return (
      <div ref={surfaceRef} {...pointerHandlers}
        aria-label={open ? 'Rough work board' : undefined}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: boardH, zIndex: 6,
          display: 'flex', flexDirection: 'column',
          pointerEvents: open ? 'auto' : 'none', touchAction: open ? 'none' : 'auto', cursor: open ? cursor : undefined,
        }}>
        {open && grid && <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...gridBg(true) }} />}
        {open && <div aria-hidden="true" data-rw-skip style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: `inset 0 0 0 2px ${t.borderAccent}` }} />}
        {surfaceContent}
        {open && (
          <div data-rw-ui style={{ position: 'sticky', bottom: 18, marginTop: 'auto', alignSelf: 'center', zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '0 16px', maxWidth: '100%', boxSizing: 'border-box', cursor: 'default' }}>
            {replyCard}
            <div role="toolbar" aria-label="Rough work tools"
              style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: 2, padding: 6, borderRadius: 26, background: t.bgCard, border: `1px solid ${t.borderMid || t.border}`, boxShadow: t.shadowModal }}>
              {toolButtons}
              {swatches}
              {sep}
              {undoRedo}
              {gridBtn}
              {sep}
              {saveBtn('Save my board')}
              {clearBtn}
              {titanBtn()}
              <button type="button" onClick={onClose}
                style={{ ...textBtn, marginLeft: 4, background: t.bg, border: `1px solid ${t.borderMid || t.border}`, color: t.text }}>
                Done: back to answering
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Phone: a sheet with its own paper ──────────────────────────────────────
  if (!open) return null
  return (
    <div role="dialog" aria-label="Rough work"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1500, height: sheetHeight, maxHeight: '78dvh',
        display: 'flex', flexDirection: 'column', background: t.bgCard, color: t.text, fontFamily: FONT_B,
        borderTop: `1px solid ${t.borderMid || t.border}`, borderRadius: '22px 22px 0 0', boxShadow: t.shadowModal,
        paddingBottom: 'env(safe-area-inset-bottom)', animation: 'rwSheetUp 0.28s cubic-bezier(.3,.7,.2,1)',
      }}>
      <style>{'@keyframes rwSheetUp { from { transform: translateY(100%) } to { transform: none } } @media (prefers-reduced-motion: reduce) { [aria-label="Rough work"] { animation: none !important } }'}</style>
      <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}><span style={{ width: 40, height: 5, borderRadius: 99, background: t.borderMid || t.border }} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 10px 0 16px' }}>
        <span style={{ fontSize: 14, fontWeight: 800, marginRight: 'auto' }}>Rough work</span>
        {gridBtn}
        {saveBtn('Save')}
        {clearBtn}
        <button type="button" onClick={onClose} style={{ ...textBtn, background: t.text, color: t.bg, marginLeft: 4 }}>Done</button>
      </div>
      <div role="toolbar" aria-label="Rough work tools" style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 10px 6px', overflowX: 'auto' }}>
        {toolButtons}
        {swatches}
        {sep}
        {undoRedo}
      </div>
      <div ref={surfaceRef} {...pointerHandlers} aria-label="Rough work paper"
        style={{ position: 'relative', flex: 1, minHeight: 0, margin: '0 10px', borderRadius: 14, overflow: 'hidden', touchAction: 'none', cursor, background: t.bg, ...gridBg(grid) }}>
        {surfaceContent}
        {reply && <div style={{ position: 'absolute', left: 8, right: 8, top: 8, zIndex: 4, display: 'flex', justifyContent: 'center' }}>{replyCard}</div>}
      </div>
      {(titan || onCheckAnswer) && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px 12px' }}>
          {onCheckAnswer && (
            <button type="button" onClick={onCheckAnswer} disabled={!canCheckAnswer}
              style={{ flex: 1, height: 44, borderRadius: 12, border: 'none', background: t.accent, color: '#0c1037', fontFamily: FONT_B, fontSize: 14, fontWeight: 800, cursor: canCheckAnswer ? 'pointer' : 'default', opacity: canCheckAnswer ? 1 : 0.5 }}>
              Check answer
            </button>
          )}
          {titanBtn({ flex: 1, height: 44, borderRadius: 12, justifyContent: 'center' })}
        </div>
      )}
      {/* What "Save" and Titan see: the question, then the paper. */}
      {exporting && (
        <div ref={exportRef} style={{ position: 'fixed', left: -10000, top: 0, width: surfaceRef.current?.offsetWidth || 360, padding: 18, background: t.bg, color: t.text, fontFamily: FONT_B }}>
          {topic && <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>{topic}</div>}
          {questionText && <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.55, marginBottom: 14 }}><MathText text={questionText} /></div>}
          <div style={{ position: 'relative', height: Math.max(surfaceRef.current?.offsetHeight || 300, inkBottom(items) + 24), ...gridBg(grid) }}>
            <InkLayer items={items} colorOf={colorOf} />
            <TextItems items={items} colorOf={colorOf} interactive={false} />
          </div>
        </div>
      )}
    </div>
  )
}
