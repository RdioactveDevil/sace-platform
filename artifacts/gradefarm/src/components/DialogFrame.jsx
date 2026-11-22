import { useEffect, useRef, useId } from 'react'
import { createPortal } from 'react-dom'
import { THEMES } from '../lib/theme'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

/**
 * The site's modal: a portal over a dimmed page, the dialog card, focus kept
 * inside, Escape asks to close, and focus goes back to what opened it. A
 * dialog opened on top of this one (the questionnaire editor) handles its own
 * keys, so this one stands still while it is open.
 */
export default function DialogFrame({ theme, title, icon, intro, maxWidth = 640, onRequestClose, firstFocusRef, children }) {
  const t = THEMES[theme]
  const dark = theme === 'dark'
  const titleId = useId()
  const dialogRef = useRef(null)
  const openerRef = useRef(typeof document !== 'undefined' ? document.activeElement : null)
  const closeRef = useRef(onRequestClose)
  closeRef.current = onRequestClose

  useEffect(() => {
    firstFocusRef?.current?.focus()
    const opener = openerRef.current
    const onKey = (e) => {
      const box = dialogRef.current
      if (!box) return
      // Only the top dialog answers keys.
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (dialogs[dialogs.length - 1] !== box) return
      if (e.key === 'Escape') { if (!e.defaultPrevented) closeRef.current?.(); return }
      if (e.key !== 'Tab') return
      const items = [...box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled)
      if (!items.length) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!box.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus() }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); setTimeout(() => opener?.focus?.(), 0) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 9999, padding: 16, overflowY: 'auto' }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ background: t.bgCard, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, borderRadius: 12, padding: 32, width: '100%', maxWidth, fontFamily: FONT_B, margin: 'auto', backdropFilter: 'blur(16px)' }}>
        <h2 id={titleId} style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon}{title}
        </h2>
        {intro && <p style={{ margin: '0 0 20px', fontSize: 13, color: t.textMuted }}>{intro}</p>}
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Cancel / primary buttons in the site's modal style. */
export function DialogButtons({ theme, onCancel, cancelLabel = 'Cancel', submitLabel, busy, disabled, hint, onSubmit, submitType = 'submit' }) {
  const t = THEMES[theme]
  const dark = theme === 'dark'
  const off = busy || disabled
  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
      {hint && <div style={{ flex: 1, minWidth: 160, fontSize: 12, color: t.textMuted }}>{hint}</div>}
      <button type="button" onClick={onCancel} style={{ padding: '10px 20px', borderRadius: 9, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, background: dark ? 'var(--t-bgSubtle)' : 'transparent', color: t.textMuted, fontFamily: FONT_B, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        {cancelLabel}
      </button>
      <button type={submitType} onClick={onSubmit} disabled={off} className={off ? '' : 'btn-gold-shimmer'} style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: off ? (dark ? 'var(--t-bgSubtle)' : t.border) : 'var(--t-accent)', color: off ? t.textMuted : 'var(--t-onAccent)', fontFamily: FONT_B, fontSize: 13, fontWeight: 800, cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.7 : 1 }}>
        {submitLabel}
      </button>
    </div>
  )
}
