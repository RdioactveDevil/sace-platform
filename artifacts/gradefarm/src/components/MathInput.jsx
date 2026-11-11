import { useState, useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'mathlive'
import 'mathlive/fonts.css'

// The maths answer box (a MathLive field, typed like the KaTeX it renders)
// and its symbols keyboard. Used by the Diagnostic and by written answers in
// maths subjects. Loading this module loads MathLive, so screens that only
// sometimes need it should import it lazily.

const FONT = "'Plus Jakarta Sans', sans-serif"
// Colours come from the app's theme variables (set on <html> by App), so the
// input follows light and dark mode wherever it's used.
const C = {
  text: 'var(--t-text)', muted: 'var(--t-textMuted)',
  card: 'var(--t-bgCard)', subtle: 'var(--t-bgSubtle)', border: 'var(--t-border)',
}

// ── Math rendering ─────────────────────────────────────────────────────────────

function renderMath(text, displayMode = false) {
  try {
    return katex.renderToString(text, { throwOnError: false, displayMode })
  } catch {
    return text
  }
}

// ── Math symbols ───────────────────────────────────────────────────────────────

// insert: for contentEditable/textarea fallback
// ml: MathLive LaTeX, with #? placeholders (cursor jumps inside)
// preview: KaTeX rendered in button face
const MATH_SYMBOLS = [
  { group: 'Operators', symbols: [
    { label: '×',   ml: '\\times',           preview: null },
    { label: '÷',   ml: '\\div',             preview: null },
    { label: '±',   ml: '\\pm',              preview: null },
    { label: '√',   ml: '\\sqrt{#?}',        preview: '\\sqrt{x}' },
    { label: 'xⁿ',  ml: '#@^{#?}',           preview: 'x^n' },
    { label: '∞',   ml: '\\infty',           preview: '\\infty' },
    { label: 'a/b', ml: '\\frac{#?}{#?}',    preview: '\\frac{a}{b}' },
  ]},
  { group: 'Relations', symbols: [
    { label: '≤',   ml: '\\le' },
    { label: '≥',   ml: '\\ge' },
    { label: '≠',   ml: '\\ne' },
    { label: '≈',   ml: '\\approx' },
    { label: '∈',   ml: '\\in' },
    { label: '→',   ml: '\\to' },
  ]},
  { group: 'Trig', symbols: [
    { label: 'sin',    ml: '\\sin\\left(#?\\right)',         preview: null },
    { label: 'cos',    ml: '\\cos\\left(#?\\right)',         preview: null },
    { label: 'tan',    ml: '\\tan\\left(#?\\right)',         preview: null },
    { label: 'sin⁻¹', ml: '\\sin^{-1}\\left(#?\\right)',    preview: '\\sin^{-1}(x)' },
    { label: 'cos⁻¹', ml: '\\cos^{-1}\\left(#?\\right)',    preview: '\\cos^{-1}(x)' },
    { label: 'tan⁻¹', ml: '\\tan^{-1}\\left(#?\\right)',    preview: '\\tan^{-1}(x)' },
  ]},
  { group: 'Calculus', symbols: [
    { label: 'd/dx',   ml: '\\frac{d}{dx}',            preview: '\\frac{d}{dx}' },
    { label: 'd²/dx²', ml: '\\frac{d^2}{dx^2}',        preview: '\\frac{d^2}{dx^2}' },
    { label: '∫',      ml: '\\int' },
    { label: '∫ dx',   ml: '\\int_{#?}^{#?}#?\\,dx',   preview: '\\int_a^b \\, dx' },
    { label: 'lim',    ml: '\\lim_{x\\to#?}',          preview: '\\lim_{x \\to a}' },
    { label: 'Σ',      ml: '\\sum_{#?}^{#?}' },
    { label: '∂',      ml: '\\partial' },
    { label: 'Δ',      ml: '\\Delta' },
  ]},
  { group: 'Log / Exp', symbols: [
    { label: 'ln',    ml: '\\ln\\left(#?\\right)' },
    { label: 'log',   ml: '\\log\\left(#?\\right)' },
    { label: 'log_n', ml: '\\log_{#?}\\left(#?\\right)',  preview: '\\log_n(x)' },
    { label: 'eˣ',    ml: 'e^{#?}',                      preview: 'e^x' },
  ]},
  { group: 'Greek', symbols: [
    { label: 'π', ml: '\\pi' },
    { label: 'θ', ml: '\\theta' },
    { label: 'α', ml: '\\alpha' },
    { label: 'β', ml: '\\beta' },
    { label: 'λ', ml: '\\lambda' },
    { label: 'μ', ml: '\\mu' },
    { label: 'σ', ml: '\\sigma' },
    { label: 'φ', ml: '\\phi' },
  ]},
]

export function MathKeyboard({ onInsert }) {
  const [activeGroup, setActiveGroup] = useState(0)
  const group = MATH_SYMBOLS[activeGroup]

  return (
    <div style={{ marginTop: 8, background: C.subtle, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <div role="tablist" aria-label="Symbol groups" style={{ display: 'flex', overflowX: 'auto', borderBottom: `1px solid ${C.border}`, scrollbarWidth: 'none' }}>
        {MATH_SYMBOLS.map((g, i) => (
          <button key={g.group} type="button" role="tab" aria-selected={activeGroup === i} onClick={() => setActiveGroup(i)} style={{
            padding: '7px 13px', border: 'none', background: 'transparent', fontFamily: FONT,
            fontSize: 12, fontWeight: activeGroup === i ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
            color: activeGroup === i ? C.text : C.muted,
            borderBottom: activeGroup === i ? `2px solid ${C.text}` : '2px solid transparent',
          }}>
            {g.group}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px' }}>
        {group.symbols.map((sym) => (
          <button
            key={sym.label}
            type="button"
            className="dg-key"
            onClick={() => onInsert(sym)}
            style={{
              padding: '6px 11px', borderRadius: 7, border: `1px solid ${C.border}`,
              background: C.card, color: C.text, fontFamily: FONT,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 36, minHeight: 32,
            }}
          >
            {sym.preview
              ? <span dangerouslySetInnerHTML={{ __html: renderMath(sym.preview) }} style={{ pointerEvents: 'none' }} />
              : sym.label
            }
          </button>
        ))}
      </div>
    </div>
  )
}

// ── MathLive input (math subjects) ─────────────────────────────────────────────

// Same test MathLive uses to decide whether to auto-show its virtual keyboard
export function isTouchDevice() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia) return window.matchMedia('(pointer: coarse)').matches
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

// onKeys (optional) gets the field's Enter, Backspace-when-empty and arrows
// out of it ('up' / 'down'), for an answer made of several lines; it returns
// true when it handled the key. autoFocus focuses the field once it's ready;
// fieldRef gets the field itself (to focus it from outside).
export function MathLiveInput({ questionId, value, onAnswer, insertFnRef, disabled, minHeight, onKeys, autoFocus, ariaLabel, compact, fieldRef }) {
  const stableKeys = useRef(onKeys)
  stableKeys.current = onKeys
  const containerRef = useRef(null)
  const stableAnswer = useRef(onAnswer)
  stableAnswer.current = onAnswer

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false

    // Create imperatively so we control when MathLive methods are called
    const mf = document.createElement('math-field')
    Object.assign(mf.style, {
      display: 'block',
      width: '100%',
      minHeight: `${minHeight || 60}px`,
      borderRadius: '10px',
      border: `1px solid ${C.border}`,
      background: C.card,
      color: C.text,
      fontSize: compact ? '16px' : '17px',
      padding: compact ? '8px 12px' : '14px 16px',
      boxSizing: 'border-box',
      transition: 'border-color 0.15s',
      cursor: disabled ? 'default' : 'text',
    })
    container.appendChild(mf)

    const configure = () => {
      if (cancelled) return
      // MathLive's input sink is hard-coded to inputmode=none, so touch devices
      // (iPad, phones) never get the OS keyboard. 'auto' shows MathLive's own
      // virtual keyboard on focus there; desktops are unaffected.
      mf.mathVirtualKeyboardPolicy = 'auto'
      mf.smartMode = true
      mf.readOnly = !!disabled
      if (value) mf.setValue(value, { suppressChangeNotifications: true })

      const onInput = () => stableAnswer.current(questionId, mf.value)
      const onFocus = () => {
        mf.style.borderColor = 'var(--t-text)'
        mf.style.boxShadow = '0 0 0 1px var(--t-text)'
        // Keep the field visible above the virtual keyboard once it slides up
        if (isTouchDevice()) setTimeout(() => mf.scrollIntoView({ block: 'center', behavior: 'smooth' }), 400)
      }
      const onBlur  = () => { mf.style.borderColor = C.border; mf.style.boxShadow = 'none' }
      mf.addEventListener('input', onInput)
      mf.addEventListener('focus', onFocus)
      mf.addEventListener('blur', onBlur)
      if (ariaLabel) mf.setAttribute('aria-label', ariaLabel)

      // Capture phase: the host sees the key before MathLive's own handler
      // inside its shadow root, so Enter can start a new line instead.
      const onKeyDown = (e) => {
        const handle = stableKeys.current
        if (!handle) return
        let key = null
        if (e.key === 'Enter') key = 'enter'
        else if (e.key === 'Backspace' && !mf.value) key = 'backspace-empty'
        if (key && handle(key, e)) { e.preventDefault(); e.stopImmediatePropagation() }
      }
      const onMoveOut = (e) => {
        const dir = e.detail?.direction
        const key = dir === 'upward' ? 'up' : dir === 'downward' ? 'down' : null
        if (key && stableKeys.current?.(key, e)) e.preventDefault()
      }
      mf.addEventListener('keydown', onKeyDown, { capture: true })
      mf.addEventListener('move-out', onMoveOut)
      if (fieldRef) fieldRef.current = mf
      if (autoFocus && !disabled) mf.focus()

      if (insertFnRef) {
        insertFnRef.current = (sym) => {
          if (disabled) return
          mf.focus()
          mf.insert(sym.ml, { selectionMode: 'placeholder' })
          stableAnswer.current(questionId, mf.value)
        }
      }
    }

    // Ensure the custom element is upgraded before calling MathLive APIs
    if (customElements.get('math-field')) {
      configure()
    } else {
      customElements.whenDefined('math-field').then(configure)
    }

    return () => {
      cancelled = true
      if (container.contains(mf)) container.removeChild(mf)
      if (insertFnRef) insertFnRef.current = null
      if (fieldRef?.current === mf) fieldRef.current = null
    }
  }, [questionId, disabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ width: '100%' }} />
}

