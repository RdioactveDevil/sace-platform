import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getPlatformSettings } from '../lib/db'
import { usePublicSubjects } from '../lib/publicSubjects'
import { SUBJECT_GROUPS as GROUPS, groupSubjects } from '../lib/homeSubjects'
import { studentTiers, extraLadder } from '../lib/pricing'
import { SITE_CSS, SITE_FONTS, NAVY, themeVars, Brand, SiteNav, SiteFooter, siteFooterLinks } from './SiteChrome'
import MathText from './MathText'

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
// 3. Subjects (built from the live subject list, so it follows Admin), questions people
//    ask, pricing (from platform settings), a last call to action and the
//    footer. The page speaks to Year 11 and 12 students; parents and tutors
//    have links in the footer.
//
// It uses the app's look and follows the saved light/dark theme. The screens
// are drawn from the real Practice, question, Learn and Progress pages with a
// sample student.

const FONT_B = "'Plus Jakarta Sans', 'Segoe UI', sans-serif"

const CSS = `${SITE_CSS}



/* 1 · And? */
/* The hero is the whole first screen; nothing below it shows until the sentence is finished. */
.lp-and { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); grid-template-areas: 'txt vis'; column-gap: 48px; align-items: center; align-content: center; padding-top: 32px; padding-bottom: 48px; min-height: calc(100vh - 63px); min-height: calc(100svh - 63px); }
.lp-and-txt { grid-area: txt; }
.lp-and-vis { grid-area: vis; }
.lp-and-s { font-size: var(--lp-and-size, clamp(32px, 4.3vw, 54px)); font-weight: 800; line-height: 1.12; letter-spacing: -0.035em; }
/* Each clause starts on its own line, so the sentence builds as a short list rather than one block. */
.lp-and-s > span { display: block; transition: color 0.35s; }
.lp-and-s > span + span { margin-top: 0.3em; }
.lp-and-s span.old { color: var(--lp-faded); }
/* The dots after an unfinished sentence: there's more, press And? */
.lp-dots { color: var(--lp-gold-text); animation: lpDots 1.6s ease-in-out infinite; }
@keyframes lpDots { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }
.lp-and-ctl { display: flex; gap: 16px; align-items: center; margin-top: 28px; flex-wrap: wrap; }
.lp-and-ctl .n { font-size: 13px; color: var(--lp-muted); font-variant-numeric: tabular-nums; }
.lp-and-vis { min-height: 380px; display: flex; flex-direction: column; justify-content: center; gap: 10px; animation: lpIn 0.3s ease; }
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
/* Hand-drawn hints: "Try this question!" over the sample question, then "Now click And?" */
.lp-q-wrap { position: relative; margin-top: 60px; }
.lp-hint { font-family: 'Caveat', 'Segoe Print', cursive; font-weight: 700; font-size: clamp(30px, 2.9vw, 38px); line-height: 1; color: var(--lp-gold-text); white-space: nowrap; animation: lpIn 0.4s ease; }
.lp-hint-layer { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
.lp-hint-top { position: absolute; right: 44px; top: -54px; transform: rotate(-3deg); }
.lp-hint-svg { position: absolute; left: 0; top: 0; overflow: visible; }
.lp-hint-inline { display: inline-flex; align-items: center; gap: 8px; transform: rotate(-2deg); }
/* The dots run along each arrow towards what it points at, and the small arrow nudges towards And?. */
.lp-hint-flow { animation: lpFlow 0.9s linear infinite; }
@keyframes lpFlow { to { stroke-dashoffset: -9; } }
.lp-hint-inline svg { animation: lpNudge 1.3s ease-in-out infinite; }
@keyframes lpNudge { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-6px); } }
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
.lp-ti-m { padding: 14px; display: flex; flex-direction: column; gap: 10px; font-size: 14px; }
.lp-me { align-self: flex-end; background: var(--lp-subtle); border: 1px solid var(--lp-line); border-radius: 12px 12px 4px 12px; padding: 8px 12px; max-width: 84%; }
.lp-re { color: var(--lp-ink-2); }
.lp-re b { display: block; font-size: 12.5px; color: var(--lp-ink); }

.lp-up { color: var(--lp-ok); font-weight: 700; }
.lp-pill { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--lp-sel-row); color: var(--lp-gold-text); white-space: nowrap; border: 1px solid var(--lp-line); }
.lp-ok { color: var(--lp-ok); font-weight: 700; } .lp-lo { color: var(--lp-bad); font-weight: 700; }

/* 2 · What's inside: the scrolling phone */
.lp-stk { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); gap: 64px; margin-top: 24px; }
.lp-ph-col { position: sticky; top: 90px; align-self: start; }
.lp-ph { background: #0c0d14; border-radius: 40px; padding: 10px; box-shadow: var(--lp-float), 0 0 0 1px var(--lp-line-2); width: 320px; max-width: 100%; }
.lp-ph-s { background: var(--lp-page); border-radius: 31px; height: 580px; overflow: hidden; padding: 30px 14px 14px; display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.lp-ph-s.anim { animation: lpIn 0.3s ease; }
.lp-ph-top { display: flex; justify-content: space-between; font-size: 11px; color: var(--lp-muted); font-weight: 700; }
.lp-ph-s h4 { margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -0.02em; }
.lp-chap { min-height: 62vh; display: flex; flex-direction: column; justify-content: center; gap: 10px; padding-block: 24px; opacity: 0.35; transition: opacity 0.3s; }
.lp-chap.on { opacity: 1; }
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
.lp-prices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: hidden; margin-top: 22px; }
.lp-subjs { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 24px; align-items: start; }
.lp-subj { overflow: hidden; }
.lp-cmp { overflow-x: auto; margin-top: 24px; }
.lp-cmp table { width: 100%; border-collapse: collapse; min-width: 640px; font-size: 14.5px; }
.lp-cmp th, .lp-cmp td { text-align: left; padding: 13px 18px; border-bottom: 1px solid var(--lp-line); vertical-align: top; }
.lp-cmp thead th { font-size: 13px; color: var(--lp-muted); font-weight: 700; }
.lp-cmp tbody tr:last-child th, .lp-cmp tbody tr:last-child td { border-bottom: none; }
.lp-cmp tbody th { font-weight: 700; color: var(--lp-ink); }
.lp-cmp td { color: var(--lp-ink-2); }
.lp-cmp td.no { color: var(--lp-faint); }
.lp-cmp .gf { background: var(--lp-sel-row); color: var(--lp-ink); font-weight: 700; }
.lp-cmp thead .gf { color: var(--lp-ink); }
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
.lp-end { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 20px; }
.lp-end h2 { font-size: clamp(27px, 3.6vw, 40px); font-weight: 800; letter-spacing: -0.03em; }

/* How it works: the forgetting curve */
.lp-why h2 { text-align: center; font-size: clamp(26px, 4vw, 44px); font-weight: 800; line-height: 1.1; letter-spacing: -0.03em; white-space: nowrap; margin-bottom: 36px; }
.lp-why-body { display: grid; grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr); gap: 48px; align-items: center; }
.lp-why-lead { color: var(--lp-ink-2); font-size: 16.5px; max-width: 48ch; }
.lp-why-pts { display: flex; flex-direction: column; gap: 12px; margin-top: 22px; }
.lp-why-pts div { padding-left: 14px; border-left: 3px solid var(--lp-sq3); }
.lp-why-pts b { display: block; font-size: 15px; }
.lp-why-pts span { font-size: 14.5px; color: var(--lp-muted); }
.lp-why-src { font-size: 12.5px; color: var(--lp-faint); margin-top: 18px !important; }
.lp-curve { padding: 16px 16px 12px; min-width: 0; }
.lp-curve-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
.lp-curve-key { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--lp-muted); }
.lp-curve-key i { display: inline-block; width: 22px; height: 0; border-top: 3px solid var(--lp-sq3); margin-left: 6px; }
.lp-curve-key i.cram { border-top: 3px dashed var(--lp-faint); }
.lp-curve svg { display: block; width: 100%; height: auto; }
.lp-curve .lbl { font-size: 12px; fill: var(--lp-muted); font-family: ${FONT_B}; }
.lp-curve .lbl.strong { fill: var(--lp-ink); font-weight: 700; }
.lp-curve-note { font-size: 12px; color: var(--lp-faint); margin-top: 4px !important; }

@media (max-width: 960px) {
  .lp-why-body { grid-template-columns: 1fr; gap: 24px; }
  .lp-why h2 { white-space: normal; margin-bottom: 20px; }
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
  .lp-prices { grid-template-columns: 1fr; }
  .lp-prices > div + div { border-left: none; border-top: 1px solid var(--lp-line); }
  .lp-copy { margin-left: 0; }
}
@media (prefers-reduced-motion: reduce) { .lp *, .lp *::before, .lp *::after { animation: none !important; transition: none !important; } }
`

/* ─── pieces of the app, with a sample student ─────────────────────────── */

// A Year 11 Methods question (VCE Units 1 & 2, Further differentiation) with the slip most people make.
// Maths is written in LaTeX between $…$ and drawn with KaTeX (MathText).
const SAMPLE = { topic: 'Further differentiation', level: 'Level 3', stem: 'Differentiate $y = (2x - 5)^3$.', options: ['$3(2x-5)^2$', '$6(2x-5)^2$', '$6x(2x-5)^2$', '$(2x-5)^2$'], answer: 1, working: 'Chain rule: differentiate the outside, $3(2x-5)^2$, then multiply by the derivative of the inside, $2$. So $\\frac{dy}{dx} = 6(2x-5)^2$.' }

/** A dotted, hand-drawn arrow ending at (x2, y2), with a head pointing along its last stretch. */
function HintArrow({ d, x2, y2, fromX, fromY }) {
  const a = Math.atan2(y2 - fromY, x2 - fromX), L = 15
  const head = [a + Math.PI - 0.5, a + Math.PI + 0.5].map(t => `M${x2},${y2} l${(Math.cos(t) * L).toFixed(1)},${(Math.sin(t) * L).toFixed(1)}`).join(' ')
  return (
    <>
      <path className="lp-hint-flow" d={d} fill="none" stroke="var(--lp-gold-text)" strokeWidth="3.5" strokeDasharray="1 8" strokeLinecap="round" />
      <path d={head} fill="none" stroke="var(--lp-gold-text)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

/** Pick an answer, then check it, as on the question screen. `hint` points at the options until one is picked. */
function QuestionCard({ onResult, hint = false }) {
  const q = SAMPLE
  const [picked, setPicked] = useState(null)
  const [checked, setChecked] = useState(false)
  const check = () => { setChecked(true); onResult?.(picked) }
  // Where the first option is, so the arrow lands on it whatever the screen size.
  const wrap = useRef(null), firstOpt = useRef(null)
  const [geo, setGeo] = useState(null)
  const showHint = hint && picked === null && !checked
  useLayoutEffect(() => {
    if (!showHint || !wrap.current || !firstOpt.current) return undefined
    const measure = () => {
      const w = wrap.current.getBoundingClientRect(), o = firstOpt.current.getBoundingClientRect()
      setGeo({ w: w.width, ox: o.right - w.left, oy: o.top - w.top + o.height / 2 })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [showHint])
  return (
    <div className="lp-q-wrap" ref={wrap}>
      {showHint && (
        <div className="lp-hint-layer" aria-hidden="true">
          <span className="lp-hint lp-hint-top">Try this question!</span>
          {geo && (
            <svg className="lp-hint-svg" width={geo.w} height={geo.oy + 10}>
              <HintArrow
                d={`M${geo.w - 48},-4 C${geo.w - 8},${geo.oy * 0.25} ${geo.w - 6},${geo.oy * 0.75} ${geo.ox - 30},${geo.oy}`}
                fromX={geo.w - 6} fromY={geo.oy * 0.75} x2={geo.ox - 30} y2={geo.oy} />
            </svg>
          )}
        </div>
      )}
      <div className="lp-card lp-q">
        <div className="lp-qt"><span><b>{q.topic}</b> · {q.level}</span></div>
        <div className="lp-stem" id="lp-q-stem"><MathText text={q.stem} /></div>
        <div role="group" aria-labelledby="lp-q-stem" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {q.options.map((o, i) => {
            const st = !checked ? '' : i === q.answer ? 'r' : i === picked ? 'w' : 'd'
            return (
              <button key={o} ref={i === 0 ? firstOpt : undefined} type="button" className={`lp-opt ${st}`} disabled={checked} aria-pressed={checked ? undefined : picked === i} onClick={() => setPicked(i)}>
                <span className="k">{'ABCD'[i]}</span><MathText text={o} /><span className="tg">{st === 'r' ? 'Answer' : st === 'w' ? 'Your answer' : ''}</span>
              </button>
            )
          })}
        </div>
        {checked && <div className="lp-sol" role="status"><b>{picked === q.answer ? 'Correct' : 'Not quite'}</b><MathText text={q.working} /></div>}
        <div className="lp-qact">
          {checked
            ? <button type="button" className="lp-btn sm" onClick={() => { setPicked(null); setChecked(false); onResult?.(null) }}>Try again</button>
            : <button type="button" className="lp-btn sm gold" disabled={picked === null} onClick={check}>Check</button>}
        </div>
      </div>
    </div>
  )
}

const EXPLAIN = {
  Plain: 'It\'s a function inside a function. Differentiate the outside and leave the inside alone: $3(2x-5)^2$. Then multiply by the derivative of the inside, which is $2$. So it\'s $6(2x-5)^2$.',
  Sport: 'Think relay. The outside function runs its leg, $3(2x-5)^2$, then hands the baton to the inside one, which runs $2$. You multiply the legs: $6(2x-5)^2$.',
  Gaming: 'It\'s stacking multipliers. The outer power gives $3(2x-5)^2$, the inner one is $\\times 2$, and multipliers stack by multiplying: $6(2x-5)^2$.',
  Music: 'Speed up a track that\'s already sped up. The inside changes twice as fast as $x$, so every change on the outside happens twice as fast too: $3(2x-5)^2 \\times 2 = 6(2x-5)^2$.',
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
        <div className="lp-me"><MathText text="Why isn't it $3(2x-5)^2$? I brought the power down." /></div>
        <div className="lp-re" aria-live="polite"><b>Titan</b><MathText text={EXPLAIN[style]} /></div>
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
  'gradefarm. is a question bank for Australian school students ',
  'that remembers what you got wrong, ',
  'and brings each one back until you get it right. ',
  'When you\'re stuck, Titan explains it your way.',
]
// The sentence gets a little smaller as it grows, so every clause fits.
const SIZES = [52, 50, 46, 42]

function AndHero({ onStart, onDone, onSeeInside, done }) {
  // Someone who finished it earlier this session starts at the end.
  const [n, setN] = useState(done ? CLAUSES.length : 1)
  const [picked, setPicked] = useState(null)
  const last = n >= CLAUSES.length
  useEffect(() => { if (last) onDone() }, [last]) // eslint-disable-line react-hooks/exhaustive-deps
  const planted = picked === null
    ? 'Say you answered $3(2x-5)^2$. It\'s planted, and comes back in an hour.'
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
            ? <><button type="button" className="lp-btn gold lg" onClick={onStart}>Start free</button><button type="button" className="lp-btn lg" onClick={onSeeInside}>How it works ↓</button></>
            : <button type="button" className="lp-btn gold lg" onClick={() => setN(n + 1)} aria-label="And? Show the next part">And?</button>}
          {/* Once they've answered the sample question, point them at And? */}
          {n === 1 && picked !== null && (
            <span className="lp-hint lp-hint-inline" aria-hidden="true">
              <svg width="80" height="44" viewBox="0 0 80 44" style={{ overflow: 'visible' }}>
                <HintArrow d="M78,36 C57,45 27,39 9,18" fromX={27} fromY={39} x2={9} y2={18} />
              </svg>
              Now click And?
            </span>
          )}
          <span className="n" aria-live="polite">{n} of {CLAUSES.length}</span>
          {last && <button type="button" className="lp-link" onClick={() => setN(1)}>Start again</button>}
          {!last && n > 1 && <button type="button" className="lp-link" onClick={() => setN(CLAUSES.length)}>Show it all</button>}
        </div>
      </div>
      <div className="lp-and-vis" key={n} aria-live="polite">
        {n === 1 && <QuestionCard onResult={setPicked} hint />}
        {n === 2 && <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}><span className={`lp-sq ${picked === SAMPLE.answer ? 's2' : 's1'}`} style={{ width: 72, height: 72 }} /><p style={{ fontSize: 16, color: 'var(--lp-ink-2)', maxWidth: '32ch' }}><MathText text={planted} /></p></div>}
        {n === 3 && <><Grow /><p className="lp-muted" style={{ fontSize: 15, maxWidth: '40ch', marginTop: 6 }}>Each time you get it right, the gap gets longer. Right every time, and it turns gold.</p></>}
        {n === 4 && <TitanCard />}
      </div>
    </section>
  )
}

/* ─── How it works: spaced repetition ───────────────────────────────────── */

// The review times the app uses after a miss (lib/engine.js nextReviewTime):
// about an hour, then 4 days, then 3 weeks, each once it's right again.
const REVIEWS_H = [1, 96, 504]
const SPAN_H = 1008 // six weeks
// An illustration of the forgetting curve, not measured data: memory fades
// as e^(−t/S), and each review resets it and makes it fade more slowly.
// Strengths are set so each review lands as you start to forget (about 55%,
// then 60%), and six weeks on most of it is still there.
const CRAM_S = 30
const SPACED_S = [10, 160, 800, 1750]

function curvePoints(reviews, strengths) {
  const pts = []
  const starts = [0, ...reviews]
  starts.forEach((t0, i) => {
    const t1 = i + 1 < starts.length ? starts[i + 1] : SPAN_H
    const S = strengths[Math.min(i, strengths.length - 1)]
    for (let k = 0; k <= 48; k++) {
      // Sample evenly on the chart's log scale so short gaps get enough points.
      const t = Math.expm1(Math.log1p(t0) + (Math.log1p(t1) - Math.log1p(t0)) * (k / 48))
      pts.push([t, Math.exp(-(t - t0) / S)])
    }
  })
  return pts
}

function ForgettingCurve() {
  const [focus, setFocus] = useState('both')
  // A narrow chart on phones, so its labels stay readable.
  const box = useRef(null)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    if (!box.current || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 560))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  const W = narrow ? 400 : 720, H = narrow ? 280 : 300, L = 44, R = 14, T = 24, B = 46
  const x = (t) => L + (Math.log1p(t) / Math.log1p(SPAN_H)) * (W - L - R)
  const y = (r) => T + (1 - r) * (H - T - B)
  const path = (pts) => pts.map(([t, r], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(r).toFixed(1)}`).join('')
  const cram = curvePoints([], [CRAM_S])
  const spaced = curvePoints(REVIEWS_H, SPACED_S)
  const ticks = narrow
    ? [[0, 'Now'], [24, '1 day'], [168, '1 week'], [1008, '6 weeks']]
    : [[0, 'Learn it'], [1, '1 hr'], [24, '1 day'], [96, '4 days'], [504, '3 wks'], [1008, '6 wks']]
  const dim = (k) => (focus === 'both' || focus === k ? 1 : 0.18)
  const endCram = cram[cram.length - 1][1], endSpaced = spaced[spaced.length - 1][1]
  return (
    <div className="lp-card lp-curve" ref={box}>
      <div className="lp-curve-h">
        <span className="lp-sw" role="group" aria-label="Show">
          {[['both', 'Both'], ['cram', 'Cramming'], ['gf', 'gradefarm.']].map(([k, l]) => <button key={k} type="button" aria-pressed={focus === k} onClick={() => setFocus(k)}>{l}</button>)}
        </span>
        <span className="lp-curve-key"><i className="gf" />With reviews<i className="cram" />Learnt once</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="How much you remember over six weeks. Learnt once, it drops away within a few days. With reviews after an hour, 4 days and 3 weeks, it goes back up each time and fades more slowly, and is still mostly there at six weeks.">
        <line x1={L} x2={W - R} y1={y(1)} y2={y(1)} stroke="var(--lp-line)" />
        <line x1={L} x2={W - R} y1={y(0.5)} y2={y(0.5)} stroke="var(--lp-line)" strokeDasharray="3 5" />
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--lp-line-2)" />
        <text x={L - 8} y={y(1) + 4} textAnchor="end" className="lbl">All</text>
        <text x={L - 8} y={y(0) + 4} textAnchor="end" className="lbl">None</text>
        {ticks.map(([t, l]) => <g key={l}><line x1={x(t)} x2={x(t)} y1={y(0)} y2={y(0) + 5} stroke="var(--lp-line-2)" /><text x={x(t)} y={H - 18} textAnchor={t === 0 ? 'start' : t === SPAN_H ? 'end' : 'middle'} className="lbl">{l}</text></g>)}
        <path d={path(cram)} fill="none" stroke="var(--lp-faint)" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" opacity={dim('cram')} style={{ transition: 'opacity .25s' }} />
        <path d={path(spaced)} fill="none" stroke="var(--lp-sq3)" strokeWidth="3.5" strokeLinejoin="round" opacity={dim('gf')} style={{ transition: 'opacity .25s' }} />
        <g opacity={dim('gf')} style={{ transition: 'opacity .25s' }}>
          {REVIEWS_H.map((t) => (
            <g key={t}>
              <circle cx={x(t)} cy={y(1)} r="6" fill="var(--lp-sq3)" stroke="var(--lp-card)" strokeWidth="2.5" />
              <text x={x(t)} y={y(1) - 11} textAnchor="middle" className="lbl strong">Back</text>
            </g>
          ))}
          {/* End labels only fit on the wide chart; the key above covers phones. */}
          {!narrow && <text x={x(SPAN_H)} y={y(endSpaced) + 22} textAnchor="end" className="lbl strong">Still there</text>}
        </g>
        {!narrow && <text x={x(SPAN_H)} y={y(endCram) - 10} textAnchor="end" className="lbl" opacity={dim('cram')}>Mostly gone</text>}
      </svg>
      <p className="lp-curve-note">An illustration of the forgetting curve, not your data. The review times are the ones gradefarm. uses.</p>
    </div>
  )
}

function SpacedRepetition() {
  return (
    <section id="how" className="lp-in lp-sec lp-why" aria-labelledby="lp-why">
      <h2 id="lp-why">This is spaced repetition.</h2>
      <div className="lp-why-body">
      <div>
        <p className="lp-why-lead">You forget most of what you learn within days. Answering a question again just as you start to forget is what makes it stick, and each time it lasts longer. gradefarm. works out when that is for every question you answer.</p>
        <div className="lp-why-pts">
          <div><b>Active recall</b><span>You answer questions instead of re-reading notes, because getting it out of your head is what builds the memory.</span></div>
          <div><b>Spaced repetition</b><span>Each question comes back an hour after you miss it, then days, then weeks later, just before you'd forget.</span></div>
        </div>
        <p className="lp-why-src">Psychologists have studied the forgetting curve since the 1880s.</p>
      </div>
      <ForgettingCurve />
      </div>
    </section>
  )
}

/* ─── 2 · What's inside: the scrolling phone ───────────────────────────── */

const CHAPTERS = [
  ['Practice', 'Questions on the topics you\'re doing.', 'Tick what you\'re on this term, then choose new questions, the ones you got wrong, or a mix. Every question is mapped to a topic in your course.'],
  ['Worked solutions', 'Every question shows the working.', 'Not just the answer: the steps, and the slip most people make, so you know exactly where it went wrong.'],
  ['Titan', 'Stuck at 11 pm? Ask Titan.', 'The AI tutor explains it again, as many times as you need, plainly or with sport, gaming or music. Add a photo of a question or your class notes, or take a guided lesson on a whole topic.'],
  ['Comes back', 'Get it wrong and it comes back.', 'Sessions start with the questions that are due back: an hour after a miss, then a few days later, then weeks later, until you get it right every time. Test tomorrow on one topic? Skip them for now. When a topic runs out, new questions are written for it.'],
  ['Progress', 'See yourself improving.', 'Accuracy by week, your next SAC, test or exam counting down, and a plan for this week: the reviews that are due, lessons in progress and your weakest topics.'],
  ['Exam mode', 'Practise under exam conditions.', 'Pick how many questions and a time limit. Answers stay hidden until you finish, then every question shows the working, and the ones you missed come back like any other.'],
]

function PhoneScreen({ i }) {
  if (i === 0) return (
    <>
      <div className="lp-ph-top"><span>9:41</span><span>Methods · Units 1 &amp; 2</span></div>
      <h4>Practice</h4>
      <div className="lp-card" style={{ padding: '4px 0' }}>
        {[['Polynomials', '84%', 'var(--lp-ok)', true], ['Further differentiation', '58%', 'var(--lp-gold-text)', true], ['Functions and relations', '91%', 'var(--lp-ok)', false], ['Circular functions', '49%', 'var(--lp-bad)', false], ['Probability', 'New', 'var(--lp-faint)', false]].map(([n, p, c, on]) => (
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
      <b style={{ fontSize: 15.5 }}><MathText text={SAMPLE.stem} /></b>
      <span className="lp-chip w">A · <MathText text="$3(2x-5)^2$" /> · Your answer</span>
      <span className="lp-chip r">B · <MathText text="$6(2x-5)^2$" /> · Answer</span>
      <span className="lp-chip">C · <MathText text="$6x(2x-5)^2$" /></span>
      <div style={{ borderTop: '1px solid var(--lp-line)', paddingTop: 8, color: 'var(--lp-ink-2)' }}><b style={{ color: 'var(--lp-ink)' }}>Worked solution</b><br /><MathText text="Differentiate the outside: $3(2x-5)^2$. Multiply by the inside's derivative, $2$: $6(2x-5)^2$." /><br /><span className="lp-muted" style={{ fontSize: 12 }}><MathText text="Common slip: forgetting the $\times 2$ from the inside." /></span></div>
      <div className="lp-goldbar" style={{ marginTop: 'auto' }}>Practise 3 like this</div>
    </>
  )
  if (i === 2) return (
    <>
      <div className="lp-ph-top"><span>11:04 pm</span><span>Learn</span></div>
      <div className="lp-seg"><span>Plain</span><span className="on">Sport</span><span>Gaming</span><span>Music</span></div>
      <div className="lp-me"><MathText text="Why isn't it $3(2x-5)^2$?" /></div>
      <div className="lp-re"><b>Titan</b><MathText text={EXPLAIN.Sport} /></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}><span className="lp-chip">Show me another</span><span className="lp-chip">I'm still stuck</span></div>
    </>
  )
  if (i === 3) return (
    <>
      <div className="lp-ph-top"><span>Next session</span><span>Methods</span></div>
      <div className="lp-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b style={{ fontSize: 13 }}>Your session</b>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--lp-gold-text)' }}>Start with 3 due reviews</span>
        <div className="lp-goldbar">Start</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}><b>Further differentiation</b><span className="lp-pill">Due back</span></div>
      <b style={{ fontSize: 14.5 }}><MathText text={SAMPLE.stem} /></b>
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
      <b style={{ fontSize: 14.5 }}><MathText text="Solve $2^{x+1} = 16$ for $x$." /></b>
      <span className="lp-chip">A · <MathText text="$x = 3$" /></span>
      <span className="lp-chip">B · <MathText text="$x = 4$" /></span>
      <span className="lp-chip">C · <MathText text="$x = 8$" /></span>
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
    <section id="inside" className="lp-in lp-sec" aria-labelledby="lp-inside">
      <div className="lp-sec-head">
        <h2 id="lp-inside">What's inside, one screen at a time</h2>
        <p>Everything you need to practise, in one app.</p>
      </div>
      <div className="lp-stk">
        <div className="lp-ph-col" aria-hidden="true"><div className="lp-ph"><div className="lp-ph-s anim" key={active}><PhoneScreen i={active} /></div></div></div>
        <div>
          {CHAPTERS.map(([k, h, p], i) => (
            <div key={k} ref={el => { refs.current[i] = el }} data-i={i} className={`lp-chap${active === i ? ' on' : ''}`}>
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

/* ─── Where it fits: textbook, tutor, gradefarm. ─────────────────────────── */

function WhereItFits({ weekly }) {
  const rows = [
    ['Practice questions', 'One exercise per topic', 'Whatever they bring', 'Every topic, and new ones when you run out'],
    ['Shows the working', 'Answers only', 'Yes', 'Yes, on every question'],
    ['Remembers what you got wrong', 'No', 'In their notes', 'Every one'],
    ['Brings it back until you get it', 'No', "When there's time", 'Yes: an hour, days, then weeks later'],
    ['Help at 11 pm', 'No', 'Not usually', 'Titan, any time'],
    ['Cost', 'Bought once', 'Per lesson', `Free for one subject; $${weekly} a week for everything`],
  ]
  return (
    <section id="fits" className="lp-in lp-sec" aria-labelledby="lp-fits">
      <div className="lp-sec-head">
        <h2 id="lp-fits" style={{ maxWidth: '32ch' }}>Your textbook has the questions. Your tutor has an hour a week. <span style={{ display: 'block' }}><Brand /> is the rest.</span></h2>
        <p>It doesn't replace your tutor. It's the practice between lessons.</p>
      </div>
      <div className="lp-card lp-cmp">
        <table>
          <thead><tr><th><span className="lp-sr">What</span></th><th>Textbook</th><th>Tutor</th><th className="gf"><Brand /></th></tr></thead>
          <tbody>
            {rows.map(([what, book, tutor, gf]) => (
              <tr key={what}><th scope="row">{what}</th><td className={/^No\b|^Not/.test(book) ? 'no' : ''}>{book}</td><td className={/^No\b|^Not/.test(tutor) ? 'no' : ''}>{tutor}</td><td className="gf">{gf}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ─── 3 · Subjects ─────────────────────────────────────────────────────── */

// Built entirely from the live subject list (GET /api/public-subjects: every
// live, unarchived curriculum, cached for 5 minutes). Making a subject live
// in Admin adds it here; archiving it removes it. Each subject goes in a group
// by its level, and a group with no subjects isn't shown.
function Subjects({ onPick }) {
  const live = usePublicSubjects() // null while loading, [] if it can't be reached
  const grouped = groupSubjects(live)
  const shown = GROUPS.filter(g => grouped[g.id].length > 0)
  const phrases = shown.map(g => g.phrase)
  const list = phrases.length > 1 ? `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}` : phrases[0]
  return (
    <section id="subjects" className="lp-in lp-sec" aria-labelledby="lp-subjects">
      <div className="lp-sec-head">
        <h2 id="lp-subjects">Subjects</h2>
        <p>{shown.length
          ? `Subjects for ${list}. New subjects appear here as soon as they're ready, and every subject gets new questions as you practise.`
          : 'Every subject gets new questions as you practise.'}</p>
      </div>
      {live === null ? (
        <p className="lp-muted" style={{ marginTop: 20 }}>Loading subjects…</p>
      ) : shown.length === 0 ? (
        <p style={{ marginTop: 20 }}><button type="button" className="lp-link" onClick={onPick}>See the subjects you can start with</button></p>
      ) : (
        <div className="lp-subjs">
          {shown.map(g => (
            <div key={g.id} className="lp-card lp-subj">
              <div className="hd"><b>{g.title}</b>{g.note && <span>{g.note}</span>}</div>
              {grouped[g.id].map(x => (
                <button key={x.name + x.level} type="button" className="lp-subj-row" onClick={onPick}><span>{x.name}</span><small>{x.level}</small></button>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/* ─── page ─────────────────────────────────────────────────────────────── */

export default function LandingPage({ theme = 'light', onToggleTheme, onSignIn }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [pricing, setPricing] = useState(null)
  // The rest of the page appears once the hero's sentence is finished (or a nav link asks for it).
  const [done, setDone] = useState(() => { try { return sessionStorage.getItem('gf-home-seen') === '1' } catch { return false } })
  const finish = () => { setDone(true); try { sessionStorage.setItem('gf-home-seen', '1') } catch {} }
  useEffect(() => { getPlatformSettings('pricing').then(setPricing).catch(() => {}) }, [])
  const tiers = studentTiers(pricing?.student_tiers)
  const freeDaily = pricing?.free_daily_questions ?? 20
  const trialDays = Math.max(0, Math.floor(Number(pricing?.student_trial_days ?? 7)) || 0)

  // Starting goes to Pricing, where a student picks free or paid.
  const start = () => navigate('/pricing')
  const go = (id) => {
    if (id === 'pricing') return navigate('/pricing')
    if (id === 'tutors') return navigate('/auth/tutor')
    if (id === 'year6') return navigate('/year-6')
    const wasHidden = !done
    finish()
    // Wait for the sections to exist, and on first showing for their layout to settle
    // (the page's height changes a frame after they appear), before scrolling to them.
    const scroll = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    requestAnimationFrame(() => requestAnimationFrame(() => (wasHidden ? setTimeout(scroll, 120) : scroll())))
  }
  // Other pages link to a section here with navigate('/home', { state: { scrollTo } }).
  const scrollTo = location.state?.scrollTo
  useEffect(() => {
    if (!scrollTo) return
    go(scrollTo)
    navigate(location.pathname, { replace: true, state: null })
  }, [scrollTo]) // eslint-disable-line react-hooks/exhaustive-deps
  const NAV = [['How it works', () => go('how')], ['Subjects', () => go('subjects')], ['Questions', () => go('questions')], ['Pricing', () => go('pricing')]]

  return (
    <div className="lp" style={{ ...themeVars(theme), colorScheme: theme === 'dark' ? 'dark' : 'light' }}>
      <style>{SITE_FONTS + CSS}</style>
      <SiteNav theme={theme} onToggleTheme={onToggleTheme} onSignIn={onSignIn} onStart={start}
        onLogo={() => window.scrollTo({ top: 0, behavior: 'smooth' })} links={NAV} />

      <main>
        <AndHero onStart={start} onDone={finish} onSeeInside={() => go('how')} done={done} />
        {/* In the page for search engines, but invisible until the hero is finished. */}
        <div hidden={!done}>
        <SpacedRepetition />
        <Inside />
        <WhereItFits weekly={tiers[0]} />

        <Subjects onPick={start} />

        <section id="questions" className="lp-in lp-sec" aria-labelledby="lp-faq">
          <div className="lp-sec-head"><h2 id="lp-faq">Questions people ask</h2></div>
          <div className="lp-faq">
            <details open><summary>How is this different from past papers?</summary><p>A past paper is the same questions every time, and once you've seen the answers you're memorising, not learning. gradefarm. remembers which questions you got wrong, brings each one back until you can do it, and writes new ones when you run out.</p></details>
            <details><summary>Does it follow my course?</summary><p>Yes. Each subject is built from its official course, like the VCAA study design for VCE, and every question is mapped to a topic in it, so nothing is off the course.</p></details>
            <details><summary>Is it actually free?</summary><p>One subject is free, {freeDaily} questions a day, with no card. Every question with no daily cap is ${tiers[0]} a week{trialDays > 0 ? `, and the first ${trialDays} days are free` : ''}.</p></details>
            <details><summary>What's Titan?</summary><p>The AI tutor. Ask it about any question or topic, any time, and it explains it plainly or with sport, gaming or music. You can add a photo of a question or your class notes, or take a guided lesson on a whole topic.</p></details>
            <details><summary>Can I practise under exam conditions?</summary><p>Yes. Exam mode sets a number of questions and a time limit and holds the answers back until you finish. Then you get every question with its working, and the ones you missed come back later.</p></details>
            <details><summary>Does it work on my phone?</summary><p>Yes. It's a website, so it works on your phone, laptop or school computer with nothing to install, and your progress follows you.</p></details>
          </div>
        </section>

        <section className="lp-in lp-sec" aria-labelledby="lp-pricing">
          <div className="lp-sec-head">
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

      <SiteFooter hidden={!done} links={siteFooterLinks(navigate, go)} />
    </div>
  )
}
