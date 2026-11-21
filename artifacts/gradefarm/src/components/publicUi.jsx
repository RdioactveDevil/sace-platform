import { Check } from 'lucide-react'

// The public pages' building blocks (diagnostic, booking, guest call): one
// centred card, heading, text, and buttons, in the app's theme variables.

export const FONT = "'Plus Jakarta Sans', sans-serif"
export const C = {
  text: 'var(--t-text)', sub: 'var(--t-textSub)', muted: 'var(--t-textMuted)', faint: 'var(--t-textFaint)',
  card: 'var(--t-bgCard)', subtle: 'var(--t-bgSubtle)', hover: 'var(--t-bgHover)', border: 'var(--t-border)', bg: 'var(--t-bg)',
  success: 'var(--t-success)', accent: 'var(--t-accent)',
}

// A centred card for the short screens (loading, done, errors).
export function Panel({ children }) {
  return (
    <div className="af-in" style={{ width: '100%', maxWidth: 460, margin: '0 auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 'clamp(20px, 5vw, 28px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {children}
    </div>
  )
}
export const H1 = ({ children }) => <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25, color: C.text, textWrap: 'balance' }}>{children}</h1>
export const P = ({ children, muted }) => <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: muted ? C.muted : C.sub }}>{children}</p>
export const OkLine = ({ children }) => <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: C.success }}><Check size={16} strokeWidth={2.5} aria-hidden="true" />{children}</div>
export const btnStyle = (kind, full = true) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 42, padding: '0 18px', borderRadius: 10,
  fontFamily: FONT, fontSize: 14, fontWeight: 800, cursor: 'pointer', width: full ? '100%' : undefined,
  ...(kind === 'primary' ? { border: 'none', background: C.accent, color: 'var(--t-onAccent)' } : { border: `1px solid ${C.border}`, background: C.card, color: C.text }),
})

