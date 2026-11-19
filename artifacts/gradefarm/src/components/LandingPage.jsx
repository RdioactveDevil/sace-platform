import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowRight, ArrowDown } from 'lucide-react'
import { getPlatformSettings } from '../lib/db'
import { usePublicSubjects } from '../lib/publicSubjects'
import { SUBJECT_GROUPS as GROUPS, groupSubjects } from '../lib/homeSubjects'
import { studentTiers, money } from '../lib/pricing'
import { SITE_CSS, SITE_FONTS, themeVars, SiteNav, SiteFooter, siteFooterLinks, StartButton } from './SiteChrome'
import CitySkyline from './CitySkyline'
import CalmBackground from './CalmBackground'
import TryItBox from './site/TryItBox'
import { HOME_CSS } from './site/homeCss'
import { FEATURE_SLUGS } from './site/features'

// The public homepage (/home), as approved on the design canvas:
//
// 1. Hero: "The adaptive learning system for Australian students." A switch
//    compares four separate things (without) with the four parts of
//    gradefarm. that share what you know (with), using real app screens.
// 2. Try it now: three sample questions that show the engine at work (TryItBox).
// 3. What's inside: four feature cards, each opening its part of /features.
// 4. How it compares, subjects (from the live list, so it follows Admin),
//    free vs paid (from platform settings), questions people ask, a last call
//    to action and the footer.
//
// Styles come from the design (site/homeCss.js, scoped under .gfx) and follow
// the saved light/dark theme through themeVars.

const EXTRA_CSS = `
.gfx .sec { scroll-margin-top: 72px; }
.gfx .hc { color: inherit; text-decoration: none; }
.gfx .wq .mt > span { white-space: nowrap !important; }
/* Hero: six parts and three bits of clutter, messy without gradefarm.; tidy in a 3 x 2 grid with it. */
@media (min-width: 761px) {
  .gfx .stage { height: 490px; }
  .gfx .tile { z-index: 1; }
  .gfx .tile.t4 { left: 9%; top: 262px; transform: rotate(3.5deg); transition-delay: .22s; }
  .gfx .tile.t5 { left: 63%; top: 278px; transform: rotate(-2.5deg); transition-delay: .26s; }
  .gfx .on .tile { width: 31%; }
  .gfx .on .tile.t0 { left: 2%; top: 64px; } .gfx .on .tile.t1 { left: 34.5%; top: 64px; } .gfx .on .tile.t2 { left: 67%; top: 64px; }
  .gfx .on .tile.t3 { left: 2%; top: 228px; } .gfx .on .tile.t4 { left: 34.5%; top: 228px; } .gfx .on .tile.t5 { left: 67%; top: 228px; }
  .gfx .on .tile.t4, .gfx .on .tile.t5 { transform: none; }
  .gfx .tile .b { grid-template-columns: 92px minmax(0, 1fr); gap: 12px; padding: 12px; }
  .gfx .tile .b strong { font-size: 15px; }
  .gfx .tile .b em { font-size: 12.5px; }
  .gfx .cap { top: 448px; }
  /* The clutter sits behind, half hidden or hanging off the edge, and flies off when gradefarm. is on. */
  .gfx .tile.junk { z-index: 0; transition: opacity .45s ease, transform .6s cubic-bezier(.65,0,.25,1); }
  .gfx .tile.junk.x0 { left: -4%; top: 18px; transform: rotate(-7deg); }
  .gfx .tile.junk.x1 { left: 84%; top: 300px; transform: rotate(6deg); }
  .gfx .tile.junk.x2 { left: 31%; top: 196px; transform: rotate(-4deg); }
  .gfx .on .tile.junk { width: 23.5%; opacity: 0; pointer-events: none; }
  .gfx .on .tile.junk.x0 { left: -4%; top: 18px; transform: rotate(-7deg) scale(.97); }
  .gfx .on .tile.junk.x1 { left: 84%; top: 300px; transform: rotate(6deg) scale(.97); }
  .gfx .on .tile.junk.x2 { left: 31%; top: 196px; transform: rotate(-4deg) scale(.97); }
}
@media (max-width: 760px) {
  .gfx .tile.junk { display: none; }
  .gfx .tile.t4 { transform: rotate(1deg); } .gfx .tile.t5 { transform: rotate(-1.2deg); }
  .gfx .on .tile.t4, .gfx .on .tile.t5 { transform: none; }
}
/* ── Hero, Without gradefarm.: wobbling cards, crumpled paper, ink, coffee and stationery ── */
@keyframes gfx-wob { 0% { translate: 0 0; rotate: 0deg; } 50% { translate: 1.5px -2px; rotate: .5deg; } 100% { translate: -1.5px 1px; rotate: -.4deg; } }
@keyframes gfx-snake { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
@keyframes gfx-snake-fade { 0%, 100% { opacity: 0; } 20%, 70% { opacity: 1; } }
.gfx .tile { animation: gfx-wob 5.2s ease-in-out infinite alternate; }
.gfx .tile.t1 { animation-duration: 6.1s; animation-delay: -1.3s; } .gfx .tile.t2 { animation-duration: 4.7s; animation-delay: -2.2s; }
.gfx .tile.t3 { animation-duration: 5.8s; animation-delay: -.6s; } .gfx .tile.t4 { animation-duration: 6.6s; animation-delay: -3s; }
.gfx .tile.t5 { animation-duration: 5.4s; animation-delay: -1.8s; } .gfx .tile.junk { animation-duration: 7s; }
.gfx .on .tile { animation: none; }
/* Crumpled paper: torn-looking edges and creases, smoothed out when you switch. */
.gfx .tile.crumpled { clip-path: polygon(2% 5%, 47% 0, 98% 7%, 95% 47%, 100% 95%, 53% 91%, 3% 100%, 0 51%); }
.gfx .tile.crumpled::after { content: ""; position: absolute; inset: 0; pointer-events: none; transition: opacity .4s;
  background: linear-gradient(118deg, transparent 46%, rgba(12,16,55,.08) 49%, rgba(255,255,255,.55) 50.5%, transparent 53%),
    linear-gradient(28deg, transparent 57%, rgba(12,16,55,.07) 60%, rgba(255,255,255,.5) 61%, transparent 64%),
    linear-gradient(200deg, transparent 30%, rgba(12,16,55,.05) 32%, transparent 35%),
    linear-gradient(160deg, rgba(12,16,55,.05), transparent 45%, rgba(12,16,55,.06)); }
.gfx.dark .tile.crumpled::after { opacity: .28; }
.gfx .on .tile.crumpled { clip-path: polygon(-10% -10%, 50% -10%, 110% -10%, 110% 50%, 110% 110%, 50% 110%, -10% 110%, -10% 50%); }
.gfx .on .tile.crumpled::after { opacity: 0; }
.gfx .tile:not(.junk) { transition: left .7s cubic-bezier(.65,0,.25,1), top .7s cubic-bezier(.65,0,.25,1), width .7s cubic-bezier(.65,0,.25,1), height .7s cubic-bezier(.65,0,.25,1), transform .7s cubic-bezier(.65,0,.25,1), clip-path .6s ease, border-color .4s, background .4s, box-shadow .4s; }
/* Ink on the cards. */
.gfx .doodle { position: absolute; pointer-events: none; }
.gfx .hand { font-family: 'Caveat', 'Segoe Print', cursive; font-weight: 700; color: #2b4fa8; line-height: 1; white-space: nowrap; }
.gfx.dark .hand { color: #8fa9f0; }
/* (.a span would otherwise shrink the handwriting to the card's 13px text) */
.gfx .tile .a .hand { display: inline-block; margin: 0; }
.gfx .tile .a .n0 { right: 12px; bottom: 12px; font-size: 25px; transform: rotate(-6deg); }
.gfx .tile .a .n1 { right: 10px; bottom: 10px; font-size: 24px; color: #d4382c; transform: rotate(-4deg); }
.gfx .tile .a .n5 { right: 12px; bottom: 10px; font-size: 24px; transform: rotate(5deg); }
.gfx .tile .x-mark { right: 10px; bottom: 8px; width: 54px; height: 54px; }
.gfx .tile .strike { left: 12px; top: 52px; width: 70%; height: 16px; }
/* Loose on the desk. */
.gfx .mess { position: absolute; inset: 0; pointer-events: none; transition: opacity .5s ease; }
.gfx .on .mess { opacity: 0; }
.gfx .mess .coffee { position: absolute; left: -13%; top: 236px; width: 230px; z-index: 0; }
.gfx .mess .coffee .spill { fill: rgba(140, 88, 38, .17); }
.gfx .mess .coffee .ring { fill: none; stroke: rgba(118, 70, 28, .33); stroke-width: 5; stroke-dasharray: 230 40; }
.gfx .mess .pencil { position: absolute; left: 3%; top: 436px; width: 200px; transform: rotate(-7deg); z-index: 2; filter: drop-shadow(0 4px 4px rgba(12,16,55,.18)); }
.gfx .mess .pen { position: absolute; right: -9%; top: 150px; width: 170px; transform: rotate(-62deg); z-index: 2; filter: drop-shadow(0 4px 4px rgba(12,16,55,.2)); }
.gfx .mess .eraser { position: absolute; right: 9%; top: 440px; width: 66px; transform: rotate(14deg); z-index: 2; filter: drop-shadow(0 3px 3px rgba(12,16,55,.18)); }
.gfx .mess .loose { left: 54%; top: -2px; font-size: 25px; color: #d4382c; transform: rotate(-5deg); z-index: 2; }
/* "make the switch", pointing at With gradefarm. */
.gfx .swr { position: relative; }
.gfx .switch-note { position: absolute; left: calc(50% + 196px); top: -30px; display: flex; flex-direction: column; align-items: flex-start; font-family: 'Caveat', 'Segoe Print', cursive; font-weight: 700; font-size: 27px; line-height: 1; color: var(--goldt); transform: rotate(-4deg); white-space: nowrap; transition: opacity .35s; pointer-events: none; }
.gfx .switch-note svg { width: 58px; height: 42px; margin: 2px 0 0 -30px; }
.gfx .on .switch-note { opacity: 0; }

/* ── Hero, With gradefarm.: no window, white boxes, a gold line travelling round each ── */
.gfx .frame { display: none; }
.gfx .on .tile { background: var(--card); border-color: var(--line); box-shadow: 0 10px 26px -18px rgba(12,16,55,.35); }
.gfx .snake { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0; transition: opacity .4s; overflow: visible; }
.gfx .snake rect { x: .75px; y: .75px; width: calc(100% - 1.5px); height: calc(100% - 1.5px); fill: none; stroke: var(--gold); stroke-width: 1.6; stroke-linecap: round; stroke-dasharray: 16 84; }
.gfx .on .snake { opacity: 1; transition-delay: .8s; }
.gfx .on .snake rect { animation: gfx-snake 5.5s linear infinite, gfx-snake-fade 5.5s ease-in-out infinite; }
.gfx .on .t1 .snake rect { animation-delay: -1.1s; } .gfx .on .t2 .snake rect { animation-delay: -2.4s; } .gfx .on .t3 .snake rect { animation-delay: -3.6s; }
.gfx .on .t4 .snake rect { animation-delay: -.5s; } .gfx .on .t5 .snake rect { animation-delay: -4.4s; }
/* With gradefarm.: each card is a mini illustration, then its name and one line. */
.gfx .tile .b { display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 12px 14px 14px; }
.gfx .tile .b strong { font-size: 15.5px; font-weight: 800; color: var(--ink); margin-top: 6px; }
.gfx .tile .b em { font-style: normal; font-size: 13px; line-height: 1.4; color: var(--ink2); }
.gfx .il { height: 86px; border-radius: 10px; background: var(--subtle); position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 8px 10px; }
.gfx .il.stack .q { position: absolute; left: 50%; height: 48px; background: var(--card); border: 1px solid var(--line); border-radius: 8px; transform: translateX(-50%); }
.gfx .il.stack .q3 { top: 8px; width: 60%; } .gfx .il.stack .q2 { top: 14px; width: 66%; }
.gfx .il.stack .q1 { top: 20px; width: 72%; height: 58px; padding: 6px 8px; display: flex; flex-wrap: wrap; gap: 4px; }
.gfx .il.stack .q1 i { width: 100%; font-style: normal; font-size: 11px; font-weight: 700; color: var(--ink); }
.gfx .il.stack .q1 span { height: 12px; width: 30%; border-radius: 4px; border: 1px solid var(--line); }
.gfx .il.stack .q1 span.on { border-color: var(--ok); background: var(--ok-bg, var(--okbg)); }
.gfx .il.stack .plus { position: absolute; right: 8px; top: 7px; font-style: normal; font-size: 12px; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: #0c1037; color: #f1be43; }
.gfx .il.chat { flex-direction: column; align-items: stretch; gap: 5px; }
.gfx .il.chat p { margin: 0; font-size: 11px; line-height: 1.3; padding: 5px 8px; border-radius: 9px; max-width: 86%; }
.gfx .il.chat .me { align-self: flex-end; background: var(--card); border: 1px solid var(--line); color: var(--ink); }
.gfx .il.chat .ti { background: #0c1037; color: #fff; } .gfx .il.chat .ti b { display: block; font-size: 10px; color: #f1be43; }
.gfx .il.marks { gap: 12px; justify-content: flex-start; }
.gfx .il.marks .sc { font-size: 34px; font-weight: 800; color: var(--ink); line-height: 1; } .gfx .il.marks .sc small { font-size: 16px; color: var(--muted); }
.gfx .il.marks div { display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 700; }
.gfx .il.marks .y { color: var(--ok); } .gfx .il.marks .n { color: var(--bad); }
.gfx .il.paper .pp { width: 108px; height: 72px; background: #fff; border: 1px solid var(--line2); border-radius: 4px; padding: 6px 7px; display: flex; flex-direction: column; gap: 2px; box-shadow: 4px 4px 0 var(--line); }
.gfx .il.paper .pp .wm { font-size: 9px; color: #0c1037; } .gfx .il.paper .pp b { font-size: 9.5px; color: #0c1037; line-height: 1.2; } .gfx .il.paper .pp small { font-size: 8.5px; color: #64748b; }
.gfx .il.paper .pp i { height: 3px; background: #e3e6f0; border-radius: 2px; } .gfx .il.paper .pp i.s { width: 60%; }
.gfx .il.time .tl { display: flex; align-items: center; width: 100%; }
.gfx .il.time .tl span { flex: 1; text-align: center; font-size: 10.5px; font-weight: 800; color: var(--ink); position: relative; padding-top: 20px; }
.gfx .il.time .tl span::before { content: ""; position: absolute; top: 2px; left: 50%; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: var(--sq3); z-index: 1; }
.gfx .il.time .tl span::after { content: ""; position: absolute; top: 7px; left: 50%; width: 100%; height: 2px; background: var(--sq2); }
.gfx .il.time .tl span:last-child::after { display: none; }
.gfx .il.time .tl span.x::before { background: var(--bad); } .gfx .il.time .tl span.g { color: var(--goldt); }
.gfx .il.bars { flex-direction: column; align-items: stretch; gap: 6px; }
.gfx .il.bars div { display: grid; grid-template-columns: 88px 1fr 30px; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 700; color: var(--ink2); }
.gfx .il.bars i { height: 7px; border-radius: 4px; background: linear-gradient(90deg, var(--sq3) var(--w), var(--sq0) var(--w)); }
.gfx .il.bars i.lo { background: linear-gradient(90deg, var(--bad) var(--w), var(--sq0) var(--w)); }
.gfx .il.bars b { font-size: 10.5px; }
@media (min-width: 761px) {
  /* The hero stays the same size both ways (so the background never moves); the tidy grid sits in the middle of it. */
  .gfx .on .tile { height: 186px; }
  .gfx .on .tile.t0 { top: 28px; } .gfx .on .tile.t1 { top: 28px; } .gfx .on .tile.t2 { top: 28px; }
  .gfx .on .tile.t3 { top: 228px; } .gfx .on .tile.t4 { top: 228px; } .gfx .on .tile.t5 { top: 228px; }
  .gfx .mob-adapt { display: block; position: absolute; left: 0; right: 0; top: 436px; margin: 0; text-align: center; font-size: 17px; font-weight: 700; color: var(--ink); opacity: 0; transition: opacity .4s; pointer-events: none; }
  .gfx .mob-adapt .wm { font-size: 17px !important; }
  .gfx .on .mob-adapt { opacity: 1; transition-delay: .6s; }
}
@media (max-width: 760px) {
  .gfx .mess { display: none; }
  .gfx .switch-note { position: static; flex-direction: row; align-items: center; justify-content: center; gap: 4px; margin-top: 8px; font-size: 22px; transform: none; }
  .gfx .swr { flex-direction: column; align-items: center; }
  .gfx .switch-note svg { width: 34px; height: 26px; margin: 0; transform: rotate(60deg); order: -1; }
}
/* The hero's changing word keeps the width of "adaptive", so the line doesn't jump. */
.gfx .scw-stack { display: inline-grid; vertical-align: bottom; }
.gfx .scw-stack > span { grid-area: 1 / 1; text-align: center; white-space: nowrap; }
.gfx .scw-size { visibility: hidden; }
.gfx .scw-live { transition: color .25s; }
.gfx .scw-live.busy { color: var(--goldt); }
/* Try it now: the box with its explanation cards either side, shown only while their thing is happening. */
@keyframes gfx-lgi-l { from { opacity: 0; transform: translateX(24px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes gfx-lgi-r { from { opacity: 0; transform: translateX(-24px) scale(.96); } to { opacity: 1; transform: none; } }
.gfx .tqrow { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 640px) minmax(0, 1fr); gap: 24px; align-items: start; margin-top: 36px; }
.gfx .tqrow .tq { margin: 0; max-width: none; }
.gfx .side { display: flex; flex-direction: column; gap: 12px; padding-top: 150px; }
.gfx .side.l { align-items: flex-end; } .gfx .side.r { align-items: flex-start; }
.gfx .side .lgi { width: 100%; max-width: 280px; }
.gfx .side.l .lgi { animation: gfx-lgi-l .45s cubic-bezier(.2,1.2,.4,1) both; }
.gfx .side.r .lgi { animation: gfx-lgi-r .45s cubic-bezier(.2,1.2,.4,1) .1s both; }
.gfx .side .lgi.lit { transform: none; }
@media (max-width: 1100px) {
  .gfx .tqrow { grid-template-columns: minmax(0, 1fr); gap: 10px; max-width: 640px; margin-left: auto; margin-right: auto; }
  .gfx .tqrow .tq { order: 1; } .gfx .side.l { order: 2; } .gfx .side.r { order: 3; }
  .gfx .side { padding-top: 0; align-items: stretch !important; }
  .gfx .side .lgi { max-width: none; }
}
/* Try it now: pick a subject first. */
.gfx .pick { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 8px 0 4px; }
.gfx .pk-h { font-size: 21px; font-weight: 800; letter-spacing: -.02em; color: var(--ink); }
.gfx .pk-opts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; width: 100%; }
.gfx .pk { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 72px; padding: 14px 10px; border-radius: 14px; border: 1.5px solid var(--line); background: var(--card); color: var(--ink); text-align: center; cursor: pointer; transition: border-color .2s, background .2s, transform .15s; }
.gfx .pk:hover { border-color: var(--gold); background: var(--sel); transform: translateY(-2px); }
.gfx .pk:active { transform: scale(.98); }
.gfx .pk b { font-size: 18px; font-weight: 800; }
.gfx .prog .subj-tag { padding: 3px 10px; border-radius: 999px; background: var(--sel); border: 1px solid var(--sq2); font-size: 12.5px; font-weight: 800; color: var(--ink); }
/* "gradefarm is the rest.": the wordmark at the heading's own size. */
.gfx .h2 .cmpwm { font-size: 1.08em; letter-spacing: .04em; }
.gfx .end .city { color: var(--city); }
/* The Exam Builder card shows both covers as whole pages, side by side. */
.gfx .hv.covers .cv { width: auto; height: 192px; top: 26px; }
.gfx .hv.covers .cv img { width: auto; height: 100%; }
.gfx .hv.covers .cv.sace { left: auto; right: calc(50% + 6px); }
.gfx .hv.covers .cv.vce { right: auto; left: calc(50% + 6px); top: 30px; }
.gfx .tonext { display: flex; justify-content: center; margin: 36px 0 0; }
.gfx .tonext .try { min-height: 56px; padding: 0 24px; font-size: 16.5px; border-radius: 14px; gap: 8px; }
.gfx .cmp-hint { display: none; }

/* ── Phones ── */
@media (max-width: 760px) {
  .gfx .hero { padding: 36px 0 52px; }
  .gfx.solo .hg { gap: 30px; }
  /* Hero cards: two narrow columns instead of one full-width stack, so all six fit in about a screen. */
  .gfx .stage { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-items: stretch; }
  .gfx .stage .tile, .gfx .on .stage .tile { min-height: 0; border-radius: 12px; }
  .gfx .stage .cap, .gfx .on .stage .mob-adapt { grid-column: 1 / -1; }
  .gfx .stage .cap { margin: 6px 0 0; font-size: 14px; }
  .gfx .on .stage .mob-adapt { margin: 4px 0 0; padding: 12px 14px; font-size: 14px; }
  /* Without: the name and line on top, the scribble underneath so it never sits on the text. */
  .gfx .tile .a { padding: 12px 12px 38px; }
  .gfx .tile .a b { font-size: 13.5px; line-height: 1.25; }
  .gfx .tile .a span { margin-top: 4px; font-size: 12px; line-height: 1.4; }
  .gfx .tile .a .n0, .gfx .tile .a .n1, .gfx .tile .a .n5 { right: 10px; bottom: 9px; font-size: 19px; }
  .gfx .tile .x-mark { right: 8px; bottom: 6px; width: 30px; height: 30px; }
  .gfx .tile .strike { left: 10px; top: 36px; width: 82%; height: 12px; }
  /* With: a smaller drawing, then the name and line. */
  .gfx .tile .b { padding: 8px 8px 12px; gap: 2px; }
  .gfx .tile .b strong { font-size: 13.5px; line-height: 1.25; margin: 6px 4px 0; }
  .gfx .tile .b em { font-size: 12px; line-height: 1.4; margin: 0 4px; }
  .gfx .il { height: 96px; zoom: .74; border-radius: 12px; }
  .gfx .il.stack .q1 { width: 84%; } .gfx .il.stack .q2 { width: 78%; } .gfx .il.stack .q3 { width: 72%; }
  .gfx .il.stack .q1 i { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gfx .il.stack .plus { top: 3px; right: 4px; z-index: 1; }
  .gfx .il.chat p { max-width: 100%; }
  .gfx .il.bars div { grid-template-columns: 86px 1fr 30px; }
  .gfx .ctas2 { margin-top: 22px; gap: 10px; }
  .gfx .ctas2 .try { min-height: 54px; }
  /* The ladder's middle words stay on one line. */
  .gfx .lad div { gap: 10px; padding: 9px 12px; font-size: 13px; }
  .gfx .lad .s { min-width: 70px; font-size: 12px; letter-spacing: .04em; }
  /* The comparison only shows two columns at a time, so say it scrolls. */
  .gfx .cmp-hint { display: block; margin: 18px 0 -28px; text-align: right; font-size: 13px; font-weight: 700; color: var(--muted); }
  /* ── Try it now ── */
  .gfx .tqrow { margin-top: 24px; }
  .gfx .pick { gap: 12px; padding: 4px 0 0; }
  .gfx .pk-h { font-size: 19px; }
  /* The three subjects side by side, names only. */
  .gfx .pk-opts { gap: 8px; }
  .gfx .pk { min-height: 56px; padding: 10px 6px; }
  .gfx .pk b { font-size: 15px; line-height: 1.2; }
  .gfx .top { padding-bottom: 12px; row-gap: 8px; }
  .gfx .prog { flex-wrap: wrap; gap: 6px 8px; font-size: 12.5px; }
  .gfx .prog .subj-tag { padding: 2px 9px; font-size: 12px; }
  .gfx .cbp { white-space: nowrap; font-size: 12px; padding: 3px 9px; }
  .gfx .diff { font-size: 12px; } .gfx .diff .star { font-size: 16px; } .gfx .diff b { font-size: 12.5px; }
  .gfx .stem { margin-top: 14px; font-size: 18px; }
  .gfx .opts { gap: 8px; margin-top: 14px; }
  .gfx .opts.short { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gfx .opt { min-height: 50px; gap: 10px; padding: 8px 12px; font-size: 18px; }
  .gfx .opt .k { width: 24px; height: 24px; border-radius: 6px; font-size: 11.5px; }
  .gfx .res { margin-top: 14px; }
  .gfx .rh { gap: 8px; }
  .gfx .ic { width: 44px; height: 44px; } .gfx .ic svg { width: 22px; height: 22px; }
  .gfx .rt b { font-size: 20px; } .gfx .rt > span { font-size: 15px; }
  .gfx .nx { margin-top: 12px; padding: 10px 12px; } .gfx .nx b { font-size: 15px; } .gfx .nx .nm { font-size: 12.5px; }
  .gfx .ra { margin-top: 14px; gap: 10px; }
  .gfx .lgi b { font-size: 14px; } .gfx .lgi span { font-size: 12.5px; }
  .gfx .skip { margin-top: 14px; }
  .gfx .tonext { margin-top: 24px; }
  .gfx .fin h3 { font-size: 23px; } .gfx .fin > p { font-size: 14.5px; } .gfx .fin > p .wm { font-size: 14.5px; }
  .gfx .frows { gap: 8px; margin-top: 16px; }
  .gfx .frow { padding: 10px 12px; } .gfx .frow span { font-size: 12.5px; } .gfx .frow b { font-size: 14px; }
  .gfx .fbtn { flex-direction: column; gap: 10px; margin-top: 18px; }
  .gfx .fbtn .lp-btn, .gfx .fbtn .btn { width: 100%; justify-content: center; }
  /* Pricing buttons side by side, filling the row. */
  .gfx .pcta { flex-wrap: nowrap; }
  .gfx .pcta .btn { flex: 1; justify-content: center; }
}
@media (max-width: 360px) {
  .gfx .stage { gap: 8px; }
  .gfx .il { zoom: .68; }
}
`

/** The four parts of gradefarm. in the hero: what they replace, and the real screen. */
// Each part's mini illustration (a tiny drawn piece of the feature), shown above its name.
const ILLUS = {
  bank: (
    <div className="il stack"><div className="q q3" /><div className="q q2" /><div className="q q1"><i>Differentiate 𝑦 = 𝑥³ − 2𝑥</i><span /><span /><span className="on" /></div><em className="plus">+10</em></div>
  ),
  tutor: (
    <div className="il chat"><p className="me">Why × 2?</p><p className="ti"><b>Titan</b>What’s the derivative of the inside?</p></div>
  ),
  examiner: (
    <div className="il marks"><b className="sc">2<small>/3</small></b><div><span className="y">✓ Hydrogen bonding</span><span className="y">✓ Dispersion forces</span><span className="n">✗ Why it boils higher</span></div></div>
  ),
  builder: (
    <div className="il paper"><div className="pp"><span className="wm">grade<span>farm.</span></span><b>Mathematical Methods</b><small>Exam 2 · 2 hours</small><i /><i /><i className="s" /></div></div>
  ),
  spaced: (
    <div className="il time"><div className="tl"><span className="x">Miss</span><span>1 hr</span><span>2 days</span><span>1 wk</span><span className="g">1 mth</span></div></div>
  ),
  progress: (
    <div className="il bars"><div><span>Expected value</span><i className="lo" style={{ '--w': '17%' }} /><b>17%</b></div><div><span>Log laws</span><i style={{ '--w': '40%' }} /><b>40%</b></div><div><span>Integrals</span><i style={{ '--w': '60%' }} /><b>60%</b></div></div>
  ),
}
const PARTS = [
  { k: 'bank', name: 'The Infinity Bank', what: 'A bank that never runs out of questions.', old: ['Textbook questions', 'The same 30 questions, answers in the back.'] },
  { k: 'tutor', name: 'Titan The Tutor', what: 'Run through specific questions, or 10-minute lessons at your convenience.', old: ['Tutor, Tuesdays 4 pm', 'Great, for an hour a week.'] },
  { k: 'examiner', name: 'The Examiner', what: 'Your answers annotated and graded mark by mark.', old: ['Waiting for marks', 'Your teacher marks it next week.'] },
  { k: 'builder', name: 'The Exam Builder', what: 'Build exact replicas of your exam, with questions taken from past papers.', old: ['Past papers (PDF)', 'Printed, half done, never marked.'] },
  { k: 'spaced', name: 'Spaced Repetition', what: 'Never forget another topic.', old: ['Flashcards', 'Made once, never looked at again.'] },
  { k: 'progress', name: 'Progress', what: 'Play to your strengths, improve your weaknesses.', old: ['Study planner', 'A to-do list you gave up on in week 3.'] },
]
/** Clutter that only exists without gradefarm.: half hidden, and gone when it's on. */
const CLUTTER = [['Sticky notes', 'Formula sheet on the fridge.'], ['YouTube, 1 am', 'Six videos watched. No questions done.'], ['Group chat', 'Anyone got the answers to Q12?']]

// The hero's "adaptive": on load it scrambles through "smart" and "personal"
// and settles back on "adaptive" (about 7 seconds), then stays still. Hovering
// plays it again. Screen readers and reduced motion only ever get "adaptive".
const HEADLINE_WORDS = ['adaptive', 'smart', 'personal', 'adaptive']
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const SCRAMBLE_MS = 650
const HOLD_MS = 1900

function ScrambleWord() {
  const [text, setText] = useState(HEADLINE_WORDS[0])
  const [busy, setBusy] = useState(false)
  const timers = useRef([])
  const running = useRef(false)
  const stop = () => { timers.current.forEach(t => clearTimeout(t)); timers.current = [] }
  const wait = (fn, ms) => timers.current.push(setTimeout(fn, ms))

  const scramble = (to, done) => {
    const start = performance.now()
    const frame = () => {
      const p = Math.min(1, (performance.now() - start) / SCRAMBLE_MS)
      const fixed = Math.floor(p * to.length)
      setText(Array.from(to, (c, i) => (i < fixed ? c : LETTERS[Math.floor(Math.random() * 26)])).join(''))
      if (p < 1) wait(frame, 55)
      else done()
    }
    frame()
  }
  const play = () => {
    if (running.current) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    running.current = true
    setBusy(true)
    const step = (i) => scramble(HEADLINE_WORDS[i], () => {
      if (i === HEADLINE_WORDS.length - 1) { setBusy(false); running.current = false; return }
      setBusy(false)
      wait(() => { setBusy(true); step(i + 1) }, HOLD_MS)
    })
    step(0)
  }
  useEffect(() => {
    wait(play, 500)
    return () => { stop(); running.current = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span className="scw" onMouseEnter={play}>
      <span className="lp-sr">{HEADLINE_WORDS[0]}</span>
      <span className="scw-stack" aria-hidden="true">
        <span className="scw-size">{HEADLINE_WORDS[0]}</span>
        <span className={`scw-live${busy ? ' busy' : ''}`}>{text}</span>
      </span>
    </span>
  )
}

const Wordmark = ({ size }) => <span className="wm" style={size ? { fontSize: size } : undefined}>grade<span>farm.</span></span>

// Hand-drawn bits for the messy "Without gradefarm." side (all decoration, hidden from screen readers).
const INK = { red: '#d4382c', blue: '#2b4fa8' }
const Cross = () => <svg className="doodle x-mark" viewBox="0 0 60 60"><path d="M10 12 C 24 26, 36 38, 50 50 M50 10 C 38 24, 24 38, 9 50" fill="none" stroke={INK.red} strokeWidth="5" strokeLinecap="round" /></svg>
const Strike = () => <svg className="doodle strike" viewBox="0 0 200 20" preserveAspectRatio="none"><path d="M4 12 C 50 6, 120 16, 196 8" fill="none" stroke={INK.red} strokeWidth="3" strokeLinecap="round" /></svg>
const Note = ({ children, className = '' }) => <span className={`doodle hand ${className}`}>{children}</span>
// What's scrawled on each card, by index (Textbook, Tutor, Waiting for marks, Past papers, Flashcards, Study planner).
const DOODLES = {
  0: <Note className="n0">pg 47??</Note>,
  1: <Note className="n1">cancelled again</Note>,
  3: <Cross />,
  5: <><Strike /><Note className="n5">start Monday</Note></>,
}
const CRUMPLED = new Set([2, 4])

function DeskMess() {
  return (
    <div className="mess" aria-hidden="true">
      <svg className="coffee" viewBox="0 0 220 170">
        <path className="spill" d="M34 78 C 18 46, 62 22, 96 38 C 128 12, 184 32, 172 68 C 204 88, 184 132, 140 122 C 118 152, 62 152, 54 126 C 20 130, 8 98, 34 78 Z" />
        <circle className="spill" cx="196" cy="40" r="7" /><circle className="spill" cx="20" cy="146" r="5" /><circle className="spill" cx="160" cy="150" r="4" />
        <circle className="ring" cx="104" cy="82" r="48" />
      </svg>
      <svg className="pencil" viewBox="0 0 230 26">
        <polygon points="0,13 22,3 22,23" fill="#e9cfa2" /><polygon points="0,13 8,9.5 8,16.5" fill="#3a3a44" />
        <rect x="22" y="3" width="168" height="20" fill="#f1be43" /><rect x="22" y="3" width="168" height="6" fill="#f7d77e" />
        <rect x="190" y="2" width="10" height="22" fill="#b9bdc9" /><rect x="200" y="2" width="26" height="22" rx="5" fill="#f2a1ad" />
      </svg>
      <svg className="pen" viewBox="0 0 200 24">
        <polygon points="0,12 14,7 14,17" fill="#1b1f3a" /><rect x="14" y="5" width="120" height="14" rx="4" fill="#20285e" />
        <rect x="132" y="3" width="64" height="18" rx="6" fill="#2d3780" /><rect x="140" y="0" width="44" height="5" rx="2" fill="#b9bdc9" />
      </svg>
      <svg className="eraser" viewBox="0 0 90 44">
        <rect x="2" y="4" width="86" height="36" rx="7" fill="#f6b3bd" /><rect x="40" y="4" width="48" height="36" rx="2" fill="#5d7fd1" />
        <rect x="2" y="30" width="86" height="10" rx="5" fill="rgba(0,0,0,.08)" />
      </svg>
      <span className="doodle hand loose">due tomorrow!!</span>
    </div>
  )
}

/** The travelling gold line round a feature box (With gradefarm.). */
const Snake = () => <svg className="snake" aria-hidden="true"><rect pathLength="100" rx="13" /></svg>

function Hero({ theme, onStart, onTry }) {
  const [on, setOn] = useState(false)
  return (
    <header className="hero">
      {/* Drifting gold glows and waves, the same calm background as sign-in. */}
      <CalmBackground theme={theme} contained />
      <div className="in hg">
        <div>
          <h1 className="h1"><span className="s">The <ScrambleWord /> learning system for Australian students.</span></h1>
        </div>
        <div className={on ? 'on' : ''}>
          <div className="swr">
            <div className={`sw${on ? ' on' : ''}`} role="group" aria-label="Compare">
              <span className="thumb" aria-hidden="true" />
              <button type="button" aria-pressed={!on} onClick={() => setOn(false)}>Without gradefarm.</button>
              <button type="button" aria-pressed={on} onClick={() => setOn(true)}>With gradefarm.</button>
            </div>
            <span className="switch-note" aria-hidden="true">
              make the switch
              <svg viewBox="0 0 70 50"><path d="M62 6 C 50 30, 30 40, 8 40 M8 40 L 18 32 M8 40 L 17 47" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </div>
          <div className="stage">
            <DeskMess />
            {PARTS.map((p, i) => (
              <div key={p.name} className={`tile t${i}${CRUMPLED.has(i) ? ' crumpled' : ''}`}>
                <div className="a" aria-hidden={on}><b>{p.old[0]}</b><span>{p.old[1]}</span>{DOODLES[i] && <span aria-hidden="true">{DOODLES[i]}</span>}</div>
                <div className="b" aria-hidden={!on}>
                  <div aria-hidden="true">{ILLUS[p.k]}</div>
                  <strong>{p.name}</strong><em>{p.what}</em>
                </div>
                <Snake />
              </div>
            ))}
            <p className="mob-adapt"><Wordmark size={15} /> identifies what you already know and what you need to work on.</p>
            {CLUTTER.map(([name, what], i) => <div key={name} className={`tile junk x${i}${i === 2 ? ' crumpled' : ''}`} aria-hidden={on}><div className="a"><b>{name}</b><span>{what}</span></div></div>)}
            <p className="cap">All separate. None of them knows what you got wrong.</p>
          </div>
          <div className="ctas2">
            <StartButton onClick={onStart} />
            <a className="btn lg try" href="#try" onClick={onTry}>Try it now<ArrowDown size={18} strokeWidth={2.6} aria-hidden="true" /></a>
          </div>
        </div>
      </div>
    </header>
  )
}

const MORE = <span className="more">See how it works<ArrowRight className="ar" aria-hidden="true" /></span>

function Inside({ open }) {
  const card = (slug) => ({ className: 'card hc', href: `/features#${slug}`, onClick: (e) => { e.preventDefault(); open(slug) } })
  return (
    <section className="sec pg" id="inside" aria-labelledby="gfx-inside-h">
      <div className="in">
        <div className="shd">
          <h2 className="h2" id="gfx-inside-h">What's inside.</h2>
          <a className="link" href="/features" onClick={(e) => { e.preventDefault(); open() }}>See every feature</a>
        </div>
        <div className="hgrid">
          <a {...card(FEATURE_SLUGS[0])}>
            <div className="hv" aria-hidden="true">
              <div className="mm iqv">
                <div className="mm-h"><span className="lab">Questions left at ★★★</span><span className="lab">Your level <b className="stars">★★★☆☆</b></span></div>
                <div className="iqs">
                  <span className="sq s2" /><span className="sq s2" />
                  {Array.from({ length: 10 }, (_, i) => <span key={i} className="sq nw" style={{ '--i': i }} />)}
                </div>
                <div className="iqt"><span className="a">Only 2 left at ★★★. Writing 10 more.</span><span className="b">10 new questions added at ★★★.</span></div>
              </div>
            </div>
            <div className="hb">
              <h3>Infinite Questions</h3>
              <p>When you're running low, it writes 10 more at your level and adds them to the session you're in.</p>
              {MORE}
            </div>
          </a>
          <a {...card(FEATURE_SLUGS[1])}>
            <div className="hv" aria-hidden="true">
              <div className="lad">
                <div className="r4"><span className="s">★★★★☆</span>Exam-style<i>You're here</i></div>
                <div className="r3"><span className="s">★★★☆☆</span>Stretch<i>You're here</i></div>
                <div className="r2"><span className="s">★★☆☆☆</span>Where everyone starts<i>You're here</i></div>
              </div>
            </div>
            <div className="hb">
              <h3>Adaptive Difficulty</h3>
              <p>Your last five answers set the level of the next question, from one star to five.</p>
              {MORE}
            </div>
          </a>
          <a {...card(FEATURE_SLUGS[3])}>
            <div className="hv shot" aria-hidden="true"><img src="/home/review.jpg" alt="" loading="lazy" /></div>
            <div className="hb">
              <h3>Spaced Repetition</h3>
              <p>Anything you miss comes back an hour later, then days, then weeks, until it sticks.</p>
              {MORE}
            </div>
          </a>
          <a {...card(FEATURE_SLUGS[4])}>
            <div className="hv covers" aria-hidden="true">
              <figure className="cv sace"><span className="cvt">SACE</span><img src="/home/exam-sace.jpg" alt="" loading="lazy" /></figure>
              <figure className="cv vce"><span className="cvt">VCE</span><img src="/home/exam-vce.jpg" alt="" loading="lazy" /></figure>
            </div>
            <div className="hb">
              <h3>The Exam Builder</h3>
              <p>A full practice exam from real past and trial papers, laid out like your SACE or VCE exam. Print it, sit it, then mark it.</p>
              {MORE}
            </div>
          </a>
        </div>
      </div>
    </section>
  )
}

const COMPARE = [
  ['Questions at your level', 'Whatever’s in the chapter', 'One fixed set', 'Only if you ask the right way', 'For an hour a week', 'Every question, automatically'],
  ['Runs out', 'Yes', 'Once you’ve seen the answers', 'Never, but it doesn’t know your course', 'When the lesson ends', 'Never'],
  ['Brings back what you got wrong', 'No', 'No', 'No', 'When there’s time', 'An hour, days, then weeks later'],
  ['Full practice exams', 'No', 'Until you’ve done them all', 'No', 'Sometimes', 'On demand, from real papers'],
  ['Help at 11 pm', 'No', 'No', 'Yes', 'Not usually', 'Titan, any time'],
]
// The cells that count against the option (shown faint).
const BAD = { 'Runs out': [0, 1, 3], 'Brings back what you got wrong': [0, 1, 2], 'Full practice exams': [0, 2], 'Help at 11 pm': [0, 1, 3] }

function Compare() {
  return (
    <section className="sec" id="compare" aria-labelledby="gfx-cmp-h">
      <div className="in">
        <h2 className="h2" id="gfx-cmp-h">Your textbook has the questions. Your tutor has an hour a week. <span className="wm cmpwm">grade<span>farm</span></span> is the rest.</h2>
        <p className="cmp-hint" aria-hidden="true">Swipe to compare →</p>
        <div className="card cmp">
          <table>
            <thead><tr><th><span className="lp-sr">What</span></th><th>Textbook</th><th>Past papers</th><th>ChatGPT</th><th>Tutor</th><th className="gf"><Wordmark size={15} /></th></tr></thead>
            <tbody>
              {COMPARE.map(([what, ...cells]) => (
                <tr key={what}>
                  <th scope="row">{what}</th>
                  {cells.slice(0, 4).map((c, i) => <td key={i} className={(BAD[what] || []).includes(i) ? 'no' : undefined}>{c}</td>)}
                  <td className="gf">{cells[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

// Built from the live subject list (GET /api/public-subjects): making a
// subject live in Admin adds it here; archiving it removes it.
function Subjects({ onPick }) {
  const live = usePublicSubjects() // null while loading, [] if it can't be reached
  const grouped = groupSubjects(live)
  const shown = GROUPS.filter(g => grouped[g.id].length > 0)
  const pick = (e) => { e.preventDefault(); onPick() }
  return (
    <section className="sec pg" id="subjects" aria-labelledby="gfx-subj-h">
      <div className="in">
        <h2 className="h2" id="gfx-subj-h">Subjects</h2>
        {live === null ? (
          <p className="lp-muted" style={{ marginTop: 20, textAlign: 'center' }}>Loading subjects…</p>
        ) : shown.length === 0 ? (
          <p style={{ marginTop: 20, textAlign: 'center' }}><a className="link" href="/pricing" onClick={pick}>See the subjects you can start with</a></p>
        ) : (
          <div className="subjs">
            {shown.map(g => (
              <div key={g.id} className="card subj">
                <div className="hd"><b>{g.title}</b>{g.note && <span>{g.note}</span>}</div>
                {grouped[g.id].map(x => <a key={x.name + x.level} href="/pricing" onClick={pick}><span>{x.name}</span><small>{x.level}</small></a>)}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default function LandingPage({ theme = 'light', onToggleTheme, onSignIn }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [pricing, setPricing] = useState(null)
  useEffect(() => { getPlatformSettings('pricing').then(setPricing).catch(() => {}) }, [])
  const weekly = studentTiers(pricing?.student_tiers)[0]
  const monthly = studentTiers(pricing?.student_monthly_tiers, 'month')[0]
  const freeDaily = pricing?.free_daily_questions ?? 20
  const freeAi = pricing?.free_daily_ai_messages ?? 10
  const freeMarked = typeof pricing?.free_daily_marked_answers === 'number' && pricing.free_daily_marked_answers >= 0 ? Math.floor(pricing.free_daily_marked_answers) : 5

  // Starting goes to Pricing, where a student picks free or paid.
  const start = () => navigate('/pricing')
  const signUp = () => navigate('/auth', { state: { mode: 'signup' } })
  const openFeatures = (slug) => navigate(slug ? `/features#${slug}` : '/features')
  const go = (id) => {
    if (id === 'pricing') return navigate('/pricing')
    if (id === 'how' || id === 'features') return openFeatures()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }
  // Other pages link to a section here with navigate('/home', { state: { scrollTo } }).
  const scrollTo = location.state?.scrollTo
  // Otherwise open at the top (the router keeps the last page's scroll).
  useEffect(() => { if (!scrollTo) window.scrollTo(0, 0) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!scrollTo) return
    requestAnimationFrame(() => go(scrollTo))
    navigate(location.pathname, { replace: true, state: null })
  }, [scrollTo]) // eslint-disable-line react-hooks/exhaustive-deps
  const NAV = [['Features', () => openFeatures()], ['Subjects', () => go('subjects')], ['Pricing', () => go('pricing')]]
  const dark = theme === 'dark'

  return (
    <div className={`lp gfx solo${dark ? ' dark' : ''}`} style={{ ...themeVars(theme), colorScheme: dark ? 'dark' : 'light' }}>
      <style>{SITE_FONTS + SITE_CSS + HOME_CSS + EXTRA_CSS}</style>
      <SiteNav theme={theme} onToggleTheme={onToggleTheme} onSignIn={onSignIn} onStart={start}
        onLogo={() => window.scrollTo({ top: 0, behavior: 'smooth' })} links={NAV} />

      <main>
        <Hero theme={theme} onStart={start} onTry={(e) => { e.preventDefault(); go('try') }} />
        <TryItBox onStart={start} onNext={(e) => { e.preventDefault(); go('inside') }} />
        <Inside open={openFeatures} />
        <Compare />
        <Subjects onPick={start} />

        <section className="sec" id="pricing" aria-labelledby="gfx-price-h">
          <div className="in">
            <h2 className="h2" id="gfx-price-h">Why upgrade?</h2>
            <div className="card ptab">
              <table>
                <thead><tr><th><span className="lp-sr">What you get</span></th><th>Free</th><th className="pd">Paid</th></tr></thead>
                <tbody>
                  <tr><th>Subjects</th><td>One, swap any time</td><td className="pd">Any you add</td></tr>
                  <tr><th>Questions a day</th><td>{freeDaily}</td><td className="pd">No limit</td></tr>
                  <tr><th>Titan messages a day</th><td>{freeAi}</td><td className="pd">No limit</td></tr>
                  <tr><th>Written answers marked a day</th><td className={freeMarked ? undefined : 'no'}>{freeMarked || 'No'}</td><td className="pd">No limit</td></tr>
                  <tr><th>Exam mode and printable exams</th><td className="no">No</td><td className="pd">Yes</td></tr>
                  <tr><th>Price</th><td>$0</td><td className="pd">${money(weekly)} a week, or ${money(monthly)} a month</td></tr>
                </tbody>
              </table>
            </div>
            <div className="pcta">
              <button type="button" className="btn gold lg" onClick={signUp}>Start free</button>
              <button type="button" className="btn lg" onClick={start}>Build your plan</button>
            </div>
          </div>
        </section>

        <section className="sec pg" id="questions" aria-labelledby="gfx-faq-h">
          <div className="in">
            <h2 className="h2" id="gfx-faq-h">Questions people ask</h2>
            <div className="faq">
              <details open><summary>Are the questions really unlimited?</summary><p>On a paid plan, yes. When you're running low, gradefarm. writes more at your level and adds them to your session while you keep going. The free plan is one subject and {freeDaily} questions a day.</p></details>
              <details><summary>Can't I just use ChatGPT?</summary><p>ChatGPT will write you questions, but it doesn't know your course, remember what you got wrong, or bring it back before you forget. gradefarm. does, and it marks written answers the way your exam does.</p></details>
              <details><summary>Does it follow my course?</summary><p>Yes. Each subject is built from its official course, and every question sits under one of its topics.</p></details>
              <details><summary>What if a question looks wrong?</summary><p>Every question shows the full working. If one ever looks wrong, tap Report and it's checked and fixed.</p></details>
              <details><summary>Does it work on my phone?</summary><p>Yes. It's a website, so it works on your phone, laptop or school computer with nothing to install, and your progress follows you.</p></details>
            </div>
          </div>
        </section>

        <section className="end" aria-labelledby="gfx-end-h">
          <div className="calm" aria-hidden="true"><span className="glow a" /><span className="glow b" /></div>
          <div className="in">
            <h2 id="gfx-end-h">Start with one subject, free.</h2>
            <StartButton onClick={start} />
          </div>
          <CitySkyline state="SA" className="city" />
        </section>
      </main>

      <SiteFooter links={siteFooterLinks(navigate, go)} />
    </div>
  )
}
