import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPlatformSettings } from '../lib/db'
import { studentTiers, planTotal, money } from '../lib/pricing'

// Public sales page for parents of Year 6 students preparing for selective
// and special-entry high school tests (/year-6). It leads to one offer, the
// free readiness check (/readiness-check, ReadinessCheckScreen), which also
// rides along as a sticky bar once the hero's button scrolls away.
//
// The app screens are real gradefarm screens with a sample student, captured
// for this page (public/year-6/). Styles are scoped under .y6p.

const IMG = {
  crest: '/year-6/crest.jpg',
  founder: '/year-6/founder.jpg',
  homeScreen: '/year-6/home-screen.jpg',
  question: '/year-6/question.jpg',
  workedSolution: '/year-6/worked-solution.jpg',
  titan: '/year-6/titan.jpg',
  teachingQuestion: '/year-6/teaching-question.jpg',
  sundayEmail: '/year-6/sunday-email.jpg',
}

// Caveat is only for the founder's signature.
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700&family=Caveat:wght@600&display=swap'

const CSS = `
/* Layout: one phone-first column of short sections that alternate navy (the Titanium crest's ground)
   and paper; every section ends pointing at the same offer, which also rides along as a sticky bar. */
.y6p {
  --navy: #0b1d63;        /* Titanium Tutoring crest navy */
  --navy-deep: #07134a;
  --gold: #f2c04f;        /* crest gold */
  --gold-soft: #fdf4dc;
  --gold-ink: #7a5300;
  --paper: #f7f6f2;
  --white: #ffffff;
  --ink: #0d1440;
  --ink-2: #464d6b;
  --ink-3: #7a8098;
  --line: #e4e3ec;
  --good: #11865c;
  --bad: #b8431b;
  --font: 'Plus Jakarta Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --hand: 'Caveat', 'Segoe Script', cursive;
  color-scheme: light;
}
.y6p * { box-sizing: border-box; }

.y6p { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--font); font-size: 17px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
.y6p::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 30; background: var(--navy-deep); }
.y6p h1, .y6p h2, .y6p h3 { margin: 0; text-wrap: balance; letter-spacing: -0.025em; line-height: 1.1; }
.y6p p { margin: 0; }
.y6p img { display: block; max-width: 100%; }
.y6p :focus-visible { outline: 3px solid var(--gold); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .y6p { scroll-behavior: auto; } .y6p * { transition: none !important; animation: none !important; } }

.y6p .band { padding-block: 72px; padding-left: max(20px, env(safe-area-inset-left, 0px)); padding-right: max(20px, env(safe-area-inset-right, 0px)); }
.y6p .band.navy { background: var(--navy); color: #fff; }
.y6p .band.white { background: var(--white); }
.y6p .wrap { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 40px; }
.y6p .wrap.narrow { max-width: 720px; }
.y6p .eyebrow { font-size: 12.5px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-ink); }
.y6p .navy .eyebrow { color: var(--gold); }
.y6p .h1 { font-size: clamp(34px, 5.2vw, 58px); font-weight: 800; }
.y6p .h1 em { font-style: italic; color: var(--gold); }
.y6p .h2 { font-size: clamp(28px, 3.6vw, 42px); font-weight: 800; }
.y6p .lead { font-size: 19px; color: var(--ink-2); max-width: 58ch; }
.y6p .navy .lead { color: #cdd3f2; }
.y6p .head { display: flex; flex-direction: column; gap: 14px; }
.y6p .cta { display: inline-flex; align-items: center; justify-content: center; gap: 10px; background: var(--gold); color: var(--navy-deep); border: 0; border-radius: 14px; padding: 18px 28px; font: 800 17px/1.2 var(--font); cursor: pointer; text-decoration: none; box-shadow: 0 10px 28px rgba(242,192,79,.35); transition: transform .15s; }
.y6p .cta:hover { transform: translateY(-1px); }
.y6p .cta small { display: block; font-weight: 600; font-size: 12.5px; opacity: .75; }
.y6p .micro { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 14px; color: var(--ink-3); }
.y6p .navy .micro { color: #aeb6e3; }
.y6p .micro span::before { content: "✓ "; color: var(--good); font-weight: 800; }
.y6p .navy .micro span::before { color: var(--gold); }

/* Top bar */
.y6p .topbar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 20; background: var(--navy-deep); padding-block: 10px; padding-left: max(20px, env(safe-area-inset-left, 0px)); padding-right: max(20px, env(safe-area-inset-right, 0px)); }
.y6p .topbar .in { max-width: 1080px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.y6p .brand { display: flex; align-items: center; gap: 10px; color: #fff; min-width: 0; }
.y6p .brand img { width: 38px; height: 38px; border-radius: 50%; }
.y6p .brand b { font-size: 18px; letter-spacing: -0.04em; }
.y6p .brand b i { color: var(--gold); font-style: normal; }
.y6p .brand span { display: block; font-size: 11px; color: #9aa3d6; letter-spacing: .04em; }
.y6p .topbar .cta { padding: 10px 16px; font-size: 14px; border-radius: 10px; box-shadow: none; white-space: nowrap; }

/* Hero */
.y6p .hero { display: grid; grid-template-columns: 1.15fr .85fr; gap: 56px; align-items: center; }
.y6p .hero-copy { display: flex; flex-direction: column; gap: 24px; }
.y6p .phone { width: 300px; max-width: 100%; margin: 0 auto; background: #0a0f2e; border-radius: 40px; padding: 12px; box-shadow: 0 40px 80px rgba(0,0,0,.45), inset 0 0 0 2px #262c57; }
.y6p .screen { background: var(--white); color: var(--ink); border-radius: 30px; overflow: hidden; }
.y6p .app-top { background: var(--navy-deep); color: #fff; padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 4px; }
.y6p .app-top b { font-size: 16px; letter-spacing: -0.02em; }
.y6p .app-top span { font-size: 12px; color: #9aa3d6; }
.y6p .app-body { padding: 16px 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.y6p .score { display: flex; align-items: center; gap: 14px; }
.y6p .score svg { flex-shrink: 0; }
.y6p .score b { font-size: 22px; letter-spacing: -0.03em; }
.y6p .score span { display: block; font-size: 12.5px; color: var(--ink-3); }
.y6p .rowlist { display: flex; flex-direction: column; gap: 6px; }
.y6p .rowlist div { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; padding: 8px 10px; border-radius: 10px; background: var(--paper); }
.y6p .rowlist .ok { color: var(--good); font-weight: 800; }
.y6p .rowlist .gap { color: var(--bad); font-weight: 800; }
.y6p .mini-label { font-size: 10.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); }
.y6p .app-btn { background: var(--gold); color: var(--navy-deep); text-align: center; font-weight: 800; font-size: 13.5px; padding: 11px; border-radius: 11px; }
.y6p .sample { text-align: center; font-size: 12px; color: #9aa3d6; margin-top: 12px; }

/* What is gradefarm */
.y6p .browser { border-radius: 14px; overflow: hidden; box-shadow: 0 30px 70px rgba(13,20,64,.22); border: 1px solid var(--line); background: #0a0f2e; }
.y6p .browser .bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #10163d; }
.y6p .browser .bar i { width: 10px; height: 10px; border-radius: 50%; background: #2c3366; display: block; }
.y6p .browser .bar span { margin-left: 8px; flex: 1; min-width: 0; background: #1a2150; color: #8e97cc; font-size: 12px; border-radius: 6px; padding: 4px 10px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.y6p .cap { font-size: 14.5px; color: var(--ink-3); text-align: center; }
.y6p .what-intro { display: grid; grid-template-columns: .9fr 1.1fr; gap: 48px; align-items: center; }
.y6p .facts { display: flex; flex-direction: column; gap: 14px; }
.y6p .fact { display: grid; grid-template-columns: 40px 1fr; gap: 12px; align-items: start; }
.y6p .fact .ic { width: 40px; height: 40px; border-radius: 12px; background: var(--gold-soft); color: var(--gold-ink); display: grid; place-items: center; font-weight: 800; font-size: 18px; }
.y6p .fact b { display: block; font-size: 16.5px; }
.y6p .fact p { color: var(--ink-2); font-size: 15.5px; }
.y6p .walk { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
.y6p .walk figure { margin: 0; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.y6p .shot { border-radius: 28px; border: 7px solid #0a0f2e; overflow: hidden; background: #0a0f2e; box-shadow: 0 20px 44px rgba(13,20,64,.20); aspect-ratio: 600 / 1133; }
.y6p .shot img { width: 100%; height: 100%; object-fit: cover; }
.y6p .walk figcaption { display: flex; flex-direction: column; gap: 4px; }
.y6p .walk figcaption .n { font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--gold-ink); }
.y6p .walk figcaption b { font-size: 17px; letter-spacing: -0.01em; }
.y6p .walk figcaption span { font-size: 14.5px; color: var(--ink-2); }
.y6p .real-note { font-size: 13px; color: var(--ink-3); }
.y6p .mailshot { max-width: 360px; margin: 0 auto; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 44px rgba(13,20,64,.16); border: 1px solid var(--line); }


/* Pains */
.y6p .pains { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.y6p .pain { border-top: 3px solid var(--bad); padding-top: 16px; display: flex; flex-direction: column; gap: 6px; }
.y6p .pain h3 { font-size: 20px; }
.y6p .pain p { color: var(--ink-2); }

/* Feature rows */
.y6p .feature { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
.y6p .feature.flip .fv { order: -1; }
.y6p .ft { display: flex; flex-direction: column; gap: 12px; }
.y6p .ft .k { font-size: 13px; font-weight: 800; color: var(--gold-ink); letter-spacing: .1em; text-transform: uppercase; }
.y6p .ft h3 { font-size: clamp(24px, 2.8vw, 32px); }
.y6p .ft p { color: var(--ink-2); font-size: 17.5px; }
.y6p .fv { background: var(--paper); border-radius: 24px; padding: 28px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.y6p .white .fv { background: var(--paper); }

.y6p .rung { display: grid; grid-template-columns: 80px 1fr auto; gap: 10px; align-items: center; padding: 10px 14px; border-radius: 12px; background: var(--white); border: 1px solid var(--line); font-size: 14.5px; }
.y6p .rung .s { color: var(--gold-ink); letter-spacing: 1px; font-size: 13px; }
.y6p .rung.on { border-color: var(--gold); background: var(--gold-soft); font-weight: 800; }
.y6p .tag { font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; background: var(--navy); color: #fff; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }

.y6p .q { background: var(--white); border: 1px solid var(--line); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.y6p .q .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.y6p .badge { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; padding: 3px 9px; border-radius: 999px; }
.y6p .b-wrong { background: #fde6dc; color: var(--bad); }
.y6p .b-teach { background: #e5ecff; color: #1d47b0; }
.y6p .b-new { background: var(--gold-soft); color: var(--gold-ink); }
.y6p .q .stem { font-weight: 700; font-size: 15.5px; }
.y6p .hint { background: #f0f4ff; border-left: 3px solid #1d47b0; padding: 8px 12px; border-radius: 0 10px 10px 0; font-size: 14px; font-weight: 500; }
.y6p .opts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.y6p .opt { text-align: center; border: 1px solid var(--line); border-radius: 9px; padding: 7px 4px; font-size: 14px; font-variant-numeric: tabular-nums; }
.y6p .opt.x { background: #fff3ee; border-color: #f1b39b; color: var(--bad); text-decoration: line-through; }
.y6p .opt.ok { background: #edf9f3; border-color: #a5dbc3; color: var(--good); font-weight: 800; }
.y6p .arrow { text-align: center; color: var(--ink-3); font-size: 13px; font-weight: 700; }

.y6p .stackq { position: relative; display: flex; flex-direction: column; gap: 10px; }
.y6p .stackq .q { box-shadow: 0 6px 16px rgba(13,20,64,.06); }
.y6p .stackq .q:nth-child(2) { margin-left: 14px; }
.y6p .stackq .q:nth-child(3) { margin-left: 28px; }

.y6p .mail { background: var(--white); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
.y6p .mail .mh { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--ink-3); padding: 12px 16px; border-bottom: 1px solid var(--line); }
.y6p .mail .mb { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.y6p .mail .mb b { font-size: 17px; }
.y6p .kv { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 10px; }
.y6p .kv div { display: grid; grid-template-columns: 96px 1fr; gap: 10px; padding: 8px 12px; font-size: 13.5px; }
.y6p .kv div + div { border-top: 1px solid #efeef4; }
.y6p .kv span { color: var(--ink-3); }
.y6p .kv strong { font-weight: 700; }

/* Steps */
.y6p .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.y6p .step { background: var(--white); border-radius: 20px; padding: 24px; display: flex; flex-direction: column; gap: 8px; color: var(--ink); }
.y6p .step .n { width: 36px; height: 36px; border-radius: 50%; background: var(--gold); color: var(--navy-deep); font-weight: 800; display: grid; place-items: center; }
.y6p .step h3 { font-size: 19px; }
.y6p .step p { color: var(--ink-2); font-size: 15.5px; }

/* Founder */
.y6p .founder { display: grid; grid-template-columns: 300px 1fr; gap: 48px; align-items: start; }
.y6p .founder img { width: 100%; aspect-ratio: 19 / 27; object-fit: cover; border-radius: 24px; box-shadow: 0 24px 50px rgba(13,20,64,.18); }
.y6p .letter { display: flex; flex-direction: column; gap: 16px; font-size: 18px; color: var(--ink-2); }
.y6p .letter .hi { font-size: clamp(26px, 3vw, 34px); font-weight: 800; color: var(--ink); letter-spacing: -0.02em; }
.y6p .sig { font-family: var(--hand); font-size: 44px; color: var(--navy); line-height: 1; }
.y6p .ph { background: var(--gold-soft); border: 1px dashed #d4a028; color: var(--gold-ink); border-radius: 6px; padding: 0 5px; font-weight: 700; }

/* Offer */
.y6p .offer { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.y6p .plan { border-radius: 22px; padding: 28px; display: flex; flex-direction: column; gap: 14px; }
.y6p .plan.free { background: var(--gold); color: var(--navy-deep); }
.y6p .plan.paid { background: var(--white); border: 1px solid var(--line); }
.y6p .plan .step-l { font-size: 12.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; opacity: .75; }
.y6p .plan .price { font-size: 46px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
.y6p .plan .price small { font-size: 16px; font-weight: 600; letter-spacing: 0; opacity: .7; }
.y6p .ticks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; font-size: 15.5px; }
.y6p .ticks li { display: flex; gap: 10px; }
.y6p .ticks li::before { content: "✓"; font-weight: 800; color: var(--good); }
.y6p .plan.free .ticks li::before { color: var(--navy-deep); }
.y6p .plan.free .cta { background: var(--navy-deep); color: #fff; box-shadow: none; }

/* Safety */
.y6p .safe { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.y6p .safe div { display: flex; flex-direction: column; gap: 6px; }
.y6p .safe b { font-size: 16px; }
.y6p .safe p { font-size: 14.5px; color: #cdd3f2; }

/* FAQ */
.y6p details { border-bottom: 1px solid var(--line); padding: 18px 0; }
.y6p summary { font-weight: 800; font-size: 17px; cursor: pointer; list-style: none; display: flex; justify-content: space-between; gap: 16px; }
.y6p summary::-webkit-details-marker { display: none; }
.y6p summary::after { content: "+"; color: var(--gold-ink); font-size: 22px; line-height: 1; }
.y6p details[open] summary::after { content: "–"; }
.y6p details p { margin-top: 10px; color: var(--ink-2); }

.y6p .final { text-align: center; align-items: center; }
.y6p .final img { width: 84px; height: 84px; border-radius: 50%; }

.y6p footer { background: var(--navy-deep); color: #8e97cc; font-size: 13px; padding-block: 24px 96px; padding-left: max(20px, env(safe-area-inset-left, 0px)); padding-right: max(20px, env(safe-area-inset-right, 0px)); }
.y6p footer .in { max-width: 1080px; margin: 0 auto; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; }

.y6p .sticky { position: fixed; left: 0; right: 0; bottom: 0; z-index: 25; background: var(--white); border-top: 1px solid var(--line); box-shadow: 0 -10px 30px rgba(13,20,64,.12); padding-top: 10px; padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px)); padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: none; align-items: center; justify-content: space-between; gap: 12px; transform: translateY(110%); transition: transform .25s; }
.y6p .sticky.show { transform: none; }
.y6p .sticky .t { font-size: 13.5px; line-height: 1.3; }
.y6p .sticky .cta { padding: 12px 18px; font-size: 15px; box-shadow: none; }

@media (max-width: 860px) {
  .y6p .band { padding-block: 52px; }
  .y6p .hero, .y6p .feature, .y6p .founder, .y6p .offer, .y6p .what-intro { grid-template-columns: 1fr; }
  .y6p .walk { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 72%; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 8px; margin-right: calc(-1 * max(20px, env(safe-area-inset-right, 0px))); padding-right: max(20px, env(safe-area-inset-right, 0px)); }
  .y6p .walk figure { scroll-snap-align: start; }
  .y6p .feature.flip .fv { order: 0; }
  .y6p .hero { gap: 40px; }
  .y6p .pains, .y6p .steps { grid-template-columns: 1fr; }
  .y6p .safe { grid-template-columns: 1fr 1fr; }
  .y6p .founder img { max-width: 260px; }
  .y6p .lead { font-size: 17.5px; }
  .y6p .topbar .brand span { display: none; }
  .y6p .sticky { display: flex; }
  .y6p .hero-copy .cta { width: 100%; }
}
@media (max-width: 420px) {
  .y6p .safe { grid-template-columns: 1fr; }
  .y6p .opts { grid-template-columns: 1fr 1fr; }
  .y6p .topbar .cta { padding: 9px 12px; font-size: 13px; }
}
.y6p { min-height: 100vh; }
.y6p .top-actions { display: flex; align-items: center; gap: 18px; }
.y6p .signin { color: #cdd3f2; font-weight: 700; font-size: 15px; text-decoration: none; }
.y6p .signin:hover { color: #fff; }
.y6p footer a { color: inherit; }
@media (max-width: 420px) { .y6p .signin { display: none; } }
`

export default function Year6Page({ signedIn = false }) {
  const navigate = useNavigate()
  const [pricing, setPricing] = useState(null)
  const [showBar, setShowBar] = useState(false)
  const heroCta = useRef(null)

  useEffect(() => { getPlatformSettings('pricing').then(setPricing).catch(() => {}) }, [])
  useEffect(() => {
    const prev = document.title
    document.title = 'Year 6 selective-entry prep · gradefarm.'
    if (!document.querySelector(`link[href="${FONTS_URL}"]`)) {
      const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONTS_URL })
      document.head.appendChild(link)
    }
    return () => { document.title = prev }
  }, [])

  // The sticky bar appears once the hero's button has scrolled away.
  useEffect(() => {
    const el = heroCta.current
    if (!el || !('IntersectionObserver' in window)) { setShowBar(true); return undefined }
    const io = new IntersectionObserver(([e]) => setShowBar(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const monthly = money(planTotal(studentTiers(pricing?.student_monthly_tiers, 'month'), 2))
  const weekly = money(planTotal(studentTiers(pricing?.student_tiers), 2))

  // In-app links without a full page load.
  const go = (e) => {
    const href = e.currentTarget.getAttribute('href')
    if (!href?.startsWith('/') || e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    navigate(href)
    window.scrollTo(0, 0)
  }

  return (
    <div className="y6p">
      <style>{CSS}</style>
      <header className="topbar">
        <div className="in">
          <div className="brand"><img src={IMG.crest} alt="Titanium Tutoring crest" /><div><b>grade<i>farm.</i></b><span>by Titanium Tutoring</span></div></div>
          <div className="top-actions">
            <a className="signin" href={signedIn ? '/home' : '/auth'} onClick={go}>{signedIn ? 'Open gradefarm' : 'Sign in'}</a>
            <a className="cta" href="/readiness-check" onClick={go}>Free readiness check</a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero: the offer is the headline */}
        <section className="band navy">
          <div className="wrap hero">
            <div className="hero-copy">
              <div className="eyebrow">For parents · Year 6 selective-entry prep</div>
              <h1 className="h1">Is your child ready for the selective test? <em>Find out free</em> in 20 questions.</h1>
              <p className="lead">A free readiness check shows what they're strong at and where they'll lose marks. Then 15 minutes a day of practice that finds their level, teaches what they get wrong, and never runs out.</p>
              <a className="cta" href="/readiness-check" onClick={go} ref={heroCta}>Get my child's free readiness check →</a>
              <div className="micro"><span>Free</span><span>No card needed</span><span>Report emailed to you</span></div>
            </div>
            <div>
              <div className="phone" aria-label="Sample readiness report">
                <div className="screen">
                  <div className="app-top"><b>Mia's readiness check</b><span>Year 6 Maths · 20 questions · marked instantly</span></div>
                  <div className="app-body">
                    <div className="score">
                      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="#eceaf2" strokeWidth="8"/><circle cx="32" cy="32" r="27" fill="none" stroke="#f2c04f" strokeWidth="8" strokeLinecap="round" strokeDasharray="118.8 169.6" transform="rotate(-90 32 32)"/></svg>
                      <div><b>14 of 20</b><span>right</span></div>
                    </div>
                    <div className="mini-label">Strong at</div>
                    <div className="rowlist"><div>Ratio and rates <span className="ok">2/2</span></div><div>Percentages <span className="ok">2/2</span></div></div>
                    <div className="mini-label">Work on</div>
                    <div className="rowlist"><div>Index laws <span className="gap">0/2</span></div><div>Equations <span className="gap">1/2</span></div></div>
                    <div className="app-btn">Start practising index laws →</div>
                  </div>
                </div>
              </div>
              <p className="sample">Sample report</p>
            </div>
          </div>
        </section>

        {/* What gradefarm is */}
        <section className="band white" id="what">
          <div className="wrap">
            <div className="what-intro">
              <div className="head">
                <div className="eyebrow">What is gradefarm?</div>
                <h2 className="h2">A practice app that works like a tutor sitting beside your child.</h2>
                <p className="lead">gradefarm is an online maths and English practice app, made by Titanium Tutoring. Your child answers exam-style questions for 15 minutes a day. Every answer tells it a little more about where they are, and it picks the next question to match.</p>
                <div className="facts">
                  <div className="fact"><span className="ic">✓</span><div><b>Works on any laptop, tablet or phone</b><p>Nothing to install. Sign in from the browser.</p></div></div>
                  <div className="fact"><span className="ic">∞</span><div><b>Hundreds of selective-level questions</b><p>Maths and English, with worked solutions, and new ones written whenever they run out.</p></div></div>
                  <div className="fact"><span className="ic">★</span><div><b>An AI tutor, Titan, for when they're stuck</b><p>It coaches with hints and questions, one step at a time.</p></div></div>
                </div>
              </div>
              <figure style={{ margin: '0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="browser"><div className="bar"><i></i><i></i><i></i><span>gradefarm.com.au · Practice</span></div><img src={IMG.homeScreen} alt="gradefarm practice home showing this week's questions, accuracy, streak, daily missions and priority topics" /></div>
                <figcaption className="cap">Your child's home screen: this week's progress, daily missions and the topics to focus on.</figcaption>
              </figure>
            </div>

            <div className="head" style={{ marginTop: '24px' }}>
              <div className="eyebrow">A practice session, step by step</div>
              <h2 className="h2">Here's what happens when your child gets one wrong.</h2>
            </div>
            <div className="walk">
              <figure>
                <div className="shot"><img src={IMG.question} alt="A Year 6 algebra question in gradefarm" style={{ objectPosition: 'top' }} /></div>
                <figcaption><span className="n">1 · A question at their level</span><b>Solve 3(x + 2) = 18</b><span>Each question shows its topic and difficulty, from one to five stars.</span></figcaption>
              </figure>
              <figure>
                <div className="shot"><img src={IMG.workedSolution} alt="The answer marked wrong with a worked solution and a tip" style={{ objectPosition: 'bottom' }} /></div>
                <figcaption><span className="n">2 · Wrong? See why</span><b>Worked solution and a tip</b><span>The right answer, every step of the working, and a short tip about the mistake.</span></figcaption>
              </figure>
              <figure>
                <div className="shot"><img src={IMG.titan} alt="Titan AI coaching the student one step at a time" /></div>
                <figcaption><span className="n">3 · Titan coaches them</span><b>Hints, not answers</b><span>Titan asks questions until your child works it out themselves.</span></figcaption>
              </figure>
              <figure>
                <div className="shot"><img src={IMG.teachingQuestion} alt="A teaching question with the method built into it, at one-star difficulty" style={{ objectPosition: 'bottom' }} /></div>
                <figcaption><span className="n">4 · Still stuck? It teaches</span><b>A teaching question</b><span>Similar questions follow. If they keep missing it, gradefarm drops the difficulty and writes a question that explains the method inside it.</span></figcaption>
              </figure>
            </div>
            <p className="real-note">Real screens from gradefarm. The student is a sample, and the tip and Titan's replies are examples of what the AI writes.</p>
          </div>
        </section>

        {/* Problem */}
        <section className="band">
          <div className="wrap">
            <div className="head">
              <div className="eyebrow">Why it's hard</div>
              <h2 className="h2">You want to help. It's harder than it should be.</h2>
            </div>
            <div className="pains">
              <div className="pain"><h3>The test goes past Year 6.</h3><p>Index laws, Pythagoras, algebra: topics usually taught in high school.</p></div>
              <div className="pain"><h3>The practice runs out.</h3><p>Books have a last page. Past papers are gone by Term 2.</p></div>
              <div className="pain"><h3>You can't explain every mistake.</h3><p>And it isn't taught the way most of us learnt it.</p></div>
            </div>
          </div>
        </section>

        {/* Solution */}
        <section className="band white">
          <div className="wrap" style={{ gap: '64px' }}>
            <div className="head">
              <div className="eyebrow">How gradefarm helps</div>
              <h2 className="h2">It does the parts you can't.</h2>
            </div>

            <div className="feature">
              <div className="ft">
                <div className="k">Finds their level</div>
                <h3>Never bored. Never overwhelmed.</h3>
                <p>Every question has a difficulty from one to five. Get four of the last five right and the next one steps up. Struggle, and it steps back until they're ready.</p>
              </div>
              <div className="fv" aria-label="Difficulty levels">
                <div className="rung"><span className="s">★★★★★</span><span>Hardest</span><span></span></div>
                <div className="rung on"><span className="s">★★★★☆</span><span>Exam-style</span><span className="tag">Mia is here</span></div>
                <div className="rung"><span className="s">★★★☆☆</span><span>Stretch</span><span></span></div>
                <div className="rung"><span className="s">★★☆☆☆</span><span>Where everyone starts</span><span></span></div>
                <div className="rung"><span className="s">★☆☆☆☆</span><span>Back to basics</span><span></span></div>
              </div>
            </div>

            <div className="feature flip">
              <div className="ft">
                <div className="k">Teaches what they get wrong</div>
                <h3>A wrong answer becomes a lesson.</h3>
                <p>They see the worked solution, then similar questions until they get it right on their own. If they keep missing it, the difficulty drops and gradefarm writes a teaching question with the method built in. Titan, our AI tutor, is one tap away with hints.</p>
              </div>
              <div className="fv">
                <div className="q">
                  <div className="top"><span className="badge b-wrong">Got it wrong</span></div>
                  <div className="stem">Simplify 2³ × 2⁴</div>
                  <div className="opts"><span className="opt x">2¹²</span><span className="opt">2⁷</span><span className="opt">4⁷</span><span className="opt">2¹</span></div>
                </div>
                <div className="arrow">↓ next question</div>
                <div className="q">
                  <div className="top"><span className="badge b-teach">Teaching question</span></div>
                  <div className="hint">When you multiply powers with the same base, add the powers: 2³ × 2⁴ = 2³⁺⁴.</div>
                  <div className="stem">So what is 5² × 5³?</div>
                  <div className="opts"><span className="opt ok">5⁵</span><span className="opt">5⁶</span><span className="opt">25⁵</span><span className="opt">10⁵</span></div>
                </div>
              </div>
            </div>

            <div className="feature">
              <div className="ft">
                <div className="k">Never runs out</div>
                <h3>The last page never comes.</h3>
                <p>When your child works through the question bank, gradefarm writes new questions on the spot: on the topic they need, at their level, with worked solutions.</p>
              </div>
              <div className="fv">
                <div className="stackq">
                  <div className="q"><div className="top"><span className="badge b-new">New for Mia</span><span className="s" style={{ color: 'var(--gold-ink)', fontSize: '13px' }}>★★★★☆</span></div><div className="stem">Simplify (3⁴ × 3⁵) ÷ 3⁶</div></div>
                  <div className="q"><div className="top"><span className="badge b-new">New for Mia</span><span className="s" style={{ color: 'var(--gold-ink)', fontSize: '13px' }}>★★★★☆</span></div><div className="stem">If 2ˣ × 2³ = 2¹⁰, what is x?</div></div>
                  <div className="q"><div className="top"><span className="badge b-new">New for Mia</span><span className="s" style={{ color: 'var(--gold-ink)', fontSize: '13px' }}>★★★★★</span></div><div className="stem">Write 8² × 4³ as a single power of 2.</div></div>
                </div>
              </div>
            </div>

            <div className="feature flip">
              <div className="ft">
                <div className="k">Shows you every Sunday</div>
                <h3>Stop asking “did you practise?”</h3>
                <p>One email on Sunday evening: how much they did, how well, and the topic to work on next. Two minutes to read, and you know where things stand.</p>
              </div>
              <div className="fv">
                <div className="mailshot"><img src={IMG.sundayEmail} alt="The weekly progress email a parent receives" /></div>
              </div>
            </div>
          </div>
        </section>

        {/* How the free check works */}
        <section className="band navy" id="check">
          <div className="wrap">
            <div className="head">
              <div className="eyebrow">The free readiness check</div>
              <h2 className="h2">Know where your child stands by tonight.</h2>
            </div>
            <div className="steps">
              <div className="step"><span className="n">1</span><h3>Set it up in two minutes</h3><p>Your email, your child's name and year. No card.</p></div>
              <div className="step"><span className="n">2</span><h3>They answer 20 questions</h3><p>Pitched at selective-test level and marked instantly.</p></div>
              <div className="step"><span className="n">3</span><h3>You get the report</h3><p>What they're strong at, where they'll lose marks, and where to start.</p></div>
            </div>
            <div><a className="cta" href="/readiness-check" onClick={go}>Get my child's free readiness check →</a></div>
          </div>
        </section>

        {/* Founder */}
        <section className="band">
          <div className="wrap founder">
            <img src={IMG.founder} alt="Dr Adhyayan Verma, founder of Titanium Tutoring" />
            <div className="letter">
              <p className="hi">Hi, I'm Dr Adhyayan Verma.</p>
              <p>I'm a doctor, and for the past 7 years I've also tutored maths. The students who did best weren't always the most naturally gifted. They practised the right things every day, with someone catching their mistakes early.</p>
              <p>Most Year 6 students don't get that. So I built gradefarm to give every child that kind of practice, whether or not they have a tutor beside them.</p>
              <p>Start with the free readiness check. If your child is ready, you'll know. If there are gaps, you'll know exactly where to start.</p>
              <div><div className="sig">Dr Adhyayan Verma</div><p style={{ fontSize: '15px' }}>Founder, Titanium Tutoring</p></div>
            </div>
          </div>
        </section>

        {/* Offer */}
        <section className="band white" id="start">
          <div className="wrap">
            <div className="head">
              <div className="eyebrow">Getting started</div>
              <h2 className="h2">Start free. Decide after you've seen the report.</h2>
            </div>
            <div className="offer">
              <div className="plan free">
                <div className="step-l">Step 1 · Today</div>
                <h3 style={{ fontSize: '26px' }}>Free readiness check</h3>
                <div className="price">$0</div>
                <ul className="ticks"><li>20 questions, marked instantly</li><li>Strengths and gaps, emailed to you</li><li>No card needed</li></ul>
                <a className="cta" href="/readiness-check" onClick={go}>Get my child's free check →</a>
              </div>
              <div className="plan paid">
                <div className="step-l">Step 2 · If you'd like to continue</div>
                <h3 style={{ fontSize: '26px' }}>Year 6 Selective Prep</h3>
                <div className="price">{`$${monthly}`}<small> /month</small></div>
                <ul className="ticks"><li>Maths and English, questions that never run out</li><li>Five difficulty levels and teaching questions</li><li>Titan AI help and timed practice papers</li><li>Your progress email every Sunday</li><li>{`$${weekly}`} a week if you prefer · cancel any time</li></ul>
              </div>
            </div>
          </div>
        </section>

        {/* Safety */}
        <section className="band navy">
          <div className="wrap">
            <div className="head"><div className="eyebrow">Safe for 11-year-olds</div><h2 className="h2">Built for children, with you in charge.</h2></div>
            <div className="safe">
              <div><b>You set it up</b><p>The account sits under your email.</p></div>
              <div><b>You switch on the AI</b><p>For under-15s, Titan stays off until a parent confirms.</p></div>
              <div><b>Schoolwork only</b><p>Titan won't chat about anything else or ask for personal details.</p></div>
              <div><b>No ads</b><p>And no public profiles for under-15s.</p></div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="band">
          <div className="wrap narrow">
            <div className="head"><div className="eyebrow">Questions parents ask</div><h2 className="h2">Good questions.</h2></div>
            <div>
              <details><summary>Which tests is this for?</summary><p>Selective and special-entry high school tests that assess maths reasoning, reading, verbal reasoning and writing. Formats differ between schools and states, so check the details of the test your child is sitting. gradefarm builds the skills underneath.</p></details>
              <details><summary>What happens after the free check?</summary><p>You get the report by email. If you'd like to continue, Year 6 Selective Prep is {`$${monthly}`} a month for Maths and English. If not, you can keep using one subject free.</p></details>
              <details><summary>Isn't it too hard for Year 6?</summary><p>It's meant to stretch, but it adapts. Everyone starts at level 2 of 5 and only moves up after getting most of their recent questions right.</p></details>
              <details><summary>How long does it take each day?</summary><p>Fifteen to twenty minutes on most days works better than one long session at the weekend. The Sunday email shows how many days they practised.</p></details>
              <details><summary>Does it replace a tutor?</summary><p>No. It's the daily practice between lessons. If your child has a Titanium Tutoring tutor, they can link up, set work and see progress.</p></details>
              <details><summary>Can I cancel?</summary><p>Yes, any time from My Account.</p></details>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="band navy">
          <div className="wrap narrow final">
            <img src={IMG.crest} alt="" />
            <h2 className="h2">Find out where your child stands. Free, tonight.</h2>
            <a className="cta" href="/readiness-check" onClick={go}>Get my child's free readiness check →</a>
            <div className="micro" style={{ justifyContent: 'center' }}><span>Free</span><span>No card needed</span><span>Report emailed to you</span></div>
          </div>
        </section>
      </main>

      <footer><div className="in"><span>gradefarm. by Titanium Tutoring · Adelaide, South Australia</span><span><a href="/terms" onClick={go}>Terms</a> · <a href="/privacy" onClick={go}>Privacy</a> · <a href={signedIn ? '/home' : '/auth'} onClick={go}>{signedIn ? 'Open gradefarm' : 'Sign in'}</a></span></div></footer>

      <div className={`sticky${showBar ? ' show' : ''}`}><div className="t"><b>Free readiness check</b><br />20 questions · no card</div><a className="cta" href="/readiness-check" onClick={go}>Start free</a></div>
    </div>
  )
}
