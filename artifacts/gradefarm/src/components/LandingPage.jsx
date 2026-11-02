import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sun, Moon, Menu, X } from 'lucide-react'
import { getPlatformSettings } from '../lib/db'
import { usePublicSubjects } from '../lib/publicSubjects'
import { studentTiers, extraLadder } from '../lib/pricing'
import { THEMES } from '../lib/theme'
import { Logo } from './AuthLayout'

// The public homepage (/home).
//
// 1. "And?": what gradefarm. is, said one clause at a time. Each click adds a
//    part of the product to the sentence and shows it working beside it.
//    The hero fills the first screen. Everything below it is in the page but
//    hidden until the sentence is finished (remembered for the session), or a
//    nav link asks. The newest clause ends in pulsing dots until then.
// 2. "What's inside": a phone stays put while six short chapters scroll past,
//    and its screen changes to match. On phones each chapter shows its own
//    screen instead.
// 3. Subjects (the live VCE and SACE Year 11 and 12 list), questions people
//    ask, pricing (from platform settings), a last call to action and the
//    footer. The page speaks to Year 11 and 12 students; parents and tutors
//    have links in the footer.
//
// It uses the app's look and follows the saved light/dark theme. The screens
// are drawn from the real Practice, question, Learn and Progress pages with a
// sample student.

const FONT_B = "'Plus Jakarta Sans', 'Segoe UI', sans-serif"
const NAVY = '#0c1037'

// The app shell's window colour (shellColors in App.jsx).
const WINDOW = { light: { bg: '#eef0f7', icon: '#b07d0c' }, dark: { bg: '#111113', icon: '#e2b54c' } }

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
    '--lp-on-bg': dark ? t.text : NAVY, '--lp-on-fg': dark ? t.bg : '#ffffff',
    '--lp-sel-row': dark ? 'rgba(255,255,255,0.05)' : '#fdf6e1',
    // The field's squares: not tried, coming back, right once, in the bag.
    '--lp-sq0': dark ? '#2a2a30' : '#e3e6f0', '--lp-sq2': dark ? 'rgba(226,181,76,0.38)' : '#f7dc93', '--lp-sq3': dark ? '#e2b54c' : '#e0a91f',
    '--lp-faded': dark ? '#5d5d66' : '#a3a9c2',
    '--lp-float': dark ? '0 14px 36px rgba(0,0,0,0.5)' : '0 14px 36px rgba(12,16,55,0.12)',
  }
}

const CSS = `
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

/* 1 · And? */
/* The hero is the whole first screen; nothing below it shows until the sentence is finished. */
.lp-and { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); grid-template-areas: 'txt vis'; column-gap: 48px; align-items: center; align-content: center; padding-top: 32px; padding-bottom: 48px; min-height: calc(100vh - 63px); min-height: calc(100svh - 63px); }
.lp-and-txt { grid-area: txt; }
.lp-and-vis { grid-area: vis; }
.lp-and-s { font-size: var(--lp-and-size, clamp(32px, 4.3vw, 54px)); font-weight: 800; line-height: 1.12; letter-spacing: -0.035em; }
.lp-and-s span { transition: color 0.35s; }
.lp-and-s span.old { color: var(--lp-faded); }
/* The dots after an unfinished sentence: there's more, press And? */
.lp-dots { color: var(--lp-gold-text); animation: lpDots 1.6s ease-in-out infinite; }
@keyframes lpDots { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }
.lp-and-ctl { display: flex; gap: 16px; align-items: center; margin-top: 28px; flex-wrap: wrap; }
.lp-and-ctl .n { font-size: 13px; color: var(--lp-muted); font-variant-numeric: tabular-nums; }
.lp-and-vis { min-height: 380px; display: flex; flex-direction: column; justify-content: center; gap: 10px; animation: lpIn 0.3s ease; }
.lp-and-vis .cap { font-size: 12.5px; font-weight: 700; color: var(--lp-gold-text); }
@keyframes lpIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }

/* squares */
.lp-sq { display: block; border-radius: 9px; flex-shrink: 0; }
.lp-sq.s0 { background: var(--lp-sq0); }
.lp-sq.s1 { background: var(--lp-card); box-shadow: inset 0 0 0 2px var(--lp-ink); background-image: radial-gradient(circle, var(--lp-ink) 0 18%, transparent 21%); }
.lp-sq.s2 { background: var(--lp-sq2); }
.lp-sq.s3 { background: var(--lp-sq3); }
.lp-grow { display: flex; gap: 10px; align-items: flex-start; }
.lp-grow > div { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 64px; }
.lp-grow span { font-size: 12px; color: var(--lp-muted); text-align: center; line-height: 1.3; }
.lp-grow b { font-size: 12.5px; color: var(--lp-ink); }

/* question card */
.lp-q { padding: 18px; display: flex; flex-direction: column; gap: 9px; }
.lp-qt { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; color: var(--lp-muted); }
.lp-qt b { color: var(--lp-ink); }
.lp-stem { font-size: 17px; font-weight: 700; margin: 2px 0 4px; }
.lp-opt { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--lp-line); background: var(--lp-card); color: var(--lp-ink); font-size: 14.5px; font-weight: 600; cursor: pointer; }
.lp-opt:hover:not(:disabled) { border-color: var(--lp-line-2); }
.lp-opt:disabled { cursor: default; }
.lp-opt .k { width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--lp-line); display: grid; place-items: center; font-size: 11.5px; font-weight: 800; color: var(--lp-muted); flex-shrink: 0; }
.lp-opt .tg { margin-left: auto; font-size: 12px; font-weight: 700; }
.lp-opt[aria-pressed="true"] { border-color: var(--lp-ink); box-shadow: 0 0 0 1px var(--lp-ink); }
.lp-opt.r { border-color: var(--lp-ok); background: var(--lp-ok-bg); } .lp-opt.r .k, .lp-opt.r .tg { color: var(--lp-ok); border-color: var(--lp-ok); }
.lp-opt.w { border-color: var(--lp-bad); background: var(--lp-bad-bg); } .lp-opt.w .k, .lp-opt.w .tg { color: var(--lp-bad); border-color: var(--lp-bad); }
.lp-opt.d { color: var(--lp-faint); }
.lp-sol { border-top: 1px solid var(--lp-line); padding-top: 10px; font-size: 14px; color: var(--lp-ink-2); }
.lp-sol b { display: block; font-size: 12.5px; color: var(--lp-ink); }
.lp-qact { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--lp-muted); }

/* Titan */
.lp-ti-h { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--lp-line); font-size: 12.5px; flex-wrap: wrap; }
.lp-sw { display: inline-flex; border: 1px solid var(--lp-line); border-radius: 8px; overflow: hidden; }
.lp-sw button, .lp-sw span { border: none; background: transparent; font-size: 12px; font-weight: 700; color: var(--lp-muted); padding: 5px 10px; cursor: pointer; }
.lp-sw > * + * { border-left: 1px solid var(--lp-line) !important; }
.lp-sw [aria-pressed="true"], .lp-sw .on { background: var(--lp-on-bg); color: var(--lp-on-fg); }
.lp-ti-m { padding: 14px; display: flex; flex-direction: column; gap: 10px; font-size: 14px; }
.lp-me { align-self: flex-end; background: var(--lp-subtle); border: 1px solid var(--lp-line); border-radius: 12px 12px 4px 12px; padding: 8px 12px; max-width: 84%; }
.lp-re { color: var(--lp-ink-2); }
.lp-re b { display: block; font-size: 12.5px; color: var(--lp-ink); }

.lp-up { color: var(--lp-ok); font-weight: 700; }
.lp-pill { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--lp-sel-row); color: var(--lp-gold-text); white-space: nowrap; border: 1px solid var(--lp-line); }
.lp-ok { color: var(--lp-ok); font-weight: 700; } .lp-lo { color: var(--lp-bad); font-weight: 700; }

/* 2 · What's inside: the scrolling phone */
.lp-sec { padding-top: 72px; padding-bottom: 72px; border-top: 1px solid var(--lp-line); scroll-margin-top: 62px; }
.lp-sec-head h2 { font-size: clamp(27px, 3.3vw, 38px); font-weight: 800; line-height: 1.1; letter-spacing: -0.03em; }
.lp-sec-head p { color: var(--lp-muted); margin-top: 8px; max-width: 58ch; font-size: 16px; }
.lp-stk { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); gap: 64px; margin-top: 24px; }
.lp-ph-col { position: sticky; top: 90px; align-self: start; }
.lp-ph { background: #0c0d14; border-radius: 40px; padding: 10px; box-shadow: var(--lp-float), 0 0 0 1px var(--lp-line-2); width: 320px; max-width: 100%; }
.lp-ph-s { background: var(--lp-page); border-radius: 31px; height: 580px; overflow: hidden; padding: 30px 14px 14px; display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.lp-ph-s.anim { animation: lpIn 0.3s ease; }
.lp-ph-top { display: flex; justify-content: space-between; font-size: 11px; color: var(--lp-muted); font-weight: 700; }
.lp-ph-s h4 { margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -0.02em; }
.lp-chap { min-height: 62vh; display: flex; flex-direction: column; justify-content: center; gap: 10px; padding-block: 24px; opacity: 0.35; transition: opacity 0.3s; }
.lp-chap.on { opacity: 1; }
.lp-chap .k { font-size: 13px; font-weight: 800; color: var(--lp-gold-text); }
.lp-chap h3 { font-size: clamp(25px, 3vw, 36px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; }
.lp-chap p { color: var(--lp-muted); font-size: 16.5px; max-width: 46ch; }
.lp-chap .who { font-size: 12.5px; font-weight: 700; color: var(--lp-muted); }
.lp-chap-screen { display: none; }
.lp-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--lp-line); }
.lp-row:last-child { border-bottom: none; }
.lp-row > span:not(.lp-cb) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-row small { color: var(--lp-faint); font-size: 11.5px; white-space: nowrap; }
.lp-row b { font-size: 12px; font-variant-numeric: tabular-nums; }
.lp-row.sel { background: var(--lp-sel-row); }
.lp-cb { width: 14px; height: 14px; border-radius: 4px; border: 1.5px solid var(--lp-faint); flex-shrink: 0; display: inline-grid; place-items: center; font-size: 9px; font-weight: 800; line-height: 1; }
.lp-cb.on { background: var(--lp-on-bg); border-color: var(--lp-on-bg); color: var(--lp-on-fg); }
.lp-seg { display: flex; border: 1px solid var(--lp-line); border-radius: 8px; overflow: hidden; }
.lp-seg span { flex: 1; text-align: center; padding: 6px 2px; font-size: 11.5px; font-weight: 700; color: var(--lp-muted); white-space: nowrap; }
.lp-seg span + span { border-left: 1px solid var(--lp-line); }
.lp-seg span.on { background: var(--lp-on-bg); color: var(--lp-on-fg); }
.lp-goldbar { text-align: center; padding: 10px; border-radius: 10px; background: var(--lp-gold); color: ${NAVY}; font-weight: 800; }
.lp-chip { font-size: 12.5px; font-weight: 700; padding: 8px 10px; border-radius: 9px; border: 1px solid var(--lp-line); background: var(--lp-card); }
.lp-chip.r { border-color: var(--lp-ok); color: var(--lp-ok); background: var(--lp-ok-bg); }
.lp-chip.w { border-color: var(--lp-bad); color: var(--lp-bad); background: var(--lp-bad-bg); }
.lp-notif { background: ${NAVY}; color: #fff; border-radius: 16px; padding: 11px 12px; font-size: 12.5px; display: grid; grid-template-columns: 28px 1fr; gap: 10px; align-items: center; }
.lp-notif .ic { width: 28px; height: 28px; border-radius: 7px; background: #f1be43; color: ${NAVY}; display: grid; place-items: center; font-family: 'Sifonn Pro', sans-serif; font-size: 8px; }
.lp-notif b { display: block; font-size: 12px; }

/* 3 · questions, pricing, end, footer */
.lp-faq { margin-top: 22px; border-top: 1px solid var(--lp-line); }
.lp-faq details { border-bottom: 1px solid var(--lp-line); }
.lp-faq summary { cursor: pointer; padding: 17px 0; font-weight: 800; font-size: 16.5px; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
.lp-faq summary::-webkit-details-marker { display: none; }
.lp-faq summary::after { content: "+"; font-weight: 600; color: var(--lp-muted); }
.lp-faq details[open] summary::after { content: "−"; }
.lp-faq details p { padding: 0 0 17px; color: var(--lp-muted); max-width: 70ch; }
.lp-prices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: hidden; margin-top: 22px; }
.lp-subjs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 24px; }
.lp-subj { overflow: hidden; }
.lp-subj .hd { display: flex; align-items: baseline; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--lp-line); }
.lp-subj .hd b { font-size: 17px; }
.lp-subj .hd span { font-size: 13px; color: var(--lp-muted); }
.lp-subj-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 13px 18px; border: none; border-bottom: 1px solid var(--lp-line); background: transparent; color: var(--lp-ink); font-size: 15px; font-weight: 700; text-align: left; cursor: pointer; }
.lp-subj-row:last-child { border-bottom: none; }
.lp-subj-row:hover { background: var(--lp-subtle); }
.lp-subj-row span { flex: 1; min-width: 0; }
.lp-subj-row small { font-size: 13px; font-weight: 600; color: var(--lp-muted); white-space: nowrap; }
.lp-prices > div { padding: 22px; display: flex; flex-direction: column; gap: 4px; }
.lp-prices > div + div { border-left: 1px solid var(--lp-line); }
.lp-prices .nm { font-size: 13px; font-weight: 700; color: var(--lp-muted); }
.lp-prices .amt { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.25; }
.lp-prices .amt small { font-size: 14px; font-weight: 600; color: var(--lp-muted); letter-spacing: 0; }
.lp-prices p { font-size: 14px; color: var(--lp-muted); }
.lp-prices .pick { box-shadow: inset 0 3px 0 var(--lp-gold); }
.lp-end { display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
.lp-end h2 { font-size: clamp(26px, 3.2vw, 36px); font-weight: 800; letter-spacing: -0.03em; }
.lp-foot { border-top: 1px solid var(--lp-line); }
.lp-foot .lp-in { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; padding-top: 22px; padding-bottom: 22px; font-size: 12.5px; color: var(--lp-muted); }
.lp-foot-links { display: flex; gap: 18px; flex-wrap: wrap; }
.lp-foot-links button { border: none; background: none; padding: 0; font-size: 12.5px; color: var(--lp-muted); cursor: pointer; }
.lp-foot-links button:hover { color: var(--lp-ink); }
.lp-copy { margin-left: auto; }

@media (max-width: 960px) {
  .lp-and { grid-template-columns: 1fr; grid-template-areas: 'txt' 'vis'; row-gap: 24px; align-content: start; padding-top: 28px; }
  .lp-and-vis { min-height: 0; }
  .lp-stk { grid-template-columns: 1fr; gap: 0; }
  .lp-ph-col { display: none; }
  .lp-chap { min-height: 0; opacity: 1; padding-block: 28px; border-bottom: 1px solid var(--lp-line); }
  .lp-chap:last-child { border-bottom: none; }
  .lp-chap-screen { display: block; margin-top: 10px; max-width: 380px; }
  .lp-chap-screen .lp-ph-s { height: auto; border-radius: 16px; border: 1px solid var(--lp-line); padding: 14px; }
}
@media (max-width: 760px) {
  .lp-in { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .lp-nav-links, .lp-nav-signin { display: none; }
  .lp-menu-btn { display: grid; }
  .lp-sec { padding-top: 52px; padding-bottom: 52px; }
  .lp-prices, .lp-subjs { grid-template-columns: 1fr; }
  .lp-prices > div + div { border-left: none; border-top: 1px solid var(--lp-line); }
  .lp-copy { margin-left: 0; }
}
@media (prefers-reduced-motion: reduce) { .lp *, .lp *::before, .lp *::after { animation: none !important; transition: none !important; } }
`

/* ─── pieces of the app, with a sample student ─────────────────────────── */

// A Year 12 Methods question (VCE Units 3 & 4, SACE Stage 2) with the slip most people make.
const SAMPLE = { topic: 'Differential Calculus', level: 'Level 3', stem: 'Differentiate y = (2x − 5)³.', options: ['3(2x − 5)²', '6(2x − 5)²', '6x(2x − 5)²', '(2x − 5)²'], answer: 1, working: 'Chain rule: differentiate the outside, 3(2x − 5)², then multiply by the derivative of the inside, 2. So dy/dx = 6(2x − 5)².' }

/** Pick an answer, then check it, as on the question screen. */
function QuestionCard({ onResult }) {
  const q = SAMPLE
  const [picked, setPicked] = useState(null)
  const [checked, setChecked] = useState(false)
  const check = () => { setChecked(true); onResult?.(picked) }
  return (
    <div className="lp-card lp-q">
      <div className="lp-qt"><span><b>{q.topic}</b> · {q.level}</span><span>Try it</span></div>
      <div className="lp-stem" id="lp-q-stem">{q.stem}</div>
      <div role="group" aria-labelledby="lp-q-stem" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {q.options.map((o, i) => {
          const st = !checked ? '' : i === q.answer ? 'r' : i === picked ? 'w' : 'd'
          return (
            <button key={o} type="button" className={`lp-opt ${st}`} disabled={checked} aria-pressed={checked ? undefined : picked === i} onClick={() => setPicked(i)}>
              <span className="k">{'ABCD'[i]}</span>{o}<span className="tg">{st === 'r' ? 'Answer' : st === 'w' ? 'Your answer' : ''}</span>
            </button>
          )
        })}
      </div>
      {checked && <div className="lp-sol" role="status"><b>{picked === q.answer ? 'Correct' : 'Not quite'}</b>{q.working}</div>}
      <div className="lp-qact">
        {checked
          ? <button type="button" className="lp-btn sm" onClick={() => { setPicked(null); setChecked(false); onResult?.(null) }}>Try again</button>
          : <><button type="button" className="lp-btn sm gold" disabled={picked === null} onClick={check}>Check</button><span>Pick one, then check it.</span></>}
      </div>
    </div>
  )
}

const EXPLAIN = {
  Plain: 'It\'s a function inside a function. Differentiate the outside and leave the inside alone: 3(2x − 5)². Then multiply by the derivative of the inside, which is 2. So it\'s 6(2x − 5)².',
  Sport: 'Think relay. The outside function runs its leg, 3(2x − 5)², then hands the baton to the inside one, which runs 2. You multiply the legs: 6(2x − 5)².',
  Gaming: 'It\'s stacking multipliers. The outer power gives 3(2x − 5)², the inner one is ×2, and multipliers stack by multiplying: 6(2x − 5)².',
  Music: 'Speed up a track that\'s already sped up. The inside changes twice as fast as x, so every change on the outside happens twice as fast too: 3(2x − 5)² × 2 = 6(2x − 5)².',
}

function TitanCard() {
  const [style, setStyle] = useState('Sport')
  return (
    <div className="lp-card" style={{ overflow: 'hidden' }}>
      <div className="lp-ti-h">
        <b style={{ fontSize: 13 }}>Titan</b><span className="lp-muted">Chain rule</span>
        <span className="lp-sw" role="group" aria-label="Explain with" style={{ marginLeft: 'auto' }}>
          {Object.keys(EXPLAIN).map(k => <button key={k} type="button" aria-pressed={k === style} onClick={() => setStyle(k)}>{k}</button>)}
        </span>
      </div>
      <div className="lp-ti-m">
        <div className="lp-me">Why isn't it 3(2x − 5)²? I brought the power down.</div>
        <div className="lp-re" aria-live="polite"><b>Titan</b>{EXPLAIN[style]}</div>
      </div>
    </div>
  )
}

function Grow({ size = 48 }) {
  const steps = [['s1', 'Miss', ''], ['s2', '1 hour', 'later'], ['s2', '4 days', 'later'], ['s2', '3 weeks', 'later'], ['s3', 'Gold', 'in the bag']]
  return (
    <div className="lp-grow">
      {steps.map(([s, a, b], i) => <div key={i} style={{ width: size + 16 }}><span className={`lp-sq ${s}`} style={{ width: size, height: size }} /><b>{a}</b>{b && <span>{b}</span>}</div>)}
    </div>
  )
}

/* ─── 1 · And? ─────────────────────────────────────────────────────────── */

const CLAUSES = [
  'gradefarm. is VCE and SACE practice questions ',
  'that remember what you got wrong, ',
  'and bring each one back until you get it right. ',
  'When you\'re stuck, Titan explains it your way.',
]
// The sentence gets a little smaller as it grows, so every clause fits.
const SIZES = [54, 54, 50, 46]
const CAPTIONS = [
  'Year 12 Methods. Try this one.',
  'A wrong answer is planted',
  'It comes back until it turns gold',
  'Titan, the AI tutor',
]

function AndHero({ onStart, onDone, onSeeInside, done }) {
  // Someone who finished it earlier this session starts at the end.
  const [n, setN] = useState(done ? CLAUSES.length : 1)
  const [picked, setPicked] = useState(null)
  const last = n >= CLAUSES.length
  useEffect(() => { if (last) onDone() }, [last]) // eslint-disable-line react-hooks/exhaustive-deps
  const planted = picked === null
    ? 'Say you answered 3(2x − 5)². It\'s planted, and comes back in an hour.'
    : picked === SAMPLE.answer
      ? 'You got it right, so it skips planting: it comes back in 2 days to check it stuck.'
      : `You said ${SAMPLE.options[picked]}. It's planted, and comes back in an hour.`
  return (
    <section className="lp-in lp-and" aria-labelledby="lp-def">
      <div className="lp-and-txt">
        {/* The whole definition for screen readers and search; the sentence below builds it on screen. */}
        <h1 id="lp-def" className="lp-sr">{CLAUSES.join('')}</h1>
        <div className="lp-and-s" aria-hidden="true" style={{ '--lp-and-size': `clamp(28px, ${SIZES[n - 1] / 14.4}vw, ${SIZES[n - 1]}px)` }}>
          {CLAUSES.slice(0, n).map((c, i) => (i === n - 1 && !last
            // The newest clause ends in dots until the sentence is finished.
            ? <span key={i}>{c.replace(/[\s.,]+$/, '')}<span className="lp-dots">…</span></span>
            : <span key={i} className={i < n - 1 ? 'old' : ''}>{c}</span>))}
        </div>
        <div className="lp-and-ctl">
          {last
            ? <><button type="button" className="lp-btn gold lg" onClick={onStart}>Start free</button><button type="button" className="lp-btn lg" onClick={onSeeInside}>See what's inside ↓</button></>
            : <button type="button" className="lp-btn gold lg" onClick={() => setN(n + 1)} aria-label="And? Show the next part">And?</button>}
          <span className="n" aria-live="polite">{n} of {CLAUSES.length}</span>
          {last && <button type="button" className="lp-link" onClick={() => setN(1)}>Start again</button>}
          {!last && n > 1 && <button type="button" className="lp-link" onClick={() => setN(CLAUSES.length)}>Show it all</button>}
        </div>
      </div>
      <div className="lp-and-vis" key={n} aria-live="polite">
        <span className="cap">{CAPTIONS[n - 1]}</span>
        {n === 1 && <QuestionCard onResult={setPicked} />}
        {n === 2 && <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}><span className={`lp-sq ${picked === SAMPLE.answer ? 's2' : 's1'}`} style={{ width: 72, height: 72 }} /><p style={{ fontSize: 16, color: 'var(--lp-ink-2)', maxWidth: '32ch' }}>{planted}</p></div>}
        {n === 3 && <><Grow /><p className="lp-muted" style={{ fontSize: 15, maxWidth: '40ch', marginTop: 6 }}>Each time you get it right, the gap gets longer. Right every time, and it turns gold.</p></>}
        {n === 4 && <TitanCard />}
      </div>
    </section>
  )
}

/* ─── 2 · What's inside: the scrolling phone ───────────────────────────── */

const CHAPTERS = [
  ['Practice', 'Questions on the topics you\'re doing.', 'Tick what you\'re on this term, then choose new questions, the ones you got wrong, or a mix. Every question is mapped to your VCE study design or SACE subject outline.'],
  ['Worked solutions', 'Every question shows the working.', 'Not just the answer: the steps, and the slip most people make, so you know exactly where it went wrong.'],
  ['Titan', 'Stuck at 11 pm? Ask Titan.', 'The AI tutor explains it again, as many times as you need, plainly or with sport, gaming or music. Add a photo of a question or your class notes, or take a guided lesson on a whole topic.'],
  ['Comes back', 'Get it wrong and it comes back.', 'Every session starts with the questions that are due back: an hour after a miss, then a few days later, then weeks later, until you get it right every time. When a topic runs out, new questions are written for it.'],
  ['Progress', 'See yourself improving.', 'Accuracy by week, your next SAC, test or exam counting down, and a plan for this week: the reviews that are due, lessons in progress and your weakest topics.'],
  ['Exam mode', 'Practise under exam conditions.', 'Pick how many questions and a time limit. Answers stay hidden until you finish, then every question shows the working, and the ones you missed come back like any other.'],
]

function PhoneScreen({ i }) {
  if (i === 0) return (
    <>
      <div className="lp-ph-top"><span>9:41</span><span>Methods · Stage 2</span></div>
      <h4>Practice</h4>
      <div className="lp-card" style={{ padding: '4px 0' }}>
        {[['Differential Calculus', '84%', 'var(--lp-ok)', true], ['Discrete Random Variables', '58%', 'var(--lp-gold-text)', true], ['Integration', '91%', 'var(--lp-ok)', false], ['Continuous Random Variables', '49%', 'var(--lp-bad)', false], ['Sampling and Confidence Intervals', 'New', 'var(--lp-faint)', false]].map(([n, p, c, on]) => (
          <div key={n} className={`lp-row${on ? ' sel' : ''}`}><span className={`lp-cb${on ? ' on' : ''}`}>{on ? '✓' : ''}</span><span>{n}</span><b style={{ color: c }}>{p}</b></div>
        ))}
      </div>
      <div className="lp-seg"><span>New</span><span className="on">Got wrong · 14</span><span>Mixed</span></div>
      <div className="lp-goldbar" style={{ marginTop: 'auto' }}>Start</div>
    </>
  )
  if (i === 1) return (
    <>
      <div className="lp-ph-top"><span>9:43</span><span>Question 3 of 14</span></div>
      <b style={{ fontSize: 15.5 }}>{SAMPLE.stem}</b>
      <span className="lp-chip w">A · 3(2x − 5)² · Your answer</span>
      <span className="lp-chip r">B · 6(2x − 5)² · Answer</span>
      <span className="lp-chip">C · 6x(2x − 5)²</span>
      <div style={{ borderTop: '1px solid var(--lp-line)', paddingTop: 8, color: 'var(--lp-ink-2)' }}><b style={{ color: 'var(--lp-ink)' }}>Worked solution</b><br />Differentiate the outside: 3(2x − 5)². Multiply by the inside's derivative, 2: 6(2x − 5)².<br /><span className="lp-muted" style={{ fontSize: 12 }}>Common slip: forgetting the ×2 from the inside.</span></div>
      <div className="lp-goldbar" style={{ marginTop: 'auto' }}>Practise 3 like this</div>
    </>
  )
  if (i === 2) return (
    <>
      <div className="lp-ph-top"><span>11:04 pm</span><span>Learn</span></div>
      <div className="lp-seg"><span>Plain</span><span className="on">Sport</span><span>Gaming</span><span>Music</span></div>
      <div className="lp-me">Why isn't it 3(2x − 5)²?</div>
      <div className="lp-re"><b>Titan</b>{EXPLAIN.Sport}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}><span className="lp-chip">Show me another</span><span className="lp-chip">I'm still stuck</span></div>
    </>
  )
  if (i === 3) return (
    <>
      <div className="lp-ph-top"><span>Next session</span><span>Methods</span></div>
      <div className="lp-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b style={{ fontSize: 13 }}>Your session</b>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--lp-gold-text)' }}>3 questions due back for review come first</span>
        <div className="lp-goldbar">Start</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}><b>Differential Calculus</b><span className="lp-pill">Due back</span></div>
      <b style={{ fontSize: 14.5 }}>{SAMPLE.stem}</b>
      <div style={{ marginTop: 6 }}><Grow size={34} /></div>
      <span className="lp-muted" style={{ fontSize: 12.5 }}>Right again? Next time it's in 4 days.</span>
    </>
  )
  if (i === 4) return (
    <>
      <div className="lp-ph-top"><span>Sun</span><span>Progress</span></div>
      <h4>This week</h4>
      <div style={{ display: 'flex', gap: 20 }}>
        <div><b style={{ fontSize: 24 }}>74%</b><br /><span className="lp-muted" style={{ fontSize: 12 }}>correct <span className="lp-up">+8</span></span></div>
        <div><b style={{ fontSize: 24 }}>61</b><br /><span className="lp-muted" style={{ fontSize: 12 }}>questions</span></div>
      </div>
      <div className="lp-card" style={{ padding: '4px 0' }}><div className="lp-row"><b style={{ fontSize: 12.5 }}>Coming up</b><span>Methods test</span><small>12 days</small></div></div>
      <div className="lp-card" style={{ padding: '4px 0' }}>
        <div className="lp-row"><span className="lp-cb" /><span>Review 6 differentiation questions</span><small>Tomorrow</small></div>
        <div className="lp-row"><span className="lp-cb" /><span>Lesson: The chain rule</span><small>Step 3 of 6</small></div>
        <div className="lp-row"><span className="lp-cb on">✓</span><span>Practise integration</span><small>Done</small></div>
      </div>
    </>
  )
  return (
    <>
      <div className="lp-ph-top"><span>Exam · 18:42 left</span><span>Question 7 of 20</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
        {Array.from({ length: 20 }, (_, k) => (
          <span key={k} style={{ aspectRatio: '1', borderRadius: 5, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800,
            background: k < 6 ? 'var(--lp-on-bg)' : 'var(--lp-card)', color: k < 6 ? 'var(--lp-on-fg)' : 'var(--lp-muted)',
            border: `1.5px solid ${k === 6 ? 'var(--lp-ink)' : k === 3 ? 'var(--lp-gold)' : 'var(--lp-line)'}` }}>{k + 1}</span>
        ))}
      </div>
      <b style={{ fontSize: 14.5 }}>X is normally distributed with mean 50 and standard deviation 4. Find Pr(X &gt; 56), correct to three decimal places.</b>
      <span className="lp-chip">A · 0.067</span>
      <span className="lp-chip">B · 0.933</span>
      <span className="lp-chip">C · 0.159</span>
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}><span className="lp-chip" style={{ flex: 1, textAlign: 'center' }}>Flag for review</span><span className="lp-goldbar" style={{ flex: 1, padding: 8 }}>Next</span></div>
    </>
  )
}

function Inside() {
  const [active, setActive] = useState(0)
  const refs = useRef([])
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive(Number(e.target.dataset.i)) })
    }, { rootMargin: '-45% 0px -45% 0px' })
    refs.current.forEach(el => el && obs.observe(el))
    return () => obs.disconnect()
  }, [])
  return (
    <section id="how" className="lp-in lp-sec" aria-labelledby="lp-inside">
      <div className="lp-sec-head">
        <h2 id="lp-inside">What's inside, one screen at a time</h2>
        <p>Everything you need for Year 11 and 12, in one app.</p>
      </div>
      <div className="lp-stk">
        <div className="lp-ph-col" aria-hidden="true"><div className="lp-ph"><div className="lp-ph-s anim" key={active}><PhoneScreen i={active} /></div></div></div>
        <div>
          {CHAPTERS.map(([k, h, p], i) => (
            <div key={k} ref={el => { refs.current[i] = el }} data-i={i} className={`lp-chap${active === i ? ' on' : ''}`}>
              <span className="k">{k}</span>
              <h3>{h}</h3>
              <p>{p}</p>
              <div className="lp-chap-screen" aria-hidden="true"><div className="lp-ph-s"><PhoneScreen i={i} /></div></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── 3 · Subjects ─────────────────────────────────────────────────────── */

// Used until the live list loads, or if it can't be reached.
const FALLBACK_SUBJECTS = {
  vce: [['Mathematical Methods', 'Units 1 & 2'], ['Mathematical Methods', 'Units 3 & 4'], ['Chemistry', 'Units 3 & 4'], ['Biology', 'Units 3 & 4'], ['Physics', 'Units 3 & 4']],
  sace: [['Mathematical Methods', 'Stage 2'], ['Chemistry', 'Stage 1'], ['Chemistry', 'Stage 2']],
}

/** The live Year 11 and 12 subjects, split into VCE and SACE, as [name, level] pairs. */
function seniorSubjects(list) {
  const vce = [], sace = []
  for (const s of list || []) {
    const name = String(s.name || '')
    const level = String(s.level || '')
    if (/^VCE\s/i.test(name)) {
      const units = /units?\s*1\s*(and|&)\s*2/i.test(name) ? 'Units 1 & 2' : (level.match(/units?\s*\d\s*(and|&)\s*\d/i)?.[0].replace(/\s*and\s*/i, ' & ') || level)
      vce.push([name.replace(/^VCE\s+/i, '').replace(/\s*Units?\s*\d\s*(and|&)\s*\d\s*$/i, ''), units])
    } else if (/^stage\s*[12]$/i.test(level)) {
      sace.push([name.replace(/\s*Stage\s*[12]\s*$/i, ''), level.replace(/^stage/i, 'Stage')])
    }
  }
  const sort = (a) => a.sort((x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]))
  return vce.length + sace.length ? { vce: sort(vce), sace: sort(sace) } : FALLBACK_SUBJECTS
}

function Subjects({ onPick }) {
  const live = usePublicSubjects()
  const { vce, sace } = seniorSubjects(live)
  const col = (title, note, rows) => (
    <div className="lp-card lp-subj">
      <div className="hd"><b>{title}</b><span>{note}</span></div>
      {rows.map(([n, l]) => (
        <button key={n + l} type="button" className="lp-subj-row" onClick={onPick}><span>{n}</span><small>{l}</small></button>
      ))}
    </div>
  )
  return (
    <section id="subjects" className="lp-in lp-sec" aria-labelledby="lp-subjects">
      <div className="lp-sec-head">
        <h2 id="lp-subjects">Subjects</h2>
        <p>For Year 11 and 12 in Victoria and South Australia. More are being added, and every subject gets new questions as you practise.</p>
      </div>
      <div className="lp-subjs">
        {col('VCE', 'Victoria', vce)}
        {col('SACE', 'South Australia', sace)}
      </div>
    </section>
  )
}

/* ─── page ─────────────────────────────────────────────────────────────── */

export default function LandingPage({ theme = 'light', onToggleTheme, onSignIn }) {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pricing, setPricing] = useState(null)
  // The rest of the page appears once the hero's sentence is finished (or a nav link asks for it).
  const [done, setDone] = useState(() => { try { return sessionStorage.getItem('gf-home-seen') === '1' } catch { return false } })
  const finish = () => { setDone(true); try { sessionStorage.setItem('gf-home-seen', '1') } catch {} }
  useEffect(() => { getPlatformSettings('pricing').then(setPricing).catch(() => {}) }, [])
  const tiers = studentTiers(pricing?.student_tiers)
  const freeDaily = pricing?.free_daily_questions ?? 20
  const trialDays = Math.max(0, Math.floor(Number(pricing?.student_trial_days ?? 7)) || 0)

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

  // Starting goes to Pricing, where a student picks free or paid.
  const start = () => navigate('/pricing')
  const go = (id) => {
    setMenuOpen(false)
    if (id === 'pricing') return navigate('/pricing')
    if (id === 'tutors') return navigate('/auth/tutor')
    if (id === 'year6') return navigate('/year-6')
    finish()
    // Wait a frame so the sections exist before scrolling to them.
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })))
  }
  const NAV = [['how', 'How it works'], ['subjects', 'Subjects'], ['questions', 'Questions'], ['pricing', 'Pricing']]

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
            <button type="button" className="lp-btn sm gold" onClick={start}>Start free</button>
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
        <AndHero onStart={start} onDone={finish} onSeeInside={() => go('how')} done={done} />
        {/* In the page for search engines, but invisible until the hero is finished. */}
        <div hidden={!done}>
        <Inside />

        <Subjects onPick={start} />

        <section id="questions" className="lp-in lp-sec" aria-labelledby="lp-faq">
          <div className="lp-sec-head"><h2 id="lp-faq">Questions people ask</h2></div>
          <div className="lp-faq">
            <details open><summary>How is this different from past papers?</summary><p>A past paper is the same questions every time, and once you've seen the answers you're memorising, not learning. gradefarm. remembers which questions you got wrong, brings each one back until you can do it, and writes new ones when you run out.</p></details>
            <details><summary>Does it follow my course?</summary><p>Yes. VCE subjects follow the VCAA study design and SACE subjects follow the SACE subject outline, and every question is mapped to a topic in it, so nothing is off the course.</p></details>
            <details><summary>Is it actually free?</summary><p>One subject is free, {freeDaily} questions a day, with no card. Every question with no daily cap is ${tiers[0]} a week{trialDays > 0 ? `, and the first ${trialDays} days are free` : ''}.</p></details>
            <details><summary>What's Titan?</summary><p>The AI tutor. Ask it about any question or topic, any time, and it explains it plainly or with sport, gaming or music. You can add a photo of a question or your class notes, or take a guided lesson on a whole topic.</p></details>
            <details><summary>Can I practise under exam conditions?</summary><p>Yes. Exam mode sets a number of questions and a time limit and holds the answers back until you finish. Then you get every question with its working, and the ones you missed come back later.</p></details>
            <details><summary>Does it work on my phone?</summary><p>Yes. It's a website, so it works on your phone, laptop or school computer with nothing to install, and your progress follows you.</p></details>
          </div>
        </section>

        <section className="lp-in lp-sec" aria-labelledby="lp-pricing">
          <div className="lp-sec-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
            <h2 id="lp-pricing">Pricing</h2>
            <button type="button" className="lp-link" onClick={() => navigate('/pricing')}>See full pricing</button>
          </div>
          <div className="lp-card lp-prices">
            <div><span className="nm">Free</span><span className="amt">$0</span><p>One subject, {freeDaily} questions a day. No card.</p></div>
            <div className="pick">
              <span className="nm">Student</span>
              <span className="amt">${tiers[0]} <small>a week</small></span>
              <p>Every question, no daily cap.{trialDays > 0 ? ` ${trialDays} days free.` : ''} Extra subjects ${extraLadder(tiers)}.</p>
            </div>
          </div>
        </section>

        <section className="lp-in lp-sec">
          <div className="lp-end">
            <h2>Start with one subject, free.</h2>
            <button type="button" className="lp-btn gold lg" onClick={start}>Start free</button>
          </div>
        </section>
        </div>
      </main>

      <footer className="lp-foot" hidden={!done}>
        <div className="lp-in">
          <Logo />
          <div className="lp-foot-links">
            <button type="button" onClick={() => go('how')}>How it works</button>
            <button type="button" onClick={() => go('subjects')}>Subjects</button>
            <button type="button" onClick={() => navigate('/pricing')}>Pricing</button>
            <button type="button" onClick={() => navigate('/privacy')}>Privacy</button>
            <button type="button" onClick={() => navigate('/terms')}>Terms</button>
            <button type="button" onClick={() => navigate('/auth/tutor')}>For tutors</button>
            <button type="button" onClick={() => navigate('/year-6')}>Year 6 selective</button>
          </div>
          <span className="lp-copy">© 2026 Titanium Tutoring · Adelaide, SA</span>
        </div>
      </footer>
    </div>
  )
}
