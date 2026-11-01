import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { SquareCheckBig, GraduationCap, ChartLine, ChevronDown, Sun, Moon, Menu, X } from 'lucide-react'
import { usePublicSubjects } from '../lib/publicSubjects'
import { SubjectIconByName } from './SubjectIcons'
import { formatSubjectLabel } from '../lib/subjects'
import { getPlatformSettings } from '../lib/db'
import { studentTiers, extraLadder } from '../lib/pricing'
import { THEMES } from '../lib/theme'
import { Logo } from './AuthLayout'

// The public homepage (/home). It uses the app's own look so a visitor sees
// the product they'll sign into: the window colour behind, content on plain
// bordered cards, sentence-case headings, gold only on the main button, light
// and dark from the saved theme. The previews are drawn from the real
// Practice, question, Learn and Progress screens with a sample student.

const FONT_B = "'Plus Jakarta Sans', 'Segoe UI', sans-serif"
const NAVY = '#0c1037'

// The app shell's window colour (shellColors in App.jsx): the sidebar sits on
// it and the page is a sheet on top.
const WINDOW = { light: { bg: '#eef0f7', icon: '#b07d0c' }, dark: { bg: '#111113', icon: '#e2b54c' } }

/** CSS variables for this page from the theme tokens. */
function themeVars(theme) {
  const t = THEMES[theme]
  const w = WINDOW[theme]
  const dark = theme === 'dark'
  return {
    '--lp-win': w.bg, '--lp-page': t.bg, '--lp-card': t.bgCard, '--lp-subtle': t.bgSubtle,
    '--lp-line': t.border, '--lp-line-2': t.borderMid,
    '--lp-ink': t.text, '--lp-ink-2': t.textSub, '--lp-muted': t.textMuted, '--lp-faint': t.textFaint,
    '--lp-gold': t.accent, '--lp-gold-text': t.goldText, '--lp-icon': w.icon,
    '--lp-ok': t.success, '--lp-ok-bg': t.successBg, '--lp-bad': t.danger, '--lp-bad-bg': t.dangerBg,
    // Selected choices are ink, as on the Practice page.
    '--lp-on-bg': dark ? t.text : NAVY, '--lp-on-fg': dark ? t.bg : '#ffffff',
    '--lp-sel-row': dark ? 'rgba(255,255,255,0.05)' : '#fdf6e1',
    '--lp-float': dark ? '0 12px 32px rgba(0,0,0,0.5)' : '0 12px 32px rgba(12,16,55,0.12)',
  }
}

const CSS = `
.lp { min-height: 100vh; background: var(--lp-win); color: var(--lp-ink); font-family: ${FONT_B}; font-size: 15px; line-height: 1.6; overflow-x: hidden; -webkit-font-smoothing: antialiased; }
.lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
.lp h1, .lp h2, .lp h3 { margin: 0; letter-spacing: -0.02em; text-wrap: balance; }
.lp p { margin: 0; }
.lp button { font-family: inherit; }
.lp :focus-visible { outline: 2px solid var(--lp-gold); outline-offset: 2px; }
.lp-in { max-width: 1160px; margin: 0 auto; padding-left: max(28px, env(safe-area-inset-left, 0px)); padding-right: max(28px, env(safe-area-inset-right, 0px)); }

/* buttons and links: the same as sign-in (authBtn, linkStyle) */
.lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 42px; padding: 0 18px; border-radius: 10px; font-size: 14px; font-weight: 800; white-space: nowrap; cursor: pointer; border: 1px solid var(--lp-line); background: var(--lp-card); color: var(--lp-ink); }
.lp-btn:hover { border-color: var(--lp-line-2); }
.lp-btn.gold { border: none; background: var(--lp-gold); color: ${NAVY}; }
.lp-btn.gold:hover { filter: brightness(1.04); }
.lp-btn.sm { min-height: 34px; padding: 0 13px; font-size: 13px; border-radius: 9px; }
.lp-link { border: none; background: none; padding: 0; font-size: inherit; font-weight: 700; color: var(--lp-ink); cursor: pointer; text-decoration: underline; text-decoration-color: var(--lp-gold); text-decoration-thickness: 2px; text-underline-offset: 3px; }
.lp-icon-btn { width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--lp-line); background: var(--lp-card); color: var(--lp-muted); display: grid; place-items: center; cursor: pointer; flex-shrink: 0; }
.lp-card { background: var(--lp-card); border: 1px solid var(--lp-line); border-radius: 12px; }

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

/* hero */
.lp-hero { display: grid; grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr); gap: 48px; align-items: center; padding-top: 44px; padding-bottom: 64px; }
.lp-hero h1 { font-size: clamp(34px, 4.4vw, 52px); font-weight: 800; line-height: 1.07; }
.lp-sub { margin-top: 18px !important; font-size: 17px; color: var(--lp-muted); max-width: 46ch; }
.lp-ctas { display: flex; align-items: center; gap: 20px; margin-top: 28px; flex-wrap: wrap; }
.lp-facts { display: flex; flex-wrap: wrap; gap: 6px 20px; margin-top: 30px; padding-top: 18px; border-top: 1px solid var(--lp-line); font-size: 13px; color: var(--lp-muted); }
.lp-facts b { color: var(--lp-ink); font-weight: 700; }

/* the Practice screen in the hero */
.lp-app { display: grid; grid-template-columns: 150px minmax(0, 1fr); background: var(--lp-win); border: 1px solid var(--lp-line); border-radius: 14px; overflow: hidden; box-shadow: var(--lp-float); font-size: 12.5px; min-width: 0; }
.lp-sb { padding: 10px 8px; display: flex; flex-direction: column; gap: 4px; }
.lp-sb-logo { display: flex; justify-content: center; align-items: center; height: 30px; border-radius: 8px; background: ${NAVY}; font-family: 'Sifonn Pro', sans-serif; font-size: 12px; letter-spacing: 1px; margin-bottom: 6px; }
.lp-sbrow { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 8px; color: var(--lp-muted); font-weight: 600; white-space: nowrap; overflow: hidden; }
.lp-sbrow.subj { justify-content: space-between; border: 1px solid var(--lp-line); background: var(--lp-card); color: var(--lp-ink); font-weight: 700; margin-bottom: 6px; }
.lp-sbrow.on { background: var(--lp-card); color: var(--lp-ink); box-shadow: 0 0 0 1px var(--lp-line); }
.lp-sbrow.on svg { color: var(--lp-icon); }
.lp-sb-acct { margin-top: auto; padding: 8px 9px 2px; border-top: 1px solid var(--lp-line); font-size: 11.5px; color: var(--lp-muted); }
.lp-sb-acct b { display: block; color: var(--lp-ink); font-size: 12px; }
.lp-pg { background: var(--lp-page); margin: 6px 6px 6px 0; border: 1px solid var(--lp-line); border-radius: 10px; padding: 16px; display: grid; grid-template-columns: minmax(0, 1fr) 158px; gap: 12px; align-items: start; min-width: 0; }
.lp-pg > * { min-width: 0; }
.lp-pg-head { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: flex-end; gap: 6px 12px; flex-wrap: wrap; }
.lp-pg-head h3 { font-size: 18px; font-weight: 800; }
.lp-pg-head small { font-size: 11.5px; color: var(--lp-muted); }
.lp-pg-head small b { color: var(--lp-ink); }
.lp-tree { padding: 4px 0; }
.lp-trow { display: flex; align-items: center; gap: 8px; padding: 6px 12px; }
.lp-trow.top { border-bottom: 1px solid var(--lp-line); }
.lp-trow.sub { padding-left: 30px; }
.lp-trow.sel { background: var(--lp-sel-row); }
.lp-trow .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-trow.top .nm, .lp-trow.grp .nm { font-weight: 800; }
.lp-trow .num { color: var(--lp-faint); margin-right: 5px; }
.lp-trow .cnt { color: var(--lp-faint); font-size: 11px; }
.lp-trow .pct { font-size: 11px; font-weight: 700; width: 34px; text-align: right; font-variant-numeric: tabular-nums; }
.lp-cb { width: 14px; height: 14px; border-radius: 4px; border: 1.5px solid var(--lp-faint); flex-shrink: 0; display: inline-grid; place-items: center; font-size: 9px; font-weight: 800; line-height: 1; }
.lp-cb.on { background: var(--lp-on-bg); border-color: var(--lp-on-bg); color: var(--lp-on-fg); }
.lp-cb.part { border-color: var(--lp-on-bg); color: var(--lp-on-bg); }
.lp .good { color: var(--lp-ok); } .lp .mid { color: var(--lp-gold-text); } .lp .low { color: var(--lp-bad); } .lp .new { color: var(--lp-faint); }
.lp-builder { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.lp-builder .lbl { font-size: 11px; color: var(--lp-muted); font-weight: 600; margin-bottom: 4px; }
.lp-seg { display: flex; border: 1px solid var(--lp-line); border-radius: 8px; overflow: hidden; }
.lp-seg span { flex: 1; text-align: center; padding: 5px 2px; font-size: 10.5px; font-weight: 700; color: var(--lp-muted); white-space: nowrap; }
.lp-seg span + span { border-left: 1px solid var(--lp-line); }
.lp-seg span.on { background: var(--lp-on-bg); color: var(--lp-on-fg); }
.lp-exam { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-radius: 8px; background: var(--lp-subtle); border: 1px solid var(--lp-line); font-weight: 700; font-size: 11.5px; }
.lp-tog { width: 28px; height: 16px; border-radius: 999px; background: var(--lp-line-2); position: relative; flex-shrink: 0; }
.lp-tog::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; }
.lp-start { text-align: center; padding: 9px; border-radius: 8px; background: var(--lp-gold); color: ${NAVY}; font-weight: 800; }

/* sections */
.lp-sec { padding-top: 64px; padding-bottom: 64px; border-top: 1px solid var(--lp-line); display: flex; flex-direction: column; gap: 32px; }
.lp-sec-head h2 { font-size: clamp(25px, 3vw, 32px); font-weight: 800; line-height: 1.15; }
.lp-sec-head p { color: var(--lp-muted); margin-top: 8px; max-width: 60ch; }
.lp-row { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 48px; align-items: start; }
.lp-row + .lp-row { padding-top: 32px; border-top: 1px solid var(--lp-line); }
.lp-row h3 { font-size: 20px; font-weight: 800; display: flex; align-items: center; gap: 9px; }
.lp-row h3 svg { color: var(--lp-icon); flex-shrink: 0; }
.lp-row p { color: var(--lp-muted); margin-top: 8px; }
.lp-row ul { margin: 16px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 14.5px; color: var(--lp-ink-2); }
.lp-row li { padding-left: 18px; position: relative; }
.lp-row li::before { content: ""; position: absolute; left: 2px; top: 0.62em; width: 6px; height: 6px; border-radius: 2px; background: var(--lp-line-2); }

/* the question card */
.lp-qtop { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--lp-line); font-size: 12.5px; color: var(--lp-muted); flex-wrap: wrap; }
.lp-qtop b { color: var(--lp-ink); }
.lp-qbody { padding: 18px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
.lp-qtext { font-size: 16.5px; font-weight: 700; margin-bottom: 4px; }
.lp-opt { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--lp-line); background: var(--lp-card); color: var(--lp-ink); font-size: 14.5px; font-weight: 600; cursor: pointer; }
.lp-opt:hover:not(:disabled) { border-color: var(--lp-line-2); }
.lp-opt:disabled { cursor: default; }
.lp-opt .k { width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--lp-line); display: grid; place-items: center; font-size: 11.5px; font-weight: 800; color: var(--lp-muted); flex-shrink: 0; }
.lp-opt .tag { margin-left: auto; font-size: 12px; font-weight: 700; }
.lp-opt[aria-pressed="true"] { border-color: var(--lp-ink); box-shadow: 0 0 0 1px var(--lp-ink); }
.lp-opt.right { border-color: var(--lp-ok); background: var(--lp-ok-bg); }
.lp-opt.right .k, .lp-opt.right .tag { border-color: var(--lp-ok); color: var(--lp-ok); }
.lp-opt.wrong { border-color: var(--lp-bad); background: var(--lp-bad-bg); }
.lp-opt.wrong .k, .lp-opt.wrong .tag { border-color: var(--lp-bad); color: var(--lp-bad); }
.lp-opt.dim { color: var(--lp-faint); }
.lp-sol { border-top: 1px solid var(--lp-line); padding-top: 12px; margin-top: 4px; font-size: 14px; color: var(--lp-ink-2); }
.lp-sol b { display: block; font-size: 13px; color: var(--lp-ink); margin-bottom: 2px; }
.lp-qact { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 4px; font-size: 13px; color: var(--lp-muted); }

/* Titan chat */
.lp-chat-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--lp-line); font-size: 12.5px; flex-wrap: wrap; }
.lp-chat-head .lp-seg { width: 120px; }
.lp-chat-head .s { margin-left: auto; color: var(--lp-muted); }
.lp-msgs { padding: 16px 14px; display: flex; flex-direction: column; gap: 12px; font-size: 14px; }
.lp-bubble { align-self: flex-end; max-width: 80%; background: var(--lp-subtle); border: 1px solid var(--lp-line); border-radius: 12px 12px 4px 12px; padding: 8px 12px; }
.lp-reply { max-width: 94%; color: var(--lp-ink-2); }
.lp-reply b { display: block; font-size: 12.5px; color: var(--lp-ink); margin-bottom: 2px; }
.lp-quick { display: flex; gap: 6px; flex-wrap: wrap; }
.lp-quick span { font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--lp-line); color: var(--lp-ink-2); }
.lp-composer { display: flex; align-items: center; gap: 8px; margin: 0 14px 14px; padding: 8px 10px; border: 1px solid var(--lp-line); border-radius: 10px; color: var(--lp-faint); font-size: 13px; }
.lp-composer span { width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--lp-line); display: grid; place-items: center; color: var(--lp-muted); flex-shrink: 0; }

/* Progress */
.lp-prog { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.lp-week { display: flex; gap: 28px; flex-wrap: wrap; }
.lp-week div { font-size: 12.5px; color: var(--lp-muted); }
.lp-week b { display: block; font-size: 24px; font-weight: 800; color: var(--lp-ink); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.3; }
.lp-week .up { color: var(--lp-ok); font-weight: 700; }
.lp-chart { width: 100%; height: auto; display: block; }
.lp-plan { border-top: 1px solid var(--lp-line); padding-top: 6px; }
.lp-plan div { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 13.5px; }
.lp-plan div + div { border-top: 1px solid var(--lp-line); }
.lp-plan span.t { flex: 1; min-width: 0; }
.lp-plan small { color: var(--lp-muted); font-size: 12px; white-space: nowrap; }

/* who it's for, subjects, pricing */
.lp-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.lp-aud { padding: 22px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.lp-aud h3 { font-size: 18px; font-weight: 800; }
.lp-aud p { color: var(--lp-muted); font-size: 14.5px; }
.lp-aud .lp-link { margin-top: 6px; font-size: 14.5px; }
.lp-subjects { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden; }
.lp-subject { display: flex; align-items: center; gap: 10px; padding: 13px 16px; border: none; border-bottom: 1px solid var(--lp-line); border-right: 1px solid var(--lp-line); margin: 0 -1px -1px 0; background: transparent; color: var(--lp-ink); font-size: 14px; font-weight: 700; text-align: left; cursor: pointer; min-width: 0; }
.lp-subject:hover { background: var(--lp-subtle); }
.lp-subject span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-prices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden; }
.lp-prices > div { padding: 22px; display: flex; flex-direction: column; gap: 4px; }
.lp-prices > div + div { border-left: 1px solid var(--lp-line); }
.lp-prices .nm { font-size: 13px; font-weight: 700; color: var(--lp-muted); }
.lp-prices .amt { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.25; }
.lp-prices .amt small { font-size: 14px; font-weight: 600; color: var(--lp-muted); letter-spacing: 0; }
.lp-prices p { font-size: 14px; color: var(--lp-muted); }
.lp-prices .pick { box-shadow: inset 0 2px 0 var(--lp-gold); }
.lp-end { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.lp-foot { border-top: 1px solid var(--lp-line); }
.lp-foot .lp-in { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; padding-top: 22px; padding-bottom: 22px; font-size: 12.5px; color: var(--lp-muted); }
.lp-foot-links { display: flex; gap: 18px; flex-wrap: wrap; }
.lp-foot-links button { border: none; background: none; padding: 0; font-size: 12.5px; color: var(--lp-muted); cursor: pointer; }
.lp-foot-links button:hover { color: var(--lp-ink); }
.lp-copy { margin-left: auto; }

@media (max-width: 960px) {
  .lp-hero { grid-template-columns: 1fr; gap: 36px; padding-top: 28px; }
  .lp-row { grid-template-columns: 1fr; gap: 18px; }
}
@media (max-width: 760px) {
  .lp-in { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .lp-nav-links, .lp-nav-signin { display: none; }
  .lp-menu-btn { display: grid; }
  .lp-app { grid-template-columns: 1fr; }
  .lp-sb { display: none; }
  .lp-pg { margin: 6px; grid-template-columns: 1fr; padding: 12px; }
  .lp-sec { padding-top: 48px; padding-bottom: 48px; }
  .lp-two, .lp-prices { grid-template-columns: 1fr; }
  .lp-subjects { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lp-prices > div + div { border-left: none; border-top: 1px solid var(--lp-line); }
  .lp-copy { margin-left: 0; }
}
@media (max-width: 420px) {
  .lp-subjects { grid-template-columns: 1fr; }
  .lp-nav-right .lp-btn.gold { padding: 0 11px; }
}
@media (prefers-reduced-motion: reduce) { .lp * { transition: none !important; } }
`

/* ─── previews of the app's screens ─────────────────────────────────────── */

const pctClass = (p) => (p === null ? 'new' : p >= 70 ? 'good' : p >= 50 ? 'mid' : 'low')

/** The Practice page: topic tree and session builder, inside the app shell. */
function PracticePreview() {
  const rows = [
    { kind: 'grp', num: '1', name: 'Number', cb: 'part', pct: 81 },
    { kind: 'sub', name: '1.1 Fractions', cb: 'on', pct: 62, sel: true },
    { kind: 'sub', name: '1.2 Percentages', cb: 'on', pct: 43, sel: true },
    { kind: 'sub', name: '1.3 Index laws', cb: null, pct: 88 },
    { kind: 'grp', num: '2', name: 'Algebra', cb: null, pct: 76 },
    { kind: 'sub', name: '2.1 Linear equations', cb: null, pct: null },
  ]
  const box = (state) => <span className={`lp-cb${state ? ` ${state}` : ''}`}>{state === 'on' ? '✓' : state === 'part' ? '−' : ''}</span>
  return (
    <div className="lp-app" role="img" aria-label="The Practice page: a list of topics with how many you've answered and your accuracy, and a session builder with a Start button.">
      <div className="lp-sb" aria-hidden="true">
        <div className="lp-sb-logo"><span style={{ color: '#fff' }}>grade</span><span style={{ color: '#f1be43' }}>farm.</span></div>
        <div className="lp-sbrow subj"><span>Year 9 Mathematics</span><ChevronDown size={13} /></div>
        <div className="lp-sbrow on"><SquareCheckBig size={15} />Practice</div>
        <div className="lp-sbrow"><GraduationCap size={15} />Learn</div>
        <div className="lp-sbrow"><ChartLine size={15} />Progress</div>
        <div className="lp-sb-acct" style={{ marginTop: 'auto' }}><b>Mia</b>Silver II · 1,240 XP</div>
      </div>
      <div className="lp-pg" aria-hidden="true">
        <div className="lp-pg-head">
          <div><h3>Practice</h3><small>6 topics · 412 questions</small></div>
          <small><b>38</b> answered this week · <b>74%</b> correct</small>
        </div>
        <div className="lp-card lp-tree">
          <div className="lp-trow top">{box('part')}<span className="nm">All topics</span><span className="cnt">146 answered</span></div>
          {rows.map(r => (
            <div key={r.name} className={`lp-trow ${r.kind}${r.sel ? ' sel' : ''}`}>
              {box(r.cb)}
              <span className="nm">{r.num && <span className="num">{r.num}</span>}{r.name}</span>
              <span className={`pct ${pctClass(r.pct)}`}>{r.pct === null ? 'New' : `${r.pct}%`}</span>
            </div>
          ))}
        </div>
        <div className="lp-card lp-builder">
          <div><div style={{ fontSize: 13, fontWeight: 800 }}>Your session</div><div style={{ fontSize: 11, color: 'var(--lp-muted)' }}>2 topics ticked</div></div>
          <div><div className="lbl">Questions</div><div className="lp-seg"><span>New</span><span className="on">Got wrong</span><span>Mixed</span></div></div>
          <div className="lp-exam">Exam mode<span className="lp-tog" /></div>
          <div className="lp-start">Start</div>
        </div>
      </div>
    </div>
  )
}

/** A question to answer: pick an option, then check it, as in the app. */
function QuestionDemo() {
  const options = ['36', '32', '24', '12']
  const correct = 0
  const [picked, setPicked] = useState(null)
  const [checked, setChecked] = useState(false)
  const reset = () => { setPicked(null); setChecked(false) }
  return (
    <div className="lp-card">
      <div className="lp-qtop"><span><b>Fractions</b> · Level 2</span><span>Sample question</span></div>
      <div className="lp-qbody">
        <div className="lp-qtext" id="lp-demo-q">What is ¾ of 48?</div>
        <div role="group" aria-labelledby="lp-demo-q" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {options.map((o, i) => {
            const state = !checked ? '' : i === correct ? 'right' : i === picked ? 'wrong' : 'dim'
            return (
              <button key={o} type="button" className={`lp-opt ${state}`} disabled={checked}
                aria-pressed={checked ? undefined : picked === i} onClick={() => setPicked(i)}>
                <span className="k">{String.fromCharCode(65 + i)}</span>{o}
                <span className="tag">{state === 'right' ? 'Answer' : state === 'wrong' ? 'Your answer' : ''}</span>
              </button>
            )
          })}
        </div>
        {checked && (
          <div className="lp-sol" role="status">
            <b>{picked === correct ? 'Correct' : 'Not quite'}</b>
            Find a quarter first: 48 ÷ 4 = 12. Three quarters is 3 × 12 = 36.
          </div>
        )}
        <div className="lp-qact">
          {checked
            ? <button type="button" className="lp-btn sm" onClick={reset}>Try again</button>
            : <button type="button" className="lp-btn sm gold" disabled={picked === null} onClick={() => setChecked(true)} style={{ opacity: picked === null ? 0.55 : 1, cursor: picked === null ? 'default' : 'pointer' }}>Check</button>}
          {!checked && <span>Pick an answer, then check it.</span>}
        </div>
      </div>
    </div>
  )
}

function ChatPreview() {
  return (
    <div className="lp-card" role="img" aria-label="A chat with Titan about dividing fractions, explained with a running example.">
      <div className="lp-chat-head" aria-hidden="true">
        <div className="lp-seg"><span className="on">Chat</span><span>Lesson</span></div>
        <span style={{ fontWeight: 800 }}>Dividing fractions</span>
        <span className="s">Explain with: Sport</span>
      </div>
      <div className="lp-msgs" aria-hidden="true">
        <div className="lp-bubble">I don't get why you flip the second fraction</div>
        <div className="lp-reply"><b>Titan</b>A 3 km run split into ½ km laps is 6 laps. Dividing by ½ asks how many halves fit in 3, and there are two in every kilometre. That's why 3 ÷ ½ is the same as 3 × 2.</div>
        <div className="lp-quick"><span>Show me another</span><span>I'm still stuck</span><span>Practise this topic</span></div>
      </div>
      <div className="lp-composer" aria-hidden="true"><span>+</span>Ask Titan about Year 9 Mathematics</div>
    </div>
  )
}

function ProgressPreview() {
  // Accuracy by week (line, 0–100%) over questions answered (bars), as on Progress.
  const acc = [52, 54, 50, 59, 60, 63, 68, 74]
  const qs = [14, 20, 9, 26, 22, 31, 27, 38]
  const x = (i) => 50 + i * 50
  const y = (p) => 100 - p * 0.9
  return (
    <div className="lp-card lp-prog" role="img" aria-label="Progress: 74% correct this week, up 6 points, with accuracy rising from 52% to 74% over 8 weeks and three items in this week's plan.">
      <div className="lp-week" aria-hidden="true">
        <div><b>74%</b>correct this week <span className="up">+6</span></div>
        <div><b>38</b>questions</div>
        <div><b>4</b>days active</div>
      </div>
      <svg className="lp-chart" viewBox="0 0 430 120" aria-hidden="true">
        {[100, 50, 0].map(p => (
          <g key={p}>
            <line x1="34" x2="425" y1={y(p)} y2={y(p)} stroke={p === 0 ? 'var(--lp-line-2)' : 'var(--lp-line)'} strokeWidth="1" />
            <text x="28" y={y(p) + 3.5} fontSize="10" textAnchor="end" fill="var(--lp-faint)">{p}%</text>
          </g>
        ))}
        {qs.map((q, i) => <rect key={i} x={x(i) - 11} y={100 - q * 0.6} width="22" height={q * 0.6} rx="3" fill={i === qs.length - 1 ? 'var(--lp-line-2)' : 'var(--lp-line)'} />)}
        <polyline fill="none" stroke="var(--lp-ink)" strokeWidth="2" strokeLinejoin="round" points={acc.map((p, i) => `${x(i)},${y(p)}`).join(' ')} />
        <circle cx={x(7)} cy={y(74)} r="4" fill="var(--lp-gold)" stroke="var(--lp-card)" strokeWidth="2" />
        <text x={x(7) + 9} y={y(74) - 6} fontSize="11" fontWeight="700" fill="var(--lp-ink)">74%</text>
        <text x={x(0)} y="116" fontSize="10" textAnchor="middle" fill="var(--lp-faint)">8 weeks ago</text>
        <text x={x(7)} y="116" fontSize="10" textAnchor="middle" fill="var(--lp-faint)">This week</text>
      </svg>
      <div className="lp-plan" aria-hidden="true">
        <div><span className="lp-cb" /><span className="t">Review 6 Fractions questions</span><small>Due tomorrow</small></div>
        <div><span className="lp-cb" /><span className="t">Finish lesson: Percentage change</span><small>Step 3 of 6</small></div>
        <div><span className="lp-cb on">✓</span><span className="t" style={{ color: 'var(--lp-muted)', textDecoration: 'line-through' }}>Practise Percentages</span><small>Done</small></div>
      </div>
    </div>
  )
}

/* ─── page ──────────────────────────────────────────────────────────────── */

export default function LandingPage({ theme = 'light', onToggleTheme, onSignIn }) {
  const navigate = useNavigate()
  const subjects = usePublicSubjects()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pricing, setPricing] = useState(null)
  useEffect(() => { getPlatformSettings('pricing').then(setPricing).catch(() => {}) }, [])
  const tiers = studentTiers(pricing?.student_tiers)
  const freeDaily = pricing?.free_daily_questions ?? 20
  const trialDays = Math.max(0, Math.floor(Number(pricing?.student_trial_days ?? 7)) || 0)
  const tutorPrices = (pricing?.tutor_plans ?? []).map(p => Number(p.price)).filter(n => n > 0)
  const tutorFrom = tutorPrices.length ? Math.min(...tutorPrices) : 29

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

  // "Start learning" goes to Pricing, where a student picks free or paid.
  const start = () => navigate('/pricing')
  const go = (id) => {
    setMenuOpen(false)
    if (id === 'pricing') { navigate('/pricing'); return }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }
  const NAV = [['how', 'How it works'], ['subjects', 'Subjects'], ['tutors', 'Tutors and parents'], ['pricing', 'Pricing']]

  return (
    <div className="lp" style={{ ...themeVars(theme), colorScheme: theme === 'dark' ? 'dark' : 'light' }}>
      <style>{`@font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }${CSS}`}</style>

      <nav className="lp-nav" data-scrolled={scrolled || menuOpen} aria-label="Main">
        <div className="lp-in">
          <Logo onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
          <div className="lp-nav-links">
            {NAV.map(([id, label]) => <button key={id} type="button" onClick={() => go(id)}>{label}</button>)}
          </div>
          <div className="lp-nav-right">
            <button type="button" className="lp-btn sm lp-nav-signin" onClick={onSignIn}>Sign in</button>
            <button type="button" className="lp-btn sm gold" onClick={start}>Start learning</button>
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
              {NAV.map(([id, label]) => <button key={id} type="button" onClick={() => go(id)}>{label}</button>)}
              <button type="button" onClick={() => { setMenuOpen(false); onSignIn() }}>Sign in</button>
            </div>
          </div>
        )}
      </nav>

      <main>
        <section className="lp-in lp-hero">
          <div>
            <h1>Practice that goes back to what you got wrong.</h1>
            <p className="lp-sub">gradefarm. records every answer. Each session leans on the topics you miss until you get them right, and when you've done every question on a topic, Titan writes new ones.</p>
            <div className="lp-ctas">
              <button type="button" className="lp-btn gold" onClick={start} style={{ minHeight: 46, padding: '0 22px', fontSize: 15 }}>Start learning</button>
              <button type="button" className="lp-link" onClick={() => go('how')}>See how it works</button>
            </div>
            <div className="lp-facts">
              <span><b>1 subject free</b>, {freeDaily} questions a day</span>
              <span>Australian Curriculum, SACE and VCE</span>
              <span>Primary to ATAR</span>
            </div>
          </div>
          <PracticePreview />
        </section>

        <section id="how" className="lp-in lp-sec" aria-labelledby="lp-how">
          <div className="lp-sec-head">
            <h2 id="lp-how">Three places to work</h2>
            <p>They're the three pages in the app's sidebar. Pick a subject, then move between them.</p>
          </div>

          <div className="lp-row">
            <div>
              <h3><SquareCheckBig size={19} aria-hidden="true" />Practice</h3>
              <p>Tick the topics you want, then choose new questions, the ones you got wrong, or a mix.</p>
              <ul>
                <li>Every question has a worked solution.</li>
                <li>Miss one and you're offered a few more like it straight away.</li>
                <li>Exam mode holds back the answers and runs a timer.</li>
                <li>When a topic runs out, new questions are written for it and checked before you see them.</li>
              </ul>
            </div>
            <QuestionDemo />
          </div>

          <div className="lp-row">
            <div>
              <h3><GraduationCap size={19} aria-hidden="true" />Learn with Titan</h3>
              <p>Ask Titan, the AI tutor, about anything in your subject. Choose what it explains with, like sport, cooking or games.</p>
              <ul>
                <li>Add a photo of a question or your class notes.</li>
                <li>Guided lessons: four key ideas, a worked example and three check questions.</li>
                <li>Chats and lessons are saved, so you can pick up on another device.</li>
              </ul>
            </div>
            <ChatPreview />
          </div>

          <div className="lp-row">
            <div>
              <h3><ChartLine size={19} aria-hidden="true" />Progress</h3>
              <p>See whether you're improving, what's coming up, and what to do this week.</p>
              <ul>
                <li>Accuracy by week, next to how many questions you answered.</li>
                <li>Questions you got wrong come back for review a few days later.</li>
                <li>Add your tests and exams to count down to them.</li>
              </ul>
            </div>
            <ProgressPreview />
          </div>
        </section>

        <section id="tutors" className="lp-in lp-sec" aria-labelledby="lp-who">
          <div className="lp-sec-head"><h2 id="lp-who">For tutors and parents</h2></div>
          <div className="lp-two">
            <div className="lp-card lp-aud">
              <h3>Tutors</h3>
              <p>Set work for a student or a class, see every answer they give, run lessons and message families. Plans from ${tutorFrom} a month.</p>
              <button type="button" className="lp-link" onClick={() => navigate('/auth/tutor')}>Apply as a tutor</button>
            </div>
            <div className="lp-card lp-aud">
              <h3>Parents of Year 6 students</h3>
              <p>Selective-entry prep in maths and English, a progress email every Sunday, and your sign-off before any AI feature turns on.</p>
              <button type="button" className="lp-link" onClick={() => navigate('/year-6')}>See Year 6 prep</button>
            </div>
          </div>
        </section>

        <section id="subjects" className="lp-in lp-sec" aria-labelledby="lp-subjects">
          <div className="lp-sec-head">
            <h2 id="lp-subjects">Subjects</h2>
            <p>Each one comes with Titan, and new questions when you run out. More are added through the year.</p>
          </div>
          {subjects === null ? (
            <div style={{ fontSize: 13.5, color: 'var(--lp-muted)' }}>Loading subjects…</div>
          ) : subjects.length === 0 ? (
            <div><button type="button" className="lp-link" onClick={onSignIn}>Sign in to see every subject</button></div>
          ) : (
            <div className="lp-card lp-subjects">
              {subjects.map(s => (
                <button key={s.id || s.name} type="button" className="lp-subject" onClick={start}>
                  <SubjectIconByName name={s.name} color="var(--lp-icon)" size={20} />
                  <span>{formatSubjectLabel({ name: s.name, stage: s.level })}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="lp-in lp-sec" aria-labelledby="lp-pricing">
          <div className="lp-sec-head"><h2 id="lp-pricing">Pricing</h2></div>
          <div className="lp-card lp-prices">
            <div><span className="nm">Free</span><span className="amt">$0</span><p>One subject, {freeDaily} questions a day.</p></div>
            <div className="pick">
              <span className="nm">Student</span>
              <span className="amt">${tiers[0]} <small>a week</small></span>
              <p>Every question, no daily cap.{trialDays > 0 ? ` ${trialDays} days free.` : ''} Extra subjects ${extraLadder(tiers)}.</p>
            </div>
            <div><span className="nm">Tutor</span><span className="amt">${tutorFrom} <small>a month and up</small></span><p>Your students, their results, lessons and messages.</p></div>
          </div>
          <div className="lp-end">
            <button type="button" className="lp-link" onClick={() => navigate('/pricing')}>See full pricing</button>
            <button type="button" className="lp-btn gold" onClick={start}>Start learning</button>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-in">
          <Logo />
          <div className="lp-foot-links">
            <button type="button" onClick={() => go('how')}>How it works</button>
            <button type="button" onClick={() => go('subjects')}>Subjects</button>
            <button type="button" onClick={() => navigate('/pricing')}>Pricing</button>
            <button type="button" onClick={() => navigate('/privacy')}>Privacy</button>
            <button type="button" onClick={() => navigate('/terms')}>Terms</button>
          </div>
          <span className="lp-copy">© 2026 Titanium Tutoring · Adelaide, SA</span>
        </div>
      </footer>
    </div>
  )
}
