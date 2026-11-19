import { useState, useEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
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
/* Page dimensions: side margins, header height, section spacing and widest content. */
.lp { --lp-gutter: clamp(22px, 4vw, 54px); --lp-header: 96px; --lp-section: clamp(36px, 5vw, 54px); --lp-max: 1376px; }
@media (max-width: 832px) { .lp { --lp-header: 76px; } }
.lp { min-height: 100vh; background: var(--lp-win); color: var(--lp-ink); font-family: ${FONT_B}; font-size: 15px; line-height: 1.6; overflow-x: clip; -webkit-font-smoothing: antialiased; }
.lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
.lp h1, .lp h2, .lp h3 { margin: 0; letter-spacing: -0.02em; text-wrap: balance; }
.lp p { margin: 0; }
.lp button { font-family: inherit; }
.lp :focus-visible { outline: 2px solid var(--lp-gold); outline-offset: 2px; }
.lp-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.lp-in { max-width: var(--lp-max); margin: 0 auto; padding-left: max(var(--lp-gutter), env(safe-area-inset-left, 0px)); padding-right: max(var(--lp-gutter), env(safe-area-inset-right, 0px)); }
.lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 42px; padding: 0 18px; border-radius: 10px; font-size: 14px; font-weight: 800; white-space: nowrap; cursor: pointer; border: 1px solid var(--lp-line); background: var(--lp-card); color: var(--lp-ink); }
.lp-btn:hover { border-color: var(--lp-line-2); }
.lp-btn.gold { border: none; background: var(--lp-gold); color: ${NAVY}; }
.lp-btn.gold:hover { filter: brightness(1.04); }
.lp-btn.sm { min-height: 34px; padding: 0 13px; font-size: 13px; border-radius: 9px; }
.lp-btn.lg { min-height: 50px; padding: 0 26px; font-size: 16px; border-radius: 12px; }
.lp-btn:disabled { opacity: 0.5; cursor: default; }
/* The main call to action (StartButton): bigger than any other button, with a gold glow and a soft pulse around it. */
/* The main call to action (StartButton): a big gold pill in capitals with a soft gold glow; the arrow nudges right on hover. */
.lp-btn.cta { position: relative; min-height: 60px; padding: 0 28px 0 32px; gap: 12px; font-size: 15.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 999px; box-shadow: 0 10px 24px -10px rgba(224,169,31,0.9); transition: transform 0.15s, box-shadow 0.15s, filter 0.15s; }
.lp-btn.cta:hover { filter: brightness(1.04); transform: translateY(-1px); box-shadow: 0 14px 28px -10px rgba(224,169,31,0.95); }
.lp-btn.cta:active { transform: none; }
.lp-btn.cta svg { transition: transform 0.15s; }
.lp-btn.cta:hover svg { transform: translateX(3px); }
.lp-link { border: none; background: none; padding: 0; font-size: inherit; font-weight: 700; color: var(--lp-ink); cursor: pointer; text-decoration: underline; text-decoration-color: var(--lp-gold); text-decoration-thickness: 2px; text-underline-offset: 3px; }
/* The logo keeps its own font (Sifonn Pro) and spacing; the .lp prefix puts it above the rule that gives buttons the body font. */
.lp-brand { white-space: nowrap; } .lp-brand .g { color: var(--lp-logo-g); } .lp-brand .f { color: var(--lp-logo-f); }
.lp .lp-wordmark { display: inline-flex; align-items: baseline; border: none; background: none; padding: 0; font-family: 'Sifonn Pro', sans-serif; letter-spacing: 0.08em; line-height: 1; white-space: nowrap; cursor: pointer; }
.lp-wordmark .g { color: var(--lp-logo-g); } .lp-wordmark .f { color: var(--lp-logo-f); }
.lp-icon-btn { width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--lp-line); background: var(--lp-card); color: var(--lp-muted); display: grid; place-items: center; cursor: pointer; flex-shrink: 0; }
.lp-card { background: var(--lp-card); border: 1px solid var(--lp-line); border-radius: 14px; }
.lp-muted { color: var(--lp-muted); }
/* nav */
/* A tall bar (like eMedici's) with everything centred in it. Clear at the top of the page;
   once scrolled, semi-translucent with the page blurred behind it. It never changes height. */
.lp-nav { position: sticky; top: 0; z-index: 50; background: transparent; transition: background 0.2s, box-shadow 0.2s; }
/* Over a page's hero (overlay), the bar takes no space of its own, so the hero runs up behind it. */
.lp-nav.overlay { margin-bottom: calc(-1 * var(--lp-header)); }
.lp-nav[data-scrolled="true"] { background: var(--lp-win); box-shadow: 0 1px 0 var(--lp-line); }
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .lp-nav[data-scrolled="true"] { background: color-mix(in srgb, var(--lp-win) 72%, transparent); -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px); box-shadow: 0 1px 0 color-mix(in srgb, var(--lp-line) 85%, transparent); }
}
.lp-nav-row { position: relative; display: flex; align-items: center; gap: 16px; height: var(--lp-header); }
.lp-nav .lp-wordmark { display: flex; align-items: center; height: 40px; }
/* The links sit in the middle of the bar, whatever is either side of them. */
.lp-nav-links { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 34px; }
.lp-nav-links button { border: none; background: none; padding: 8px 0; font-size: 15.5px; font-weight: 600; line-height: 1; color: var(--lp-muted); cursor: pointer; }
.lp-nav-links button:hover, .lp-nav-links button[aria-current="page"] { color: var(--lp-ink); }
.lp-nav-right { margin-left: auto; display: flex; align-items: center; gap: 18px; }
.lp-nav-login { position: relative; top: -1px; border: none; background: none; padding: 10px 2px; font-size: 15px; font-weight: 700; line-height: 1; color: var(--lp-ink); cursor: pointer; white-space: nowrap; }
.lp-nav-login:hover { text-decoration: underline; text-decoration-color: var(--lp-gold); text-decoration-thickness: 2px; text-underline-offset: 5px; }
/* Start: a gold pill, in capitals. */
.lp-nav-start { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 46px; padding: 0 22px 0 24px; border: none; border-radius: 999px; background: var(--lp-gold); color: ${NAVY}; font-size: 13.5px; font-weight: 800; line-height: 1; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; cursor: pointer; box-shadow: 0 6px 16px -8px rgba(224, 169, 31, 0.9); transition: transform 0.15s, box-shadow 0.15s, filter 0.15s; }
.lp-nav-start:hover { filter: brightness(1.04); transform: translateY(-1px); box-shadow: 0 10px 20px -8px rgba(224, 169, 31, 0.95); }
.lp-nav-start:active { transform: none; }
.lp-nav-start svg { transition: transform 0.15s; }
.lp-nav-start:hover svg { transform: translateX(2px); }
.lp-menu-btn { display: none; align-items: center; gap: 10px; height: 42px; padding: 0 4px 0 10px; margin-right: -4px; border: none; background: none; color: var(--lp-ink); font-size: 15px; font-weight: 700; line-height: 1; cursor: pointer; border-radius: 999px; }
.lp-menu-btn:hover { background: color-mix(in srgb, var(--lp-ink) 6%, transparent); }
/* Two lines that cross into an X while the menu is open. */
/* Plus Jakarta Sans sits its letters a little below the middle of their box; lift the word so it lines up with the two lines. */
.lp-menu-word { position: relative; top: -1px; }
.lp-menu-lines { position: relative; width: 22px; height: 10px; flex-shrink: 0; }
.lp-menu-lines::before, .lp-menu-lines::after { content: ""; position: absolute; left: 0; right: 0; height: 2px; border-radius: 2px; background: currentColor; transition: transform 0.2s, top 0.2s; }
.lp-menu-lines::before { top: 0; } .lp-menu-lines::after { top: 8px; }
.lp-menu-btn[aria-expanded="true"] .lp-menu-lines::before { top: 4px; transform: rotate(45deg); }
.lp-menu-btn[aria-expanded="true"] .lp-menu-lines::after { top: 4px; transform: rotate(-45deg); }
/* The menu (below laptop width): a see-through, blurred sheet over the whole screen, with the bar
   (logo and Close) on top, big links, and Log in and Start at the bottom. */
.lp-sheet { position: fixed; inset: 0; z-index: -1; display: flex; flex-direction: column; padding-top: calc(var(--lp-header) + env(safe-area-inset-top, 0px)); background: var(--lp-win); animation: lpSheetIn 0.2s ease both; }
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .lp-sheet { background: color-mix(in srgb, var(--lp-win) 78%, transparent); -webkit-backdrop-filter: saturate(160%) blur(26px); backdrop-filter: saturate(160%) blur(26px); }
}
@keyframes lpSheetIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes lpSheetItem { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.lp-sheet-links { flex: 1; overflow-y: auto; width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding-top: 20px; padding-bottom: 20px; }
.lp-sheet-links button { border: none; background: none; padding: 10px 0; font-size: 32px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.15; color: var(--lp-ink); text-align: left; cursor: pointer; animation: lpSheetItem 0.3s ease both; }
.lp-sheet-links button:nth-child(2) { animation-delay: 0.04s; } .lp-sheet-links button:nth-child(3) { animation-delay: 0.08s; } .lp-sheet-links button:nth-child(4) { animation-delay: 0.12s; }
.lp-sheet-links button:hover, .lp-sheet-links button[aria-current="page"] { color: var(--lp-gold-text); }
.lp-sheet-foot { width: 100%; display: flex; flex-direction: column; align-items: stretch; gap: 10px; padding-top: 14px; padding-bottom: max(22px, env(safe-area-inset-bottom, 0px)); border-top: 1px solid color-mix(in srgb, var(--lp-line) 90%, transparent); background: color-mix(in srgb, var(--lp-win) 90%, transparent); max-width: none; }
/* The bottom strip spans the screen; its contents keep the page's width. */
.lp-sheet-foot > * { width: 100%; max-width: calc(var(--lp-max) - 2 * var(--lp-gutter)); margin: 0 auto; }
.lp-sheet-login { border: none; background: none; padding: 14px 0; font-size: 19px; font-weight: 700; line-height: 1; color: var(--lp-ink); cursor: pointer; }
.lp-sheet-foot .lp-nav-start { display: inline-flex; width: 100%; height: 56px; font-size: 15px; }
@media (prefers-reduced-motion: reduce) { .lp-sheet, .lp-sheet-links button { animation: none; } }
.lp-sw { display: inline-flex; border: 1px solid var(--lp-line); border-radius: 8px; overflow: hidden; }
.lp-sw button, .lp-sw span { border: none; background: transparent; font-size: 12px; font-weight: 700; color: var(--lp-muted); padding: 5px 10px; cursor: pointer; }
.lp-sw > * + * { border-left: 1px solid var(--lp-line) !important; }
.lp-sw [aria-pressed="true"], .lp-sw .on { background: var(--lp-on-bg); color: var(--lp-on-fg); }
.lp-sec { padding-top: var(--lp-section); padding-bottom: var(--lp-section); border-top: 1px solid var(--lp-line); scroll-margin-top: var(--lp-header); }
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
@media (prefers-reduced-motion: reduce) { .lp-btn.cta, .lp-btn.cta svg, .lp-nav-start, .lp-nav-start svg { transition: none; } }
/* Below a laptop width the centred links move into the menu. */
@media (max-width: 960px) {
  .lp-nav-links { display: none; }
  .lp-menu-btn { display: inline-flex; }
}
/* Phones: just the logo and Menu. Log in and Start move into the menu. */
@media (max-width: 760px) {
  .lp-nav .lp-wordmark { font-size: 24px !important; }
  .lp-nav-login, .lp-nav-start { display: none; }
}
@media (max-width: 760px) {
  .lp-copy { margin-left: 0; }
}
`

/** "gradefarm." in its brand colours inside running text (the heading's own font). */
export function Brand() {
  return <span className="lp-brand"><span className="g">grade</span><span className="f">farm.</span></span>
}

/** The main call to action on the public pages: "Start GradeFarming". */
export function StartButton({ onClick, children = 'Start GradeFarming' }) {
  return <button type="button" className="lp-btn gold cta" onClick={onClick}>{children}<ArrowRight size={19} strokeWidth={2.75} aria-hidden="true" /></button>
}

/** The wordmark as a button, at the size given. */
export function Wordmark({ size = 28, onClick, label = 'gradefarm. home' }) {
  return <button type="button" className="lp-wordmark" style={{ fontSize: size }} aria-label={label} onClick={onClick}><span className="g">grade</span><span className="f">farm.</span></button>
}

/**
 * The top nav: wordmark, `links` ([label, onClick, current?]), Log in,
 * Start GradeFarming, and Menu below laptop width (on phones it holds Log in and Start too). Light or dark follows the device.
 */
export function SiteNav({ onSignIn, onStart, onLogo, links, overlay = false }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtn = useRef(null)
  const firstLink = useRef(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // While the menu is open: the page underneath doesn't scroll, Escape closes it, and it closes
  // by itself if the window grows past the width where the links show in the bar.
  useEffect(() => {
    if (!menuOpen) {
      if (wasOpen.current) menuBtn.current?.focus()
      wasOpen.current = false
      return undefined
    }
    wasOpen.current = true
    firstLink.current?.focus()
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    const wide = window.matchMedia?.('(min-width: 961px)')
    const onWide = (e) => { if (e.matches) setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    wide?.addEventListener?.('change', onWide)
    return () => {
      root.style.overflow = before
      window.removeEventListener('keydown', onKey)
      wide?.removeEventListener?.('change', onWide)
    }
  }, [menuOpen])
  const pick = (fn) => () => { setMenuOpen(false); fn() }
  return (
    <nav className={`lp-nav${overlay ? ' overlay' : ''}`} data-scrolled={scrolled && !menuOpen} data-open={menuOpen} aria-label="Main">
      <div className="lp-in lp-nav-row">
        <Wordmark size={26} onClick={onLogo} />
        <div className="lp-nav-links">
          {links.map(([label, fn, current]) => <button key={label} type="button" onClick={pick(fn)} aria-current={current ? 'page' : undefined}>{label}</button>)}
        </div>
        <div className="lp-nav-right">
          <button type="button" className="lp-nav-login" onClick={onSignIn}>Log in</button>
          <button type="button" className="lp-nav-start" onClick={onStart}>Start GradeFarming<ArrowRight size={16} strokeWidth={2.75} aria-hidden="true" /></button>
          <button type="button" ref={menuBtn} className="lp-menu-btn" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-controls="lp-menu">
            <span className="lp-menu-lines" aria-hidden="true" /><span className="lp-menu-word">{menuOpen ? 'Close' : 'Menu'}</span>
          </button>
        </div>
      </div>
      {menuOpen && (
        <div id="lp-menu" className="lp-sheet" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="lp-in lp-sheet-links">
            {links.map(([label, fn, current], i) => <button key={label} ref={i === 0 ? firstLink : undefined} type="button" onClick={pick(fn)} aria-current={current ? 'page' : undefined}>{label}</button>)}
          </div>
          <div className="lp-in lp-sheet-foot">
            <button type="button" className="lp-sheet-login" onClick={pick(onSignIn)}>Log in</button>
            <button type="button" className="lp-nav-start" onClick={pick(onStart)}>Start GradeFarming<ArrowRight size={18} strokeWidth={2.75} aria-hidden="true" /></button>
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
        <span className="lp-copy">© 2026 Titanium Tutoring</span>
      </div>
    </footer>
  )
}

/** The footer's links. `go(id)` scrolls to a homepage section. */
export function siteFooterLinks(navigate, go) {
  return [
    ['Features', () => navigate('/features')],
    ['Subjects', () => go('subjects')],
    ['Pricing', () => navigate('/pricing')],
    ['Privacy', () => navigate('/privacy')],
    ['Terms', () => navigate('/terms')],
    ['For tutors', () => navigate('/auth/tutor')],
    ['Year 6 selective', () => navigate('/year-6')],
  ]
}
