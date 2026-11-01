import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { THEMES } from '../lib/theme'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const CARD_W = 300

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

/** The part of an element's box that is on screen. */
function visibleRect(r) {
  const top = clamp(r.top, 0, window.innerHeight)
  const bottom = clamp(r.bottom, 0, window.innerHeight)
  const left = clamp(r.left, 0, window.innerWidth)
  const right = clamp(r.right, 0, window.innerWidth)
  return { top, bottom, left, right, width: right - left, height: bottom - top }
}

/**
 * Where the card goes: beside the highlighted element if there's room, else
 * below or above it. On phones it spans the screen in whichever half the
 * element isn't in.
 */
function cardPosition(rect, cardH, isMobile) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const m = 12
  if (!rect) return { left: '50%', bottom: m, transform: 'translateX(-50%)', width: Math.min(CARD_W, vw - m * 2) }
  if (isMobile) {
    const inTop = rect.height > vh * 0.45 || (rect.top + rect.bottom) / 2 < vh / 2
    return { left: m, right: m, ...(inTop ? { bottom: `calc(${m}px + env(safe-area-inset-bottom, 0px))` } : { top: m }) }
  }
  const gap = 14
  const w = Math.min(CARD_W, vw - m * 2)
  const cx = rect.left + rect.width / 2
  const midTop = clamp(rect.top + rect.height / 2 - cardH / 2, m, vh - cardH - m)
  if (vw - rect.right - gap - m >= w) return { left: rect.right + gap, top: midTop, width: w }
  if (rect.left - gap - m >= w) return { left: rect.left - gap - w, top: midTop, width: w }
  if (vh - rect.bottom - gap - m >= cardH) return { left: clamp(cx - w / 2, m, vw - w - m), top: rect.bottom + gap, width: w }
  if (rect.top - gap - m >= cardH) return { left: clamp(cx - w / 2, m, vw - w - m), top: rect.top - gap - cardH, width: w }
  return { left: clamp(cx - w / 2, m, vw - w - m), top: clamp(vh - cardH - m, m, vh - m), width: w }
}

/**
 * A page's tips, one at a time: the element dimmed around and outlined, and a
 * small card beside it with Skip, Back and Next. `steps` are { target, title,
 * body }; `onClose` runs on Skip, Escape or the last step.
 */
export default function PageTips({ steps, theme = 'dark', onClose }) {
  const t = THEMES[theme] || THEMES.dark
  const [ix, setIx] = useState(0)
  const [rect, setRect] = useState(null)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 860)
  const cardRef = useRef(null)
  const [cardH, setCardH] = useState(180)
  const scrolledFor = useRef(null)
  const step = steps[Math.min(ix, steps.length - 1)]
  const last = ix >= steps.length - 1

  const measure = useCallback(() => {
    const el = document.querySelector(`[data-tutorial-target="${step.target}"]`)
    if (!el || !el.getClientRects().length) { setRect(null); return }
    if (scrolledFor.current !== step) {
      scrolledFor.current = step
      const tall = el.getBoundingClientRect().height > window.innerHeight * 0.45
      el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'instant' })
    }
    setRect(visibleRect(el.getBoundingClientRect()))
  }, [step])

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(measure))
    const onResize = () => { setIsMobile(window.innerWidth < 860); measure() }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', measure, true)
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', measure, true) }
  }, [measure])

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  }, [ix, rect, isMobile])

  // Focus the card's main button for keyboard users; Escape closes.
  const nextRef = useRef(null)
  useEffect(() => { nextRef.current?.focus({ preventScroll: true }) }, [ix])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pad = 8
  const hole = rect && { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
  const pos = cardPosition(rect, cardH, isMobile)
  const btn = (primary) => ({
    padding: '7px 13px', borderRadius: 8, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
    ...(primary ? { border: 'none', background: t.accent, color: '#0c1037' } : { border: `1px solid ${t.border}`, background: t.bgCard, color: t.text }),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, fontFamily: FONT_B }}>
      <style>{`.pt-skip:focus-visible, .pt-btn:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 2px; }`}</style>
      {/* Dims everything but the highlighted element, which gets a plain outline. */}
      {hole ? (
        <div aria-hidden="true" style={{ position: 'fixed', ...hole, borderRadius: 10, pointerEvents: 'none',
          boxShadow: `0 0 0 2px ${theme === 'dark' ? '#ececef' : '#ffffff'}, 0 0 0 9999px ${theme === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(8,10,30,0.42)'}`,
          transition: 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease' }} />
      ) : (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: theme === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(8,10,30,0.42)' }} />
      )}
      <div ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="pt-title" aria-describedby="pt-body"
        style={{ position: 'fixed', ...pos, zIndex: 100000, boxSizing: 'border-box', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12,
          padding: '14px 16px', boxShadow: t.shadowModal, display: 'flex', flexDirection: 'column', gap: 7, transition: 'top 0.2s ease, left 0.2s ease' }}>
        {steps.length > 1 && <span style={{ fontSize: 12, fontWeight: 600, color: t.textFaint }}>Tip {ix + 1} of {steps.length}</span>}
        <h2 id="pt-title" style={{ margin: 0, fontSize: 15, fontWeight: 800, color: t.text }}>{step.title}</h2>
        <p id="pt-body" style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: t.textSub }}>{step.body}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {!last && (
            <button type="button" className="pt-skip" onClick={onClose}
              style={{ border: 'none', background: 'none', padding: 0, fontFamily: FONT_B, fontSize: 12.5, color: t.textMuted, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: t.border, textUnderlineOffset: 3 }}>
              Skip
            </button>
          )}
          <span style={{ flex: 1 }} />
          {ix > 0 && <button type="button" className="pt-btn" onClick={() => setIx(i => i - 1)} style={btn(false)}>Back</button>}
          <button ref={nextRef} type="button" className="pt-btn" onClick={() => (last ? onClose() : setIx(i => i + 1))} style={btn(true)}>
            {last ? (steps.length > 1 ? 'Done' : 'Got it') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
