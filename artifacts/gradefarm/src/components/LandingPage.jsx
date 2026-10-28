import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X, Zap, GraduationCap, Infinity as InfinityIcon, Users, ClipboardList, BookOpen } from 'lucide-react'
import { usePublicSubjects } from '../lib/publicSubjects'
import { SubjectIconByName } from './SubjectIcons'
import { formatSubjectLabel } from '../lib/subjects'
import { getPlatformSettings } from '../lib/db'
import { studentTiers } from '../lib/pricing'

const GOLD   = '#f4b63f'
const GOLDL  = '#f9d27e'
const GOLDT  = '#9a5b00'   // gold dark enough for text on white
const INK    = '#1d2433'
const PURPLE = '#7c3aed'
const GREEN  = '#059669'
const RED    = '#dc2626'
const ORANGE = '#ea580c'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const BG     = '#fbf7ef'
const TEXT   = INK
const MUTED  = '#6b6357'
const CARD   = '#ffffff'
const LINE   = '#ece5d8'
const SHADOW = '0 1px 2px rgba(29,36,51,0.04), 0 8px 24px rgba(29,36,51,0.06)'

const NAV_LINKS = [['how', 'How it works'], ['who', "Who it's for"], ['subjects', 'Subjects'], ['pricing', 'Pricing']]

/* ─── helpers ─────────────────────────────────────────────────────────── */

// Fades a block in the first time it scrolls into view.
function FadeUp({ children, delay = 0, style = {} }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold: 0.1 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className="lp-fade" style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(16px)', transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`, ...style }}>
      {children}
    </div>
  )
}

// Gold highlighter stroke behind a heading's key words (gold text is too faint on white).
function Mark({ children }) {
  return <span style={{ background: 'linear-gradient(transparent 58%, rgba(244,182,63,0.6) 58%)', padding: '0 3px', WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone' }}>{children}</span>
}

function IconTile({ icon: Icon, rgb, color, size = 40 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 12, background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={size / 2} color={color} aria-hidden="true" />
    </div>
  )
}

/* ─── product visuals ─────────────────────────────────────────────────── */

// A three-question demo of the adaptive loop: a right answer moves up a
// level, a wrong one gets a similar question at the same level.
const DEMO_QUESTIONS = {
  2: [
    { id: '2a', q: 'What is ¾ of 48?', opts: ['36', '32', '24', '12'], a: 0, why: 'A quarter of 48 is 12, so three quarters is 3 × 12 = 36.' },
    { id: '2b', q: 'What is ¾ of 20?', opts: ['16', '15', '12', '5'], a: 1, why: 'A quarter of 20 is 5, so three quarters is 3 × 5 = 15.' },
    { id: '2c', q: 'What is ¾ of 36?', opts: ['24', '9', '27', '30'], a: 2, why: 'A quarter of 36 is 9, so three quarters is 3 × 9 = 27.' },
  ],
  3: [
    { id: '3a', q: 'What is ⅔ of 45?', opts: ['15', '25', '30', '35'], a: 2, why: 'A third of 45 is 15, so two thirds is 2 × 15 = 30.' },
    { id: '3b', q: 'What is ⅖ of 35?', opts: ['14', '7', '21', '10'], a: 0, why: 'A fifth of 35 is 7, so two fifths is 2 × 7 = 14.' },
  ],
  4: [
    { id: '4a', q: 'A recipe uses ⅗ of a 250 g bag of flour. How many grams is that?', opts: ['100 g', '125 g', '150 g', '175 g'], a: 2, why: 'A fifth of 250 g is 50 g, so three fifths is 3 × 50 = 150 g.' },
  ],
}
const DEMO_START_LEVEL = 2
const DEMO_LENGTH = 3

function nextDemoQuestion(level, used) {
  return DEMO_QUESTIONS[level].find(q => !used.includes(q.id))
}

function QuestionFlow() {
  // Each entry: { q, level, picked } — picked is null until answered.
  const [steps, setSteps] = useState(() => [{ q: nextDemoQuestion(DEMO_START_LEVEL, []), level: DEMO_START_LEVEL, picked: null }])
  const [done, setDone] = useState(false)
  const cur = steps[steps.length - 1]
  const answered = cur.picked !== null
  const right = answered && cur.picked === cur.q.a
  const prev = steps.length > 1 ? steps[steps.length - 2] : null
  const prevRight = prev && prev.picked === prev.q.a
  const score = steps.filter(s => s.picked !== null && s.picked === s.q.a).length

  const pick = i => { if (!answered) setSteps(s => [...s.slice(0, -1), { ...cur, picked: i }]) }
  const next = () => {
    if (steps.length >= DEMO_LENGTH) { setDone(true); return }
    const level = right ? Math.min(cur.level + 1, 4) : cur.level
    const used = steps.map(s => s.q.id)
    setSteps(s => [...s, { q: nextDemoQuestion(level, used), level, picked: null }])
  }
  const restart = () => { setSteps([{ q: nextDemoQuestion(DEMO_START_LEVEL, []), level: DEMO_START_LEVEL, picked: null }]); setDone(false) }

  const dotColor = i => {
    const s = steps[i]
    if (!s || s.picked === null) return i === steps.length - 1 && !done ? GOLD : '#ece5d8'
    return s.picked === s.q.a ? GREEN : RED
  }

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ position: 'absolute', inset: '-10%', background: 'radial-gradient(circle,rgba(244,182,63,0.22) 0%,transparent 65%)', filter: 'blur(24px)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 20, border: `1px solid ${LINE}`, boxShadow: '0 24px 60px rgba(29,36,51,0.12)', overflow: 'hidden' }}>
        {/* header: progress + level */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #eef0f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, background: '#fdf0d5', color: '#8a4b00', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>Fractions</span>
            <span style={{ fontSize: 13, color: '#7a7166', fontWeight: 600 }}>{done ? 'Done' : `Question ${steps.length} of ${DEMO_LENGTH}`}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }} aria-hidden="true">
            {Array.from({ length: DEMO_LENGTH }, (_, i) => <span key={i} style={{ width: 22, height: 6, borderRadius: 3, background: dotColor(i), transition: 'background 0.2s' }} />)}
          </div>
        </div>

        {done ? (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: INK, marginBottom: 6 }}>{score} of {DEMO_LENGTH} right</div>
            <div style={{ fontSize: 15, color: '#5c5549', lineHeight: 1.6, marginBottom: 16 }}>That's how every session works. Get one right and the next is harder. Miss one and you get a similar question straight away, and the topic comes back next session.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {steps.map((s, i) => (
                <div key={s.q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#3a3f4b' }}>
                  {s.picked === s.q.a ? <Check size={16} color={GREEN} aria-hidden="true" /> : <X size={16} color={RED} aria-hidden="true" />}
                  <span style={{ flex: 1 }}>{s.q.q}</span>
                  <span style={{ fontSize: 12, color: '#a39a8c', whiteSpace: 'nowrap' }}>Level {s.level}</span>
                </div>
              ))}
            </div>
            <button onClick={restart} style={{ background: 'none', border: '1px solid #ece5d8', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, color: INK, cursor: 'pointer', fontFamily: FONT_B }}>Try again</button>
          </div>
        ) : (
          <div style={{ padding: 24 }}>
            {prev && (
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: prevRight ? '#fff8ea' : '#f5f3ff', color: prevRight ? '#8a4b00' : '#5b21b6' }}>
                {prevRight ? 'You got that right, so this one is a level harder.' : "You missed that one, so here's a similar question."}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: INK, lineHeight: 1.45 }}>{cur.q.q}</div>
              <span style={{ fontSize: 12, color: '#a39a8c', fontWeight: 600, whiteSpace: 'nowrap' }}>Level {cur.level}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {cur.q.opts.map((opt, i) => {
                let bg = '#faf6ee', border = '#ebe3d4', color = '#3a3f4b'
                if (answered && i === cur.q.a)       { bg = '#f0fdf4'; border = '#86efac'; color = '#166534' }
                else if (answered && i === cur.picked) { bg = '#fef2f2'; border = '#fca5a5'; color = '#991b1b' }
                else if (answered)                   { bg = '#fbf8f2'; border = '#efe8dc'; color = '#a39a8c' }
                return (
                  <button key={i} onClick={() => pick(i)} disabled={answered} className={answered ? '' : 'lp-opt'}
                    style={{ background: bg, border: `1px solid ${border}`, color, padding: '12px 14px', borderRadius: 10, fontSize: 15, fontWeight: 600, textAlign: 'left', cursor: answered ? 'default' : 'pointer', fontFamily: FONT_B, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    {opt}
                    {answered && i === cur.q.a && <Check size={16} aria-hidden="true" />}
                    {answered && i === cur.picked && i !== cur.q.a && <X size={16} aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
            {answered ? (
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', fontSize: 14, color: '#3a3f4b', lineHeight: 1.55 }}>
                  <strong style={{ color: right ? '#166534' : '#991b1b' }}>{right ? 'Correct! ' : 'Not quite. '}</strong>{cur.q.why}
                </div>
                <button onClick={next} className="lp-primary" style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: INK, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, whiteSpace: 'nowrap' }}>
                  {steps.length >= DEMO_LENGTH ? 'See result' : 'Next question'} →
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 14, fontSize: 13, color: '#7a7166' }}>Pick an answer. Right answers move you up a level; a wrong one gets you a similar question.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── how-it-works tour ───────────────────────────────────────────────── */

// The product pictures the tour swaps between. They sit in a white "app window".
function TourPractise() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        <span style={{ fontSize: 12, background: '#fdf0d5', color: '#8a4b00', padding: '4px 10px', borderRadius: 20, fontWeight: 700 }}>Year 8 Maths · Fractions</span>
        <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>Level 3 · Question 4 of 10</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginBottom: 18 }}>What is ⅔ of 45?</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {['15', '25', '30', '35'].map((o, i) => (
          <div key={o} style={{ padding: '14px 16px', borderRadius: 10, fontSize: 15, fontWeight: 600, background: i === 2 ? '#fff8ea' : '#faf6ee', border: `1px solid ${i === 2 ? GOLD : '#ebe3d4'}`, color: i === 2 ? '#6e3a00' : '#3a3f4b' }}>{o}</div>
        ))}
      </div>
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: MUTED }}>
        <span>Last 3 right, so you moved up to Level 3</span>
        <span style={{ fontWeight: 700, color: GOLDT }}>+36 XP</span>
      </div>
    </div>
  )
}

function TourTopics() {
  const topics = [['Place value', 91], ['Measurement', 82], ['Fractions', 67], ['Geometry', 58], ['Algebra', 41], ['Probability', 19]]
  const tone = s => s > 75 ? ['#ecfdf5', '#a7f3d0', GREEN] : s > 50 ? ['#fff8ea', '#f8dca0', '#a85f00'] : s > 30 ? ['#fff7ed', '#fed7aa', ORANGE] : ['#fef2f2', '#fca5a5', RED]
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>Your topics · Year 8 Maths</div>
        <span style={{ fontSize: 12, background: '#fdf0d5', color: '#8a4b00', padding: '4px 10px', borderRadius: 20, fontWeight: 700, whiteSpace: 'nowrap' }}>Updated just now</span>
      </div>
      <div className="lp-tour-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {topics.map(([n, s]) => {
          const [bg, bd, c] = tone(s)
          return (
            <div key={n} style={{ padding: 12, borderRadius: 10, background: bg, border: `${s < 30 ? 2 : 1}px solid ${bd}` }}>
              <div style={{ fontSize: 12, color: '#5c5549' }}>{n}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{s}%</div>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, background: INK, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div><div style={{ fontSize: 11, color: GOLD, fontWeight: 800, letterSpacing: '0.06em' }}>UP NEXT</div><div style={{ fontSize: 15, fontWeight: 700 }}>8 questions on Probability</div></div>
        <div style={{ background: GOLD, color: INK, fontWeight: 800, fontSize: 13, padding: '8px 14px', borderRadius: 8, whiteSpace: 'nowrap' }}>Start →</div>
      </div>
    </div>
  )
}

function TourFix() {
  return (
    <div>
      <div style={{ padding: '14px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: RED, marginBottom: 6 }}><X size={15} aria-hidden="true" />Not quite</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginBottom: 4 }}>A recipe uses ⅗ of a 250 g bag of flour. How many grams?</div>
        <div style={{ fontSize: 13, color: '#5c5549' }}>You said 125 g. It's 150 g: one fifth is 50 g, so three fifths is 150 g.</div>
      </div>
      <div style={{ textAlign: 'center', color: PURPLE, fontSize: 18, lineHeight: 1, margin: '10px 0' }} aria-hidden="true">↓</div>
      <div style={{ padding: '14px 16px', borderRadius: 12, background: '#fff', border: '1px solid #ddd6fe', boxShadow: '0 6px 18px rgba(124,58,237,0.08)' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: PURPLE, marginBottom: 8 }}>Here's a similar one</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginBottom: 12 }}>Mia read ⅝ of a 240-page book. How many pages is that?</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {['96', '120', '150', '180'].map((o, i) => (
            <div key={o} style={{ padding: '10px 0', textAlign: 'center', borderRadius: 8, fontSize: 14, fontWeight: 700, background: i === 2 ? '#ecfdf5' : '#faf6ee', border: `1px solid ${i === 2 ? '#86efac' : '#ebe3d4'}`, color: i === 2 ? '#166534' : '#3a3f4b' }}>{o}{i === 2 && ' ✓'}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TourTitan() {
  const you = text => <div style={{ alignSelf: 'flex-end', maxWidth: '80%', fontSize: 14, color: INK, background: '#fdf0d5', border: '1px solid #f8dca0', borderRadius: '14px 14px 4px 14px', padding: '9px 13px' }}>{text}</div>
  const titan = text => (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', maxWidth: '88%' }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#a78bfa,#6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><GraduationCap size={16} color="#fff" aria-hidden="true" /></div>
      <div style={{ fontSize: 14, color: INK, lineHeight: 1.55, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '4px 14px 14px 14px', padding: '9px 13px' }}>{text}</div>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: PURPLE, letterSpacing: '0.06em', marginBottom: 2 }}>TITAN · AI TUTOR</div>
      {you('I got the flour one wrong. How do I do it?')}
      {titan(<>Let's take it one step at a time. ⅗ means 3 lots of one fifth. What's one fifth of 250 g?</>)}
      {you('50 g?')}
      {titan(<>Exactly. So three of those fifths is…?</>)}
      <div style={{ marginTop: 4, alignSelf: 'flex-start', fontSize: 13, fontWeight: 700, color: PURPLE, border: '1px solid #ddd6fe', borderRadius: 999, padding: '7px 14px', background: '#fff' }}>Practise this topic →</div>
    </div>
  )
}

function TourReady() {
  const r = 34, C = 2 * Math.PI * r
  const weeks = [['Wk 1', 34], ['Wk 2', 47], ['Wk 3', 58], ['Wk 4', 81]]
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 22 }}>
        <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
          <svg viewBox="0 0 84 84" style={{ width: 84, height: 84, transform: 'rotate(-90deg)' }} aria-hidden="true">
            <circle cx="42" cy="42" r={r} fill="none" stroke="#f1ebe0" strokeWidth="9" />
            <circle cx="42" cy="42" r={r} fill="none" stroke={GREEN} strokeWidth="9" strokeDasharray={`${C * 0.81} ${C}`} strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: GREEN }}>81%</div>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>Test readiness</div>
          <div style={{ fontSize: 13, color: GREEN, fontWeight: 700, marginTop: 3 }}>Up from 34% four weeks ago</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>Still to work on: Probability</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 120, padding: '0 4px', borderBottom: `1px solid ${LINE}` }}>
        {weeks.map(([w, v], i) => (
          <div key={w} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: i === weeks.length - 1 ? GREEN : MUTED }}>{v}%</span>
            <div style={{ width: '100%', height: `${v}%`, borderRadius: '6px 6px 0 0', background: i === weeks.length - 1 ? GREEN : '#c7f0dd' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, padding: '6px 4px 0' }}>
        {weeks.map(([w]) => <span key={w} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: MUTED }}>{w}</span>)}
      </div>
    </div>
  )
}

const TOUR_STEPS = [
  { title: 'Practise at your level', desc: 'Pick your subject and go. Every question is set at your level, and the level moves with you: get a few right and it steps up.', screen: TourPractise },
  { title: "See exactly where you're weak", desc: 'Every answer is tracked by topic. Your map updates after every question, and your weakest topic comes up next.', screen: TourTopics },
  { title: 'Fix mistakes on the spot', desc: 'Miss a question and you get a similar one straight away, so the fix sticks. The topic comes back next session too.', screen: TourFix },
  { title: 'Get help from Titan', desc: 'Titan, the built-in AI tutor, walks you through any question one step at a time, instead of just giving you the answer.', screen: TourTitan },
  { title: "Know when you're ready", desc: 'Your readiness score climbs as your gaps close, so you know how prepared you are before the test.', screen: TourReady },
]

function HowItWorksTour() {
  const [active, setActive] = useState(0)
  const tabRefs = useRef([])
  const Screen = TOUR_STEPS[active].screen
  // Arrow keys move between tabs, as in any tablist.
  const onKeyDown = e => {
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = (active + d + TOUR_STEPS.length) % TOUR_STEPS.length
    setActive(next)
    tabRefs.current[next]?.focus()
  }
  return (
    <div className="lp-tour" style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 40, alignItems: 'start' }}>
      <div role="tablist" aria-orientation="vertical" aria-label="How gradefarm. works" onKeyDown={onKeyDown} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {TOUR_STEPS.map((s, i) => {
          const on = i === active
          return (
            <button key={s.title} ref={el => { tabRefs.current[i] = el }} role="tab" id={`lp-tab-${i}`} aria-selected={on} aria-controls="lp-tour-panel" tabIndex={on ? 0 : -1}
              onClick={() => setActive(i)} className={on ? '' : 'lp-tab'}
              style={{ display: 'flex', gap: 14, textAlign: 'left', padding: '16px 18px', borderRadius: 14, cursor: 'pointer', fontFamily: FONT_B, background: on ? '#fff' : 'transparent', border: `1px solid ${on ? '#f8dca0' : 'transparent'}`, boxShadow: on ? SHADOW : 'none', transition: 'background 0.2s, border-color 0.2s' }}>
              <span style={{ fontFamily: FONT_D, fontSize: 17, color: on ? GOLDT : '#b0a796', width: 26, flexShrink: 0, paddingTop: 1 }}>{String(i + 1).padStart(2, '0')}</span>
              <span>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: on ? TEXT : MUTED }}>{s.title}</span>
                {on && <span style={{ display: 'block', fontSize: 14, color: MUTED, lineHeight: 1.6, marginTop: 4 }}>{s.desc}</span>}
              </span>
            </button>
          )
        })}
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', inset: '-6% -4%', background: 'radial-gradient(ellipse,rgba(244,182,63,0.2) 0%,transparent 70%)', filter: 'blur(24px)', pointerEvents: 'none' }} />
        <div id="lp-tour-panel" role="tabpanel" aria-labelledby={`lp-tab-${active}`} style={{ position: 'relative', background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, boxShadow: '0 24px 60px rgba(29,36,51,0.12)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 6, padding: '12px 16px', background: '#f3ede2', borderBottom: `1px solid ${LINE}` }} aria-hidden="true">
            {[0, 1, 2].map(i => <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: '#ddd3c2' }} />)}
          </div>
          <div key={active} className="lp-tour-screen" style={{ padding: 28, minHeight: 360 }}>
            <Screen />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── MobileMenu ───────────────────────────────────────────────────────── */

function MobileMenu({ open, onClose, onNavigate, onSignIn }) {
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
      <div style={{ position: 'fixed', top: 64, left: 0, right: 0, zIndex: 99, background: '#fff', boxShadow: SHADOW, borderBottom: `1px solid ${LINE}`, padding: '8px 16px 16px', display: 'flex', flexDirection: 'column' }}>
        {NAV_LINKS.map(([id, label]) => (
          <button key={id} onClick={() => onNavigate(id)} style={{ background: 'none', border: 'none', borderBottom: `1px solid ${LINE}`, color: TEXT, fontSize: 16, fontWeight: 600, fontFamily: FONT_B, textAlign: 'left', cursor: 'pointer', padding: '14px 4px' }}>
            {label}
          </button>
        ))}
        <button onClick={onSignIn} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 16, fontWeight: 600, fontFamily: FONT_B, textAlign: 'left', cursor: 'pointer', padding: '14px 4px' }}>
          Sign in
        </button>
      </div>
    </>
  )
}

/* ─── building blocks ──────────────────────────────────────────────────── */

function Section({ id, children, maxWidth = 1080 }) {
  return (
    <section id={id} className="lp-section" style={{ padding: '96px 32px' }}>
      <div style={{ maxWidth, margin: '0 auto' }}>{children}</div>
    </section>
  )
}

function Heading({ eyebrow, children, sub, center = false }) {
  return (
    <FadeUp style={{ textAlign: center ? 'center' : 'left', marginBottom: 44 }}>
      <div style={{ fontSize: 12, color: GOLDT, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>{eyebrow}</div>
      <h2 className="lp-h2" style={{ fontFamily: FONT_D, fontSize: 'clamp(24px,2.8vw,34px)', letterSpacing: 1, lineHeight: 1.2, margin: 0, color: TEXT }}>{children}</h2>
      {sub && <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.65, margin: center ? '16px auto 0' : '16px 0 0', maxWidth: 1040 }}>{sub}</p>}
    </FadeUp>
  )
}

function PrimaryButton({ onClick, children, large = false }) {
  return (
    <button onClick={onClick} className="lp-primary" style={{ padding: large ? '15px 32px' : '9px 18px', borderRadius: 11, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: INK, fontSize: large ? 16 : 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B, boxShadow: large ? '0 10px 28px rgba(244,182,63,0.35)' : 'none' }}>
      {children}
    </button>
  )
}

function TextLink({ onClick, children, color = TEXT }) {
  return (
    <button onClick={onClick} className="lp-link" style={{ background: 'none', border: 'none', padding: 0, color, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
      {children}
    </button>
  )
}

/* ─── main component ───────────────────────────────────────────────────── */

export default function LandingPage({ onSignIn }) {
  const navigate = useNavigate()
  const subjects = usePublicSubjects()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [pricing, setPricing] = useState(null)
  useEffect(() => { getPlatformSettings('pricing').then(setPricing).catch(() => {}) }, [])
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])
  const tiers = studentTiers(pricing?.student_tiers)
  const freeDaily = pricing?.free_daily_questions ?? 20
  const trialDays = Math.max(0, Math.floor(Number(pricing?.student_trial_days ?? 7)) || 0)
  const tutorPrices = (pricing?.tutor_plans ?? []).map(p => Number(p.price)).filter(n => n > 0)
  const tutorFrom = tutorPrices.length ? Math.min(...tutorPrices) : 29

  // Every "get started" goes to Pricing, which has the free plan as well as the paid ones.
  const getStarted = () => navigate('/pricing')
  const scroll = id => {
    if (id === 'pricing') { navigate('/pricing'); return }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }
  const handleMobileNav = id => { setMenuOpen(false); scroll(id) }

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: FONT_B, overflowX: 'hidden' }}>
      <style>{`
        @font-face { font-family:'Sifonn Pro'; src:url('/SIFONN_PRO.otf') format('opentype'); font-display:swap; }
        * { box-sizing:border-box; }
        .lp-primary { transition:transform 0.15s, box-shadow 0.15s; }
        .lp-primary:hover { transform:translateY(-1px); box-shadow:0 12px 30px rgba(244,182,63,0.45) !important; }
        .lp-nl:hover { color:${INK} !important; }
        .lp-link:hover { text-decoration:underline; text-underline-offset:4px; }
        .lp-card { transition:transform 0.2s, border-color 0.2s, box-shadow 0.2s; }
        .lp-card:hover { transform:translateY(-3px); border-color:rgba(244,182,63,0.55) !important; box-shadow:0 12px 32px rgba(29,36,51,0.09) !important; }
        .lp-opt:hover { border-color:${GOLD} !important; }
        .lp-tab:hover { background:rgba(255,255,255,0.7) !important; }
        .lp-tour-screen { animation:lpTourIn 0.25s ease; }
        @keyframes lpTourIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
        .lp-grid-bg { background-image:linear-gradient(rgba(29,36,51,0.045) 1px,transparent 1px),linear-gradient(90deg,rgba(29,36,51,0.045) 1px,transparent 1px); background-size:48px 48px; -webkit-mask-image:radial-gradient(ellipse at 50% 30%,#000 20%,transparent 70%); mask-image:radial-gradient(ellipse at 50% 30%,#000 20%,transparent 70%); }
        @media (prefers-reduced-motion: reduce) { .lp-fade { opacity:1 !important; transform:none !important; transition:none !important; } .lp-tour-screen { animation:none !important; } }
        @media(max-width:900px) {
          .lp-dnav { display:none !important; }
          .lp-hmenu { display:block !important; }
          .lp-hero { flex-direction:column !important; gap:56px !important; }
          .lp-hero-visual { align-self:stretch; width:100% !important; }
          .lp-3col { grid-template-columns:1fr !important; }
                    .lp-hero-visual { flex:1 1 auto !important; }
          .lp-tour { grid-template-columns:1fr !important; gap:24px !important; }
        }
        @media(max-width:560px) {
          .lp-nav { padding-left:16px !important; padding-right:16px !important; }
          .lp-section { padding:64px 16px !important; }
          .lp-hero-wrap { padding:104px 16px 64px !important; }
          .lp-tag, .lp-badge { display:none !important; }
          .lp-h1 { font-size:clamp(26px,8vw,34px) !important; }
          .lp-tour-grid { grid-template-columns:repeat(2,1fr) !important; }
          .lp-tour-screen { padding:18px !important; min-height:0 !important; }
          .lp-h2 { font-size:clamp(24px,7vw,30px) !important; }
          .lp-cta { padding:40px 20px !important; }
          .lp-footer { flex-direction:column !important; align-items:flex-start !important; padding-left:16px !important; padding-right:16px !important; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="lp-nav" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: scrolled || menuOpen ? 'rgba(255,255,255,0.92)' : 'transparent', backdropFilter: scrolled || menuOpen ? 'blur(14px)' : 'none', borderBottom: `1px solid ${scrolled || menuOpen ? LINE : 'transparent'}`, transition: 'background 0.25s, border-color 0.25s' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: FONT_D, fontSize: 20, letterSpacing: 1 }}>
            <span style={{ color: INK }}>grade</span><span style={{ color: '#e3a21a' }}>farm.</span>
          </span>
          <span className="lp-tag" style={{ fontSize: 11, color: MUTED }}>by Titanium Tutoring</span>
        </div>
        <div className="lp-dnav" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {NAV_LINKS.map(([id, label]) => (
            <button key={id} className="lp-nl" onClick={() => scroll(id)} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: FONT_B }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onSignIn} className="lp-dnav lp-nl" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>Sign in</button>
          <span className="lp-dnav"><PrimaryButton onClick={getStarted}>Get started free</PrimaryButton></span>
          <button
            className="lp-hmenu"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            style={{ display: 'none', background: 'none', border: `1px solid ${LINE}`, borderRadius: 8, color: TEXT, fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '6px 10px' }}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={handleMobileNav} onSignIn={() => { setMenuOpen(false); onSignIn() }} />

      {/* ── HERO: what it is ── */}
      <section className="lp-hero-wrap" style={{ position: 'relative', padding: '152px 32px 112px', overflow: 'hidden' }}>
        <div className="lp-grid-bg" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '8%', right: '8%', width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle,rgba(244,182,63,0.2) 0%,transparent 65%)', pointerEvents: 'none' }} />

        <div className="lp-hero" style={{ position: 'relative', maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 64 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="lp-h1" style={{ fontFamily: FONT_D, fontSize: 'clamp(28px,3.2vw,40px)', letterSpacing: 1, lineHeight: 1.18, margin: '0 0 20px', color: TEXT }}>
              PRACTICE THAT ADAPTS TO <span style={{ whiteSpace: 'nowrap' }}><Mark>EVERY ANSWER.</Mark></span>
            </h1>
            <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.65, margin: '0 0 28px' }}>
              gradefarm. is an online study tool for Australian students, from primary school to Year 12. Every answer decides your next question, so you spend your time on the topics you're weak in until they're strong. An AI tutor explains anything you get wrong.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <PrimaryButton large onClick={getStarted}>Get started free →</PrimaryButton>
              <TextLink onClick={() => scroll('how')} color={MUTED}>See how it works</TextLink>
            </div>
            <div style={{ marginTop: 18, fontSize: 13, color: MUTED, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {['Free plan', 'No credit card', 'Cancel anytime'].map(t => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Check size={14} color={GREEN} aria-hidden="true" />{t}</span>
              ))}
            </div>
          </div>
          <div className="lp-hero-visual" style={{ flex: '0 0 460px', minWidth: 0 }}>
            <QuestionFlow />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS: a click-through tour ── */}
      <Section id="how">
        <Heading eyebrow="How it works" sub="gradefarm. is an adaptive study engine. Click through what it does for you.">
          MORE THAN A <Mark>QUESTION BANK.</Mark>
        </Heading>
        <FadeUp>
          <HowItWorksTour />
        </FadeUp>
      </Section>

      {/* ── WHY: why you need it ── */}
      <Section id="why">
        <Heading eyebrow="Why it works" center sub="Most revision time goes on things you already know. Re-reading notes feels productive, but it doesn't show you what you'd get wrong in a test. gradefarm. does, and puts your time where the marks are.">
          STOP REVISING WHAT YOU <Mark>ALREADY KNOW.</Mark>
        </Heading>
        <div className="lp-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {[
            { icon: InfinityIcon, rgb: '244,182,63', color: GOLDT, title: 'Questions that never run out', desc: "Finish the question bank and new questions are written for your weak topics, checked before you see them." },
            { icon: BookOpen, rgb: '5,150,105', color: GREEN, title: 'Mapped to your syllabus', desc: 'Every question follows the Australian Curriculum, SACE or VCE, so no time is wasted on things you won\'t be tested on.' },
            { icon: Zap, rgb: '124,58,237', color: PURPLE, title: 'Stay motivated', desc: 'XP, ranks and day streaks make a few questions a day a habit, not a chore.' },
          ].map((b, i) => (
            <FadeUp key={b.title} delay={i * 70} style={{ height: '100%' }}>
              <div style={{ height: '100%', background: CARD, border: `1px solid ${LINE}`, boxShadow: SHADOW, borderRadius: 16, padding: 24 }}>
                <IconTile icon={b.icon} rgb={b.rgb} color={b.color} />
                <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, margin: '16px 0 6px' }}>{b.title}</div>
                <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.6 }}>{b.desc}</div>
              </div>
            </FadeUp>
          ))}
        </div>
      </Section>

      {/* ── WHO IT'S FOR ── */}
      <Section id="who">
        <Heading eyebrow="Who it's for" center>
          FOR STUDENTS, <Mark>PARENTS AND TUTORS.</Mark>
        </Heading>
        <div className="lp-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {[
            { icon: GraduationCap, rgb: '244,182,63', color: GOLDT, title: 'Students', desc: 'Practise any time, watch your weak topics turn into strong ones, and climb the leaderboard as you go.', link: 'Get started free', onClick: getStarted },
            { icon: Users, rgb: '5,150,105', color: GREEN, title: 'Parents', desc: 'Set up an account for your child and get a progress email every Sunday. For younger students, the AI tutor stays off until you approve it.', link: 'Year 6 selective-entry prep', onClick: () => navigate('/year-6') },
            { icon: ClipboardList, rgb: '124,58,237', color: PURPLE, title: 'Tutors', desc: `Invite your students, set work that marks itself, and see every student's results in one place. Plans from $${tutorFrom}/month.`, link: 'Sign up as a tutor', onClick: () => navigate('/auth/tutor') },
          ].map((c, i) => (
            <FadeUp key={c.title} delay={i * 80} style={{ height: '100%' }}>
              <div className="lp-card" style={{ height: '100%', background: `linear-gradient(180deg,rgba(${c.rgb},0.08),#fff 60%)`, border: `1px solid rgba(${c.rgb},0.25)`, boxShadow: SHADOW, borderRadius: 18, padding: 26, display: 'flex', flexDirection: 'column' }}>
                <IconTile icon={c.icon} rgb={c.rgb} color={c.color} size={44} />
                <div style={{ fontSize: 19, fontWeight: 800, color: TEXT, margin: '18px 0 8px' }}>{c.title}</div>
                <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.65, marginBottom: 22, flex: 1 }}>{c.desc}</div>
                <div><TextLink onClick={c.onClick} color={c.color}>{c.link} →</TextLink></div>
              </div>
            </FadeUp>
          ))}
        </div>
      </Section>

      {/* ── SUBJECTS & PRICE ── */}
      <Section id="subjects">
        <Heading eyebrow="Subjects" sub="Mapped to the Australian Curriculum, SACE and VCE. New subjects are added all the time.">
          PICK YOUR <Mark>SUBJECT.</Mark>
        </Heading>
        {subjects === null ? (
          <div style={{ fontSize: 14, color: MUTED }}>Loading subjects…</div>
        ) : subjects.length > 0 && (
          <FadeUp style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {subjects.map(s => (
              <button key={s.name} onClick={getStarted} className="lp-card" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 16px', borderRadius: 12, background: '#fff8ea', border: '1px solid #f8dca0', fontSize: 14, fontWeight: 700, color: TEXT, cursor: 'pointer', fontFamily: FONT_B }}>
                <SubjectIconByName name={s.name} color={GOLDT} size={18} />
                {formatSubjectLabel({ name: s.name, stage: s.level })}
              </button>
            ))}
          </FadeUp>
        )}
        <FadeUp style={{ marginTop: 36 }}>
          <div style={{ padding: '22px 24px', borderRadius: 16, background: CARD, border: `1px solid ${LINE}`, borderLeft: `3px solid ${GOLD}`, boxShadow: SHADOW, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 16, color: TEXT, lineHeight: 1.6 }}>
              <strong>Free</strong> for one subject ({freeDaily} questions a day). <strong style={{ color: GOLDT }}>Unlimited</strong> from ${tiers[0]}/week{trialDays > 0 ? `, first ${trialDays} days free` : ''}.
            </div>
            <TextLink onClick={() => navigate('/pricing')} color={GOLDT}>See pricing →</TextLink>
          </div>
        </FadeUp>
      </Section>

      {/* ── FINAL CTA ── */}
      <section className="lp-section" style={{ padding: '24px 32px 112px' }}>
        <FadeUp>
          <div className="lp-cta" style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', textAlign: 'center', padding: '64px 32px', borderRadius: 24, overflow: 'hidden', background: 'linear-gradient(135deg,#fff8ea,#fdf0d5 60%,#fbe6bd)', border: '1px solid #f8dca0' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 300, borderRadius: '50%', background: 'radial-gradient(ellipse,rgba(255,255,255,0.7) 0%,transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative' }}>
              <h2 className="lp-h2" style={{ fontFamily: FONT_D, fontSize: 'clamp(26px,3.6vw,42px)', letterSpacing: 1, lineHeight: 1.15, margin: '0 0 16px', color: TEXT }}>
                READY TO <Mark>START?</Mark>
              </h2>
              <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.65, margin: '0 auto 30px', maxWidth: 820 }}>Your first session takes a few minutes, and it starts working out your weak spots from the first question.</p>
              <PrimaryButton large onClick={getStarted}>Get started free →</PrimaryButton>
            </div>
          </div>
        </FadeUp>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer" style={{ borderTop: `1px solid ${LINE}`, padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: FONT_D, fontSize: 16, letterSpacing: 1 }}><span style={{ color: INK }}>grade</span><span style={{ color: '#e3a21a' }}>farm.</span></span>
          <span style={{ fontSize: 11, color: MUTED }}>by Titanium Tutoring</span>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[['Pricing', '/pricing'], ['Year 6', '/year-6'], ['Privacy', '/privacy'], ['Terms', '/terms']].map(([label, to]) => (
            <button key={to} className="lp-nl" onClick={() => navigate(to)} style={{ background: 'none', border: 'none', padding: 0, color: MUTED, fontSize: 13, cursor: 'pointer', fontFamily: FONT_B }}>{label}</button>
          ))}
        </div>
        <div style={{ fontSize: 13, color: MUTED }}>© 2026 Titanium Tutoring · Adelaide, SA</div>
      </footer>
    </div>
  )
}
