import { useLayoutEffect, useRef, useState } from 'react'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const EASE = 'cubic-bezier(.3,.7,.2,1)'

/**
 * The app's one toggle look (from Titan's Ask / Lesson switch): a rounded pill
 * with a dark thumb that slides to the chosen option. Options can differ in
 * width; the thumb is measured from the chosen button.
 *
 *   options   [{ value, label, disabled?, title? }] or [[value, label], …]
 *   value     the chosen option's value
 *   onChange  (value) => void
 *   label     the group's accessible name
 *   size      'md' (default, 38px) | 'sm' (32px)
 *   fill      stretch to the container, options sharing the width equally
 *   optionMinWidth  a minimum width for each option (evens out short labels)
 *   kind      'radio' (role="radiogroup") or 'pressed' (aria-pressed buttons)
 */
export default function SegmentedToggle({
  options, value, onChange, label, size = 'md', fill = false, optionMinWidth, kind = 'pressed', disabled = false, style, className,
}) {
  const opts = options.map(o => (Array.isArray(o) ? { value: o[0], label: o[1] } : o))
  const wrapRef = useRef(null)
  const [thumb, setThumb] = useState(null)
  const [animate, setAnimate] = useState(false)
  const index = opts.findIndex(o => o.value === value)

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return undefined
    const measure = () => {
      const el = wrap.querySelectorAll('[data-seg-opt]')[index]
      setThumb(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null)
    }
    measure()
    // Slide only after the first placement, so the thumb doesn't fly in on load.
    const id = requestAnimationFrame(() => setAnimate(true))
    if (typeof ResizeObserver === 'undefined') return () => cancelAnimationFrame(id)
    const ro = new ResizeObserver(measure) // widths change once the font loads
    ro.observe(wrap)
    return () => { cancelAnimationFrame(id); ro.disconnect() }
  }, [index, opts.length])

  const h = size === 'sm' ? 32 : 38
  const pad = size === 'sm' ? 3 : 4

  return (
    <div ref={wrapRef} role={kind === 'radio' ? 'radiogroup' : 'group'} aria-label={label} className={`gf-seg${className ? ` ${className}` : ''}`}
      style={{
        position: 'relative', display: fill ? 'flex' : 'inline-flex', flexWrap: 'wrap', maxWidth: '100%', padding: pad, gap: 0,
        borderRadius: h, background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', boxSizing: 'border-box', fontFamily: FONT_B, flexShrink: 0,
        ...style,
      }}>
      <style>{`
        .gf-seg-thumb { transition: transform 0.3s ${EASE}, width 0.3s ${EASE}, height 0.3s ${EASE}; }
        .gf-seg-btn { transition: color 0.25s ease; }
        .gf-seg-btn:focus-visible { outline: 2px solid var(--t-accent); outline-offset: 2px; }
        .gf-seg-btn:not(:disabled):not([data-on="true"]):hover { color: var(--t-text) !important; }
        @media (prefers-reduced-motion: reduce) { .gf-seg-thumb, .gf-seg-btn { transition: none; } }
      `}</style>
      {thumb && (
        <span aria-hidden="true" className={animate ? 'gf-seg-thumb' : undefined}
          style={{ position: 'absolute', top: 0, left: 0, width: thumb.w, height: thumb.h, transform: `translate(${thumb.x}px, ${thumb.y}px)`, borderRadius: h, background: 'var(--t-text)', pointerEvents: 'none' }} />
      )}
      {opts.map(o => {
        const on = o.value === value
        const off = disabled || o.disabled
        return (
          <button key={String(o.value)} type="button" data-seg-opt="" data-on={on} disabled={off} title={o.title}
            {...(kind === 'radio' ? { role: 'radio', 'aria-checked': on } : { 'aria-pressed': on })}
            onClick={() => { if (!on) onChange(o.value) }}
            className="gf-seg-btn"
            style={{
              position: 'relative', zIndex: 1, flex: fill ? '1 1 0' : '0 0 auto', minWidth: optionMinWidth || 0, height: h, padding: size === 'sm' ? '0 12px' : '0 18px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap',
              border: 'none', borderRadius: h, background: thumb ? 'transparent' : on ? 'var(--t-text)' : 'transparent',
              color: on ? 'var(--t-bg)' : 'var(--t-textMuted)', fontFamily: FONT_B, fontSize: size === 'sm' ? 12.5 : 14, fontWeight: on ? 800 : 700,
              cursor: off ? 'not-allowed' : on ? 'default' : 'pointer', opacity: o.disabled ? 0.5 : 1,
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
