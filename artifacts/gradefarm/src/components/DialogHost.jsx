import { useEffect, useRef, useState } from 'react'
import { THEMES } from '../lib/theme'
import { subscribeDialogs, closeDialog } from '../lib/dialog'
import { authBtn } from './AuthLayout'

// Shows lib/dialog.js's confirm and alert dialogs over the page, in the
// app's own look. Mounted once in App.jsx. Escape or a click outside cancels
// a confirm; Tab stays inside the dialog; focus goes back where it was after.

const FONT_B = "'Plus Jakarta Sans', 'Segoe UI', sans-serif"

export default function DialogHost({ theme = 'light' }) {
  const t = THEMES[theme] || THEMES.light
  const [d, setD] = useState(null)
  const okRef = useRef(null)
  const cancelRef = useRef(null)

  useEffect(() => subscribeDialogs(setD), [])

  useEffect(() => {
    if (!d) return undefined
    const before = document.activeElement
    // A risky one starts on Cancel, so pressing Enter doesn't do it.
    ;(d.danger && cancelRef.current ? cancelRef.current : okRef.current)?.focus()
    const dismiss = () => closeDialog(d.kind === 'alert' ? undefined : false)
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dismiss() }
      if (e.key === 'Tab') {
        const stops = [cancelRef.current, okRef.current].filter(Boolean)
        const i = stops.indexOf(document.activeElement)
        e.preventDefault()
        stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length]?.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (before && typeof before.focus === 'function' && document.contains(before)) before.focus()
    }
  }, [d])

  if (!d) return null
  const paragraphs = String(d.message || '').split(/\n\s*\n/).filter(Boolean)
  const dangerBtn = { ...authBtn(t, 'primary'), background: t.danger, color: '#fff' }
  return (
    <div className="gf-dlg-bg" onMouseDown={e => { if (e.target === e.currentTarget && d.kind !== 'alert') closeDialog(false) }}
      style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(12,16,55,0.42)', backdropFilter: 'blur(2px)', animation: 'gfDlgFade 0.15s ease' }}>
      <style>{`
        @keyframes gfDlgFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes gfDlgIn { from { opacity: 0; transform: translateY(8px) scale(0.98) } to { opacity: 1; transform: none } }
        .gf-dlg button:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .gf-dlg, .gf-dlg-bg { animation: none !important; } }
      `}</style>
      <div className="gf-dlg" role="alertdialog" aria-modal="true"
        aria-labelledby={d.title ? 'gf-dlg-title' : undefined} aria-describedby="gf-dlg-msg" aria-label={d.title ? undefined : d.kind === 'alert' ? 'Message' : 'Confirm'}
        style={{ width: 'min(420px, 100%)', background: t.bgCard, color: t.text, border: `1px solid ${t.border}`, borderRadius: 16, padding: 22, boxShadow: '0 24px 60px -20px rgba(0,0,0,0.45)', fontFamily: FONT_B, animation: 'gfDlgIn 0.2s ease' }}>
        {d.title && <h2 id="gf-dlg-title" style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{d.title}</h2>}
        <div id="gf-dlg-msg" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14.5, lineHeight: 1.55, color: d.title ? t.textMuted : t.text }}>
          {paragraphs.map((p, i) => <p key={i} style={{ margin: 0, whiteSpace: 'pre-line' }}>{p}</p>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          {d.kind === 'confirm' && (
            <button ref={cancelRef} type="button" className="af-btn" onClick={() => closeDialog(false)} style={authBtn(t, 'secondary')}>{d.cancel || 'Cancel'}</button>
          )}
          <button ref={okRef} type="button" className="af-btn" onClick={() => closeDialog(d.kind === 'alert' ? undefined : true)} style={d.danger ? dangerBtn : authBtn(t, 'primary')}>
            {d.confirm || 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
