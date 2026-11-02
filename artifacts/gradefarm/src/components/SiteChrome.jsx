import { useState, useEffect } from 'react'
import { Sun, Moon, Menu, X } from 'lucide-react'
import { THEMES } from '../lib/theme'

// The public site's shared pieces (homepage, pricing): colours from the app's
// theme, base styles, the top nav, the footer and the wordmark. Each page
// puts SITE_CSS in its own <style> and its root gets className="lp" with
// themeVars(theme).

const FONT_B = "'Plus Jakarta Sans', 'Segoe UI', sans-serif"
export const NAVY = '#0c1037'

// The app shell's window colour (shellColors in App.jsx).
const WINDOW = { light: { bg: '#eef0f7', icon: '#b07d0c' }, dark: { bg: '#111113', icon: '#e2b54c' } }

export function themeVars(theme) {
  const t = THEMES[theme]
  const w = WINDOW[theme]
  const dark = theme === 'dark'
  return {
    '--lp-win': w.bg, '--lp-page': t.bg, '--lp-card': t.bgCard, '--lp-subtle': t.bgSubtle,
    '--lp-line': t.border, '--lp-line-2': t.borderMid,
    '--lp-ink': t.text, '--lp-ink-2': t.textSub, '--lp-muted': t.textMuted, '--lp-faint': t.textFaint,
    '--lp-gold': t.accent, '--lp-gold-text': t.goldText, '--lp-icon': w.icon,
    '--lp-ok': t.success, '--lp-ok-bg': t.successBg, '--lp-bad': t.danger, '--lp-bad-bg': t.dangerBg,
    '--lp-on-bg': dark ? t.text : NAVY, '--lp-on-fg': dark ? t.bg : '#ffffff',
    '--lp-sel-row': dark ? 'rgba(255,255,255,0.05)' : '#fdf6e1',
    // The field's squares: not tried, coming back, right once, in the bag.
    '--lp-sq0': dark ? '#2a2a30' : '#e3e6f0', '--lp-sq2': dark ? 'rgba(226,181,76,0.38)' : '#f7dc93', '--lp-sq3': dark ? '#e2b54c' : '#e0a91f',
    '--lp-faded': dark ? '#5d5d66' : '#a3a9c2',
    // The wordmark: navy and gold on light, white and gold on dark.
    '--lp-logo-g': dark ? '#ffffff' : NAVY, '--lp-logo-f': dark ? '#f1be43' : '#e8ac1c',
    '--lp-float': dark ? '0 14px 36px rgba(0,0,0,0.5)' : '0 14px 36px rgba(12,16,55,0.12)',
  }
}

/** Fonts the public pages load: the wordmark's Sifonn Pro, and Caveat for hand-drawn hints. */
export const SITE_FONTS = "@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap');\n@font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }"

export const SITE_CSS = `
.lp { min-height: 100vh; background: var(--lp-win); color: var(--lp-ink); font-family: ${FONT_B}; font-size: 15px; line-height: 1.6; overflow-x: clip; -webkit-font-smoothing: antialiased; }
.lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
.lp h1, .lp h2, .lp h3 { margin: 0; letter-spacing: -0.02em; text-wrap: balance; }
.lp p { margin: 0; }
.lp button { font-family: inherit; }
.lp :focus-visible { outline: 2px solid var(--lp-gold); outline-offset: 2px; }
.lp-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.lp-in { max-width: 1160px; margin: 0 auto; padding-left: max(28px, env(safe-area-inset-left, 0px)); padding-right: max(28px, env(safe-area-inset-right, 0px)); }
.lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 42px; padding: 0 18px; border-radius: 10px; font-size: 14px; font-weight: 800; white-space: nowrap; cursor: pointer; border: 1px solid var(--lp-line); background: var(--lp-card); color: var(--lp-ink); }
.lp-btn:hover { border-color: var(--lp-line-2); }
.lp-btn.gold { border: none; background: var(--lp-gold); color: ${NAVY}; }
.lp-btn.gold:hover { filter: brightness(1.04); }
.lp-btn.sm { min-height: 34px; padding: 0 13px; font-size: 13px; border-radius: 9px; }
.lp-btn.lg { min-height: 50px; padding: 0 26px; font-size: 16px; border-radius: 12px; }
.lp-btn:disabled { opacity: 0.5; cursor: default; }
.lp-link { border: none; background: none; padding: 0; font-size: inherit; font-weight: 700; color: var(--lp-ink); cursor: pointer; text-decoration: underline; text-decoration-color: var(--lp-gold); text-decoration-thickness: 2px; text-underline-offset: 3px; }
/* The logo keeps its own font (Sifonn Pro) and spacing; the .lp prefix puts it above the rule that gives buttons the body font. */
.lp-brand { white-space: nowrap; } .lp-brand .g { color: var(--lp-logo-g); } .lp-brand .f { color: var(--lp-logo-f); }
.lp .lp-wordmark { display: inline-flex; align-items: baseline; border: none; background: none; padding: 0; font-family: 'Sifonn Pro', sans-serif; letter-spacing: 0.08em; line-height: 1; white-space: nowrap; cursor: pointer; }
.lp-wordmark .g { color: var(--lp-logo-g); } .lp-wordmark .f { color: var(--lp-logo-f); }
.lp-icon-btn { width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--lp-line); background: var(--lp-card); color: var(--lp-muted); display: grid; place-items: center; cursor: pointer; flex-shrink: 0; }
.lp-card { background: var(--lp-card); border: 1px solid var(--lp-line); border-radius: 14px; }
.lp-muted { color: var(--lp-muted); }
/* nav */
.lp-nav { position: sticky; top: 0; z-index: 50; background: var(--lp-win); border-bottom: 1px solid transparent; transition: border-color 0.15s; }
.lp-nav[data-scrolled="true"] { border-bottom-color: var(--lp-line); }
.lp-nav .lp-in { display: flex; align-items: center; gap: 24px; height: 62px; }
.lp-nav-links { display: flex; gap: 22px; }
.lp-nav-links button { border: none; background: none; padding: 4px 0; font-size: 13.5px; font-weight: 600; color: var(--lp-muted); cursor: pointer; }
.lp-nav-links button:hover { color: var(--lp-ink); }
.lp-nav-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.lp-menu-btn { display: none; }
.lp-menu { border-top: 1px solid var(--lp-line); padding: 6px 0 12px; }
.lp-menu button { display: block; width: 100%; text-align: left; border: none; background: none; padding: 12px 0; font-size: 15px; font-weight: 700; color: var(--lp-ink); cursor: pointer; border-bottom: 1px solid var(--lp-line); }
.lp-menu button:last-child { border-bottom: none; }
.lp-sw { display: inline-flex; border: 1px solid var(--lp-line); border-radius: 8px; overflow: hidden; }
.lp-sw button, .lp-sw span { border: none; background: transparent; font-size: 12px; font-weight: 700; color: var(--lp-muted); padding: 5px 10px; cursor: pointer; }
.lp-sw > * + * { border-left: 1px solid var(--lp-line) !important; }
.lp-sw [aria-pressed="true"], .lp-sw .on { background: var(--lp-on-bg); color: var(--lp-on-fg); }
.lp-sec { padding-top: 72px; padding-bottom: 72px; border-top: 1px solid var(--lp-line); scroll-margin-top: 62px; }
/* Section headings are centred, like "This is spaced repetition." */
.lp-sec-head { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.lp-sec-head h2 { font-size: clamp(27px, 3.6vw, 40px); font-weight: 800; line-height: 1.1; letter-spacing: -0.03em; max-width: 26ch; }
.lp-sec-head p { color: var(--lp-muted); max-width: 58ch; font-size: 16px; }
.lp-faq { margin-top: 22px; border-top: 1px solid var(--lp-line); }
.lp-faq details { border-bottom: 1px solid var(--lp-line); }
.lp-faq summary { cursor: pointer; padding: 17px 0; font-weight: 800; font-size: 16.5px; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
.lp-faq summary::-webkit-details-marker { display: none; }
.lp-faq summary::after { content: "+"; font-weight: 600; color: var(--lp-muted); }
.lp-faq details[open] summary::after { content: "−"; }
.lp-faq details p { padding: 0 0 17px; color: var(--lp-muted); max-width: 70ch; }
.lp-foot { border-top: 1px solid var(--lp-line); }
.lp-foot .lp-in { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; padding-top: 22px; padding-bottom: 22px; font-size: 12.5px; color: var(--lp-muted); }
.lp-foot-links { display: flex; gap: 18px; flex-wrap: wrap; }
.lp-foot-links button { border: none; background: none; padding: 0; font-size: 12.5px; color: var(--lp-muted); cursor: pointer; }
.lp-foot-links button:hover { color: var(--lp-ink); }
.lp-copy { margin-left: auto; }
@media (max-width: 760px) {
  .lp-in { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .lp-nav-links, .lp-nav-signin { display: none; }
  .lp-menu-btn { display: grid; }
  .lp-sec { padding-top: 52px; padding-bottom: 52px; }
  .lp-copy { margin-left: 0; }
}
`

/** "gradefarm." in its brand colours inside running text (the heading's own font). */
export function Brand() {
  return <span className="lp-brand"><span className="g">grade</span><span className="f">farm.</span></span>
}

/** The wordmark as a button, at the size given. */
export function Wordmark({ size = 28, onClick, label = 'gradefarm. home' }) {
  return <button type="button" className="lp-wordmark" style={{ fontSize: size }} aria-label={label} onClick={onClick}><span className="g">grade</span><span className="f">farm.</span></button>
}

/**
 * The top nav: wordmark, `links` ([label, onClick, current?]), Sign in,
 * Start free, the light/dark switch, and a menu on phones.
 */
export function SiteNav({ theme, onToggleTheme, onSignIn, onStart, onLogo, links }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])
  const pick = (fn) => () => { setMenuOpen(false); fn() }
  return (
    <nav className="lp-nav" data-scrolled={scrolled || menuOpen} aria-label="Main">
      <div className="lp-in">
        <Wordmark onClick={onLogo} />
        <div className="lp-nav-links">
          {links.map(([label, fn, current]) => <button key={label} type="button" onClick={pick(fn)} aria-current={current ? 'page' : undefined}>{label}</button>)}
        </div>
        <div className="lp-nav-right">
          <button type="button" className="lp-btn sm lp-nav-signin" onClick={onSignIn}>Sign in</button>
          <button type="button" className="lp-btn sm gold" onClick={onStart}>Start free</button>
          {onToggleTheme && (
            <button type="button" className="lp-icon-btn" onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              {theme === 'dark' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            </button>
          )}
          <button type="button" className="lp-icon-btn lp-menu-btn" onClick={() => setMenuOpen(o => !o)}
            aria-expanded={menuOpen} aria-controls="lp-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'}>
            {menuOpen ? <X size={16} aria-hidden="true" /> : <Menu size={16} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <div id="lp-menu" className="lp-in">
          <div className="lp-menu">
            {links.map(([label, fn]) => <button key={label} type="button" onClick={pick(fn)}>{label}</button>)}
            <button type="button" onClick={pick(onSignIn)}>Sign in</button>
          </div>
        </div>
      )}
    </nav>
  )
}

/** The footer: wordmark, `links` ([label, onClick]) and the copyright line. */
export function SiteFooter({ links, hidden }) {
  return (
    <footer className="lp-foot" hidden={hidden}>
      <div className="lp-in">
        <span className="lp-wordmark" style={{ fontSize: 21, cursor: 'default' }}><span className="g">grade</span><span className="f">farm.</span></span>
        <div className="lp-foot-links">
          {links.map(([label, fn]) => <button key={label} type="button" onClick={fn}>{label}</button>)}
        </div>
        <span className="lp-copy">© 2026 Titanium Tutoring · Adelaide, SA</span>
      </div>
    </footer>
  )
}

/** The footer's links. `go(id)` scrolls to a homepage section. */
export function siteFooterLinks(navigate, go) {
  return [
    ['How it works', () => go('how')],
    ['Subjects', () => go('subjects')],
    ['Pricing', () => navigate('/pricing')],
    ['Privacy', () => navigate('/privacy')],
    ['Terms', () => navigate('/terms')],
    ['For tutors', () => navigate('/auth/tutor')],
    ['Year 6 selective', () => navigate('/year-6')],
  ]
}
