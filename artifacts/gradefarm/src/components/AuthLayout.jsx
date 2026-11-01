import { useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { THEMES } from '../lib/theme'

// Shared pieces for the pages around signing in: sign in / sign up, password
// reset, onboarding and the subject picker. They sit outside the app's
// sidebar, so this gives them the same top bar, colours (light and dark) and
// form controls as the rest of the app.

export const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"
const GOLD = '#f1be43'
const NAVY = '#0c1037'

/** The logo in the brand's colours, in the navy box the sidebar uses. */
export function Logo({ onClick }) {
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-label={onClick ? 'gradefarm home' : undefined} className="af-logo"
      style={{ display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 12px', borderRadius: 8, border: 'none', background: NAVY, cursor: onClick ? 'pointer' : 'default', fontFamily: FONT_D, fontSize: 15, letterSpacing: 1.2, lineHeight: 1 }}>
      <span style={{ color: '#ffffff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
    </Tag>
  )
}

/**
 * Page frame: logo on the left, `right` (links, progress) and the light/dark
 * switch on the right, then `children` centred (or from the top with
 * `align="top"`).
 */
export function AuthLayout({ theme = 'dark', onToggleTheme, onLogoClick, right, center, align = 'center', children }) {
  const t = THEMES[theme]
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: t.bg, color: t.text, fontFamily: FONT_B, colorScheme: theme === 'dark' ? 'dark' : 'light' }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes afIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        .af-in { animation: afIn 0.25s ease backwards; }
        @media (prefers-reduced-motion: reduce) { .af-in { animation: none !important; } }
        .af-inp { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 9px; border: 1px solid ${t.border}; background: ${t.bgCard}; color: ${t.text}; font-family: ${FONT_B}; font-size: 14.5px; outline: none; transition: border-color 0.12s, box-shadow 0.12s; }
        .af-inp::placeholder { color: ${t.textFaint}; }
        .af-inp:hover { border-color: ${t.borderMid}; }
        .af-inp:focus { border-color: ${t.text}; box-shadow: 0 0 0 1px ${t.text}; }
        .af-inp[aria-invalid="true"] { border-color: ${t.danger}; }
        .af-btn:focus-visible, .af-link:focus-visible, .af-logo:focus-visible, .af-chip:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 2px; }
        .af-chip { transition: border-color 0.12s, background 0.12s; }
        .af-chip:hover { border-color: ${t.textMuted} !important; }
      `}</style>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px clamp(16px, 4vw, 28px)', flexShrink: 0 }}>
        <Logo onClick={onLogoClick} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>{center}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13, color: t.textMuted }}>
          {right}
          {onToggleTheme && (
            <button type="button" className="af-btn" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bgCard, color: t.textMuted, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              {theme === 'dark' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            </button>
          )}
        </div>
      </header>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: align === 'top' ? 'flex-start' : 'center', padding: '12px 16px 56px' }}>
        {children}
      </main>
    </div>
  )
}

/** A label above a control, with an optional "(optional)" marker, hint and error. */
export function Field({ id, label, optional, hint, error, theme = 'dark', children }) {
  const t = THEMES[theme]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 700, color: t.textSub }}>
          {label}{optional && <span style={{ fontWeight: 500, color: t.textMuted }}> (optional)</span>}
        </label>
      )}
      {children}
      {error
        ? <div id={id ? `${id}-err` : undefined} style={{ fontSize: 12.5, color: t.danger, lineHeight: 1.45 }}>{error}</div>
        : hint && <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.45 }}>{hint}</div>}
    </div>
  )
}

/** A password box with a Show/Hide button inside it. */
export function PasswordInput({ id, value, onChange, autoComplete, placeholder, theme = 'dark', invalid }) {
  const t = THEMES[theme]
  const [shown, setShown] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input id={id} className="af-inp" type={shown ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} placeholder={placeholder}
        aria-invalid={invalid || undefined} style={{ paddingRight: 64 }} />
      <button type="button" className="af-btn" onClick={() => setShown(s => !s)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}
        style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', padding: '5px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: t.textSub, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

/** Button styles: 'primary' (gold) or 'secondary' (outlined). */
export const authBtn = (t, kind = 'primary', { disabled = false, full = false } = {}) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  minHeight: 42, padding: '0 18px', borderRadius: 10, fontFamily: FONT_B, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap',
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1, width: full ? '100%' : undefined,
  ...(kind === 'primary'
    ? { border: 'none', background: t.accent, color: NAVY }
    : { border: `1px solid ${t.border}`, background: t.bgCard, color: t.text }),
})

/** An inline text link (a button that looks like a link). */
export const linkStyle = (t) => ({
  border: 'none', background: 'none', padding: 0, fontFamily: FONT_B, fontSize: 'inherit', fontWeight: 700, color: t.text, cursor: 'pointer',
  textDecoration: 'underline', textDecorationColor: t.accent, textDecorationThickness: 2, textUnderlineOffset: 3,
})

/** A one-line message: 'danger' for errors, 'info' for "check your inbox". */
export function Note({ tone = 'info', theme = 'dark', children }) {
  const t = THEMES[theme]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} style={{ padding: '10px 13px', borderRadius: 9, fontSize: 13, lineHeight: 1.55,
      ...(tone === 'danger' ? { background: t.dangerBg, color: t.danger } : { background: t.bgSubtle, color: t.textSub, border: `1px solid ${t.border}` }) }}>
      {children}
    </div>
  )
}

/** A choice chip: ink when chosen. `size="lg"` for onboarding answers. */
export const choiceChip = (t, on, size = 'md') => ({
  padding: size === 'lg' ? '11px 18px' : '7px 13px', borderRadius: size === 'lg' ? 12 : 999,
  border: `1px solid ${on ? t.text : t.border}`, background: on ? t.text : t.bgCard, color: on ? t.bg : t.textSub,
  fontFamily: FONT_B, fontSize: size === 'lg' ? 15.5 : 13, fontWeight: 700, cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
})
