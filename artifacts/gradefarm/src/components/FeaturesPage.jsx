import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { SITE_CSS, SITE_FONTS, themeVars, SiteNav, SiteFooter, siteFooterLinks, StartButton } from './SiteChrome'
import CitySkyline from './CitySkyline'
import { FEATURES_CSS } from './site/featuresCss'
import { FEATURES, featureFromHash } from './site/features'
import { CURVE_CRAM, CURVE_GF } from './site/curves'

// The Features tab (/features), as approved on the design canvas: a list of
// the nine features beside one panel. Each panel says what the feature does,
// how the engine decides, and shows it working with a sample student. The URL
// hash picks the panel (/features#comeback-mode), so the homepage's cards
// open the right one. Styles: site/featuresCss.js, scoped under .gfx.

const EXTRA_CSS = `
.gfx .end .city { color: var(--city); }
.gfx .link { display: inline-flex; align-items: center; gap: 6px; }
.gfx .fhead .fh1, .gfx .fp-h { text-align: center; }
.gfx .fhead { padding-bottom: 72px; }
@media (max-width: 760px) { .gfx .fhead { padding-bottom: 44px; } }
.gfx .fp-h { margin-bottom: 10px; }
.gfx .fp .ex { text-align: center; margin-left: auto; margin-right: auto; max-width: 46ch; text-wrap: balance; }
/* The source chips' tick boxes share .bx with the Ranks cards; keep them small. */
.gfx .chip .bx { padding: 0; flex-shrink: 0; display: inline-block; }
/* Comeback Mode's session strip fits a phone-width card. */
@media (max-width: 480px) {
  .gfx .cbg { grid-template-columns: 30px 30px 30px minmax(16px, 1fr) 30px 30px 30px; column-gap: 4px; }
  .gfx .cq { width: 30px; height: 30px; font-size: 10.5px; border-radius: 8px; }
  .gfx .loop { margin: 0 15px; padding: 16px 6px 12px; gap: 5px; }
  .gfx .lcap { font-size: 11px; white-space: nowrap; }
}
`

const later = (timers) => (fn, ms) => { timers.current.push(setTimeout(fn, ms)) }
const useTimers = () => {
  const timers = useRef([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return timers
}
const starLine = (n) => '★'.repeat(n) + '☆'.repeat(5 - n)
const stars = (n) => '★'.repeat(n)

/** The engine's level rule: the last five answers against the hardest level you've got right. */
function targetLevel(res) {
  if (!res.length) return 2
  const recent = res.slice(-5)
  const acc = recent.filter(r => r.ok).length / recent.length
  const right = res.filter(r => r.ok).map(r => r.d)
  const ceil = right.length ? Math.max(...right) : 1
  if (acc >= 0.7) return Math.min(5, ceil + 1)
  if (acc <= 0.4) return Math.max(1, ceil - 1)
  return Math.min(5, ceil)
}

const Panel = ({ title, intro, children }) => (
  <div className="acc-b">
    <div className="fp-h"><h2 className="fp-t">{title}</h2></div>
    <p className="ex">{intro}</p>
    {children}
  </div>
)
const Rules = ({ title, items, row, r2 }) => (
  <>
    {title && <h3 className="how-h">{title}</h3>}
    <ol className={`rules${row ? ' row' : ''}${r2 ? ' r2' : ''}`}>{items.map(([b, t]) => <li key={b}><b>{b}</b>{t}</li>)}</ol>
  </>
)

/* ─── 1 · Infinite Questions ───────────────────────────────────────────── */

const Q = {
  1: [
    { t: 'Linear functions', pre: 'What is the gradient of', m: '𝑦 = 4𝑥 − 7', post: '?', o: ['4', '−7', '4𝑥', '7/4'], a: 0, w: 'In 𝑦 = 𝑚𝑥 + 𝑐 the gradient is 𝑚, so it’s 4.' },
    { t: 'Linear functions', pre: 'Where does', m: '𝑦 = 3𝑥 + 6', post: ' cross the 𝑥-axis?', o: ['𝑥 = 6', '𝑥 = 2', '𝑥 = −2', '𝑥 = 3'], a: 2, w: 'Set 𝑦 = 0: 3𝑥 + 6 = 0, so 𝑥 = −2.' },
  ],
  2: [
    { t: 'Differentiation', pre: 'Differentiate', m: '𝑦 = 𝑥³ − 2𝑥', post: '.', o: ['3𝑥² − 2𝑥', '3𝑥² − 2', '𝑥² − 2', '3𝑥³ − 2'], a: 1, w: 'Bring each power down and take one off: 3𝑥² − 2.' },
    { t: 'Exponential functions', pre: 'Solve', m: '2ˣ⁺¹ = 16', post: '.', o: ['𝑥 = 3', '𝑥 = 4', '𝑥 = 7', '𝑥 = 8'], a: 0, w: '16 = 2⁴, so 𝑥 + 1 = 4 and 𝑥 = 3.' },
  ],
  3: [
    { t: 'Further differentiation', pre: 'Differentiate', m: '𝑦 = (2𝑥 − 5)³', post: '.', o: ['3(2𝑥 − 5)²', '6(2𝑥 − 5)²', '6𝑥(2𝑥 − 5)²', '(2𝑥 − 5)²'], a: 1, w: 'Outside first: 3(2𝑥 − 5)². Then × 2 for the inside: 6(2𝑥 − 5)².' },
    { t: 'Integral calculus', pre: 'Evaluate', m: '∫₀² 3𝑥² d𝑥', post: '.', o: ['12', '4', '8', '6'], a: 2, w: 'The antiderivative is 𝑥³, so 2³ − 0³ = 8.' },
  ],
  4: [
    { t: 'Quadratic functions', pre: 'For which 𝑘 does', m: '𝑥² + 𝑘𝑥 + 9 = 0', post: ' have no real solutions?', o: ['𝑘 < −6 or 𝑘 > 6', '−3 < 𝑘 < 3', '𝑘 = ±6', '−6 < 𝑘 < 6'], a: 3, w: 'No real solutions when 𝑘² − 36 < 0, so −6 < 𝑘 < 6.' },
    { t: 'Further differentiation', pre: 'Find the gradient of', m: '𝑦 = 𝑥 ln 𝑥', post: ' at 𝑥 = 𝑒.', o: ['2', '1', '𝑒', '𝑒 + 1'], a: 0, w: 'd𝑦/d𝑥 = ln 𝑥 + 1. At 𝑥 = 𝑒 that’s 1 + 1 = 2.' },
  ],
  5: [
    { t: 'Tangents', pre: 'The tangent to', m: '𝑦 = 𝑒ˣ', post: ' at 𝑥 = 𝑎 passes through the origin. Find 𝑎.', o: ['𝑎 = 0', '𝑎 = 𝑒', '𝑎 = 1', '𝑎 = −1'], a: 2, w: 'The tangent is 𝑦 = 𝑒ᵃ(𝑥 − 𝑎 + 1). Through (0, 0): 1 − 𝑎 = 0, so 𝑎 = 1.' },
    { t: 'Graphs of polynomials', pre: 'If', m: '𝑓(𝑥) = 𝑥³ − 3𝑥', post: ', how many solutions does 𝑓(𝑥) = 𝑘 have when −2 < 𝑘 < 2?', o: ['2', '3', '1', '0'], a: 1, w: 'The turning points are (−1, 2) and (1, −2). Any 𝑘 between them meets the curve 3 times.' },
  ],
}
const engineStart = () => ({
  lvl: 2, res: [], cur: { l: 2, i: 0 }, used: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 0 }, picked: null, phase: 'ask', flip: 0,
  pool: { 1: 6, 2: 4, 3: 2, 4: 1, 5: 0 }, fresh: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, writing: false, status: '', tk: 1, qn: 1,
})

function InfiniteQuestions() {
  const [s, setS] = useState(engineStart)
  const timers = useTimers()
  const after = later(timers)
  const q = Q[s.cur.l][s.cur.i]
  const reveal = s.phase === 'reveal'
  const say = (status, extra = {}) => setS(cur => ({ ...cur, ...extra, status, tk: cur.tk + 1 }))

  const answer = (i) => {
    if (reveal) return
    const res = [...s.res, { d: s.cur.l, ok: i === q.a }]
    const lvl = targetLevel(res)
    const msg = lvl > s.lvl ? `Your level went up to ${stars(lvl)}.` : lvl < s.lvl ? `Your level went down to ${stars(lvl)}.` : `Your level stays at ${stars(lvl)}.`
    say(msg, { res, lvl, picked: i, phase: 'reveal' })
  }
  const write = (l, left) => {
    after(() => say(`${left ? `Only ${left} left at ${stars(l)}` : `None left at ${stars(l)}`}. Writing 10 more.`), 400)
    after(() => {
      setS(cur => ({ ...cur, pool: { ...cur.pool, [l]: cur.pool[l] + 10 }, fresh: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, [l]: 10 }, writing: false, status: `10 new questions added at ${stars(l)}.`, tk: cur.tk + 1 }))
      after(() => setS(cur => ({ ...cur, fresh: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } })), 3200)
    }, 3200)
  }
  const next = () => {
    const l = s.lvl
    const pool = { ...s.pool }
    const order = [l, l - 1, l + 1, l - 2, l + 2, l - 3, l + 3, l - 4, l + 4].filter(x => x >= 1 && x <= 5)
    const pick = order.find(x => pool[x] > 0) ?? l
    if (pool[pick] > 0) pool[pick] -= 1
    const used = { ...s.used, [pick]: s.used[pick] + 1 }
    const job = !s.writing && pool[l] <= 2
    const extra = { cur: { l: pick, i: s.used[pick] % 2 }, used, pool, picked: null, phase: 'ask', flip: 1 - s.flip, qn: s.qn + 1, writing: s.writing || job }
    if (pick !== l) say(`Nothing left at ${stars(l)} yet, so you get the closest while it writes more.`, extra)
    else setS(cur => ({ ...cur, ...extra }))
    if (job) write(l, pool[l])
  }

  const pn = s.pool[s.lvl]
  const shown = Math.min(pn, 20)
  const fresh = Math.min(s.fresh[s.lvl], shown)
  return (
    <Panel title="Infinite Questions" intro="Most question banks run out. gradefarm. writes more at your level before you do, so your session never stops.">
      <div className="split">
        <div className="how">
          <Rules title="How the engine decides" items={[
            ['It keeps a buffer', 'Under 8 new questions left? It writes 10 more while you keep going.'],
            ['It writes at your level', 'Same difficulty, same topic, in your exam’s style.'],
            ['It follows you up', 'Move up a level and it writes harder ones straight away.'],
            ['No repeats', 'Never the same question twice in a session.'],
          ]} />
        </div>
        <div className="card qcard">
          <div key={s.qn} className={`qbody ${s.flip ? 'qa' : 'qb'}`}>
            <div className="qt"><span><b>{q.t}</b> · <span className="st">{starLine(s.cur.l)}</span></span><span>Question {s.qn}</span></div>
            <p className="stem">{q.pre} <span className="m">{q.m}</span>{q.post}</p>
            {q.o.map((txt, i) => {
              const cls = reveal ? (i === q.a ? 'r' : i === s.picked ? 'w' : 'd') : ''
              const tag = reveal ? (i === q.a ? 'Answer' : i === s.picked ? 'Your answer' : '') : ''
              return <button key={i} type="button" className={`opt ${cls}`} disabled={reveal} onClick={() => answer(i)}><span className="k">{'ABCD'[i]}</span><span className="m">{txt}</span><span className="tg">{tag}</span></button>
            })}
            <div className="sol" aria-live="polite">
              <b>{reveal ? (s.picked === q.a ? 'Correct' : 'Not quite') : ''}</b>{reveal ? q.w : 'Pick an answer to see the working.'}
              {reveal && <span className="nq"><button type="button" className="btn sm gold" onClick={next}>Next question</button></span>}
            </div>
          </div>
          <div className="feed">
            <div className="fr"><span>Your level <span className="lv">{starLine(s.lvl)}</span></span><span className="pc">{pn === 1 ? '1 question left at this level' : `${pn > 0 ? pn : 'No'} questions left at this level`}</span></div>
            <div className="poolrow" aria-label="New questions waiting at your level"><span className="sqs">{Array.from({ length: shown }, (_, j) => <span key={j} className={`sq${j >= shown - fresh ? ' nw' : ''}`} />)}</span></div>
            {s.status && <p key={s.tk} className={`now ${s.tk % 2 ? 'ta' : 'tb'}`} aria-live="polite"><i className={s.writing ? 'on' : ''} />{s.status}</p>}
          </div>
        </div>
      </div>
    </Panel>
  )
}

/* ─── 2 · Adaptive Difficulty ──────────────────────────────────────────── */

const LEVEL_NAMES = { 5: 'Hardest', 4: 'Exam-style', 3: 'Stretch', 2: 'Where everyone starts', 1: 'Back to basics' }

function AdaptiveDifficulty() {
  const [lad, setLad] = useState([])
  const lvl = targetLevel(lad)
  const add = (ok) => setLad(cur => [...cur, { d: targetLevel(cur), ok }].slice(-12))
  const last = lad.slice(-5)
  return (
    <Panel title="Adaptive Difficulty" intro="Every question is rated one to five stars. Your recent answers decide how hard the next one is.">
      <div className="split">
        <div className="how">
          <Rules title="How the engine decides" items={[
            ['Everyone starts at ★★', 'Nobody starts on the hardest questions.'],
            ['It reads your last five answers', '70% or more right: one step harder. 40% or less: one step easier. In between, it holds.'],
            ['It scores every question', 'Ones you’ve missed before come first, near your level. It picks from the top five, so it never feels scripted.'],
          ]} />
        </div>
        <div className="card ladder">
          {[5, 4, 3, 2, 1].map(l => (
            <div key={l} className={`lrow${l === lvl ? ' on' : ''}`}><span className="s">{starLine(l)}</span><b>{LEVEL_NAMES[l]}</b>{l === lvl && <span className="you">You're here</span>}</div>
          ))}
          <div className="lctl">
            <button type="button" className="btn sm" onClick={() => add(true)}>Get one right</button>
            <button type="button" className="btn sm" onClick={() => add(false)}>Get one wrong</button>
            <span className="l5">Last 5 {[0, 1, 2, 3, 4].map(j => <span key={j} className={`sq ${last[j] ? (last[j].ok ? 's3' : 's1') : ''}`} />)}</span>
          </div>
        </div>
      </div>
    </Panel>
  )
}

/* ─── 3 · Comeback Mode ────────────────────────────────────────────────── */

const cbStart = () => ({ stage: 'ask', done: [], streak: 0, miss: 0, target: 3, idea: false, msg: 'You’re on Q6 of your session. Try getting it wrong.' })

function ComebackMode() {
  const [c, setC] = useState(cbStart)
  const first = (ok) => setC(cur => ok
    ? { ...cur, stage: 'skip', msg: 'Right. Straight on to Q7, no detour needed.' }
    : { ...cur, stage: 'strand', msg: 'Missed Q6. Your session pauses here, and 3 questions like it are lined up. Get 3 in a row to go back.' })
  const answer = (ok) => setC(s => {
    if (s.stage !== 'strand') return s
    const done = [...s.done, { idea: s.idea, ok }]
    if (ok) {
      const streak = s.streak + 1
      if (streak >= s.target) return { ...s, done, streak, idea: false, stage: 'done', msg: `${s.target > 1 ? `${s.target} in a row.` : 'Got it.'} Back to your session at Q7, and Q6 comes back in an hour.` }
      const left = s.target - streak
      return { ...s, done, streak, idea: false, msg: left === 1 ? '1 more right to go back.' : `${left} more in a row to go back.` }
    }
    if (s.idea) return { ...s, done, streak: 0, idea: false, msg: 'The idea question doesn’t count as a miss. Keep going.' }
    const miss = s.miss + 1
    const next = { ...s, done, streak: 0, miss }
    if (miss >= 5) return { ...next, stage: 'plan', msg: 'Five misses, so it goes in your study plan to come back to. Back to your session at Q7.' }
    if (miss === 3) return { ...next, target: 1, msg: 'Still tricky, so just 1 right gets you back.' }
    if (miss === 2) return { ...next, target: 2, idea: true, msg: 'Two misses. Next is an easier question that explains the idea first, and now 2 in a row is enough.' }
    return { ...next, msg: 'Missed one, so the count starts again: 3 in a row.' }
  })

  const st = c.stage
  const letters = 'abcdefghijklmnop'
  let li = 0
  const strand = c.done.map(a => ({ label: a.idea ? 'Idea' : `6${letters[li++]}`, cls: a.ok ? 'ok' : 'x' }))
  if (st === 'strand') {
    for (let j = 0; j < c.target - c.streak; j++) strand.push({ label: j === 0 && c.idea ? 'Idea' : `6${letters[li++]}`, cls: j === 0 ? 'cur' : '' })
  } else if (st === 'ask' || st === 'skip') {
    ['6a', '6b', '6c'].forEach(label => strand.push({ label, cls: '' }))
  }
  const back = st === 'done' || st === 'plan' || st === 'skip'
  return (
    <Panel title="Comeback Mode" intro="Get one wrong and you practise questions like it straight away, then go back to your session.">
      <div className="split">
        <div className="how">
          <Rules title="How the engine decides" items={[
            ['A strand of its own', 'Up to 8 questions like the one you missed, ready before you need them.'],
            ['3 in a row to go back', 'Then you rejoin your session where you left off.'],
            ['Easier if you’re stuck', 'Miss two and it explains the idea first, and 2 in a row is enough. Miss three and 1 is.'],
            ['Nothing gets lost', 'It comes back in an hour. After 5 misses, it goes in your study plan.'],
          ]} />
        </div>
        <div className="card cbx">
          <p className="cbl">Your session</p>
          <div className="cbg">
            <span className="cq ok">Q4</span><span className="cq ok">Q5</span>
            <span className={`cq ${st === 'ask' ? 'cur' : st === 'skip' ? 'ok' : 'x'}`}>Q6</span>
            <span className={`pause ${st === 'strand' ? 'paused' : ''}`} />
            <span className={`cq ${back ? 'cur' : ''}`}>Q7</span><span className="cq">Q8</span><span className="cq">Q9</span>
            <div className={`loop ${st === 'ask' || st === 'skip' ? 'off' : st === 'done' ? 'done' : st === 'plan' ? 'plan' : ''}`}>
              {strand.map((x, i) => <span key={i} className={`cq ${x.cls}`}>{x.label}</span>)}
              <span className="lcap">Comeback strand</span>
            </div>
          </div>
          <p className="cbmsg" aria-live="polite">{c.msg}</p>
          <div className="rb">
            {st === 'ask' && <><button type="button" className="btn sm gold" onClick={() => first(false)}>Get Q6 wrong</button><button type="button" className="btn sm" onClick={() => first(true)}>Get Q6 right</button></>}
            {st === 'strand' && <><button type="button" className="btn sm" onClick={() => answer(true)}>Get it right</button><button type="button" className="btn sm" onClick={() => answer(false)}>Get it wrong</button></>}
            {back && <button type="button" className="btn sm" onClick={() => setC(cbStart())}>Start again</button>}
          </div>
        </div>
      </div>
    </Panel>
  )
}

/* ─── 4 · Spaced Repetition ────────────────────────────────────────────── */

function SpacedRepetition() {
  const [curve, setCurve] = useState('both')
  const op = (k) => (curve === 'both' || curve === k ? 1 : 0.18)
  return (
    <Panel title="Spaced Repetition" intro="Every question gets a return date, so it comes back just before you'd forget it, and the gap grows each time you get it right.">
      <div className="split">
        <div className="how">
          <h3 className="how-h">How the engine schedules it</h3>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="sched"><tbody>
              <tr><th>You miss it</th><td>1 hour</td></tr>
              <tr><th>Right once</th><td>1 day <small>or 2</small></td></tr>
              <tr><th>Right twice</th><td>4 days <small>or 1 week</small></td></tr>
              <tr><th>Right 3 or 4 times</th><td>2 weeks <small>or 3</small></td></tr>
              <tr><th>Right 5 times or more</th><td>1 month <small>or 2</small></td></tr>
            </tbody></table>
          </div>
          <p className="hn">The longer gap is for questions you get right at least 75% of the time. Wrong half the time or more? Back in an hour.</p>
          <p className="hn">Each session starts with up to 5 that are due back.</p>
        </div>
        <div className="card curve">
          <div className="curve-h">
            <span className="sw" role="group" aria-label="Show">
              {[['both', 'Both'], ['cram', 'Cramming'], ['gf', 'gradefarm.']].map(([k, label]) => <button key={k} type="button" aria-pressed={curve === k} onClick={() => setCurve(k)}>{label}</button>)}
            </span>
            <span className="key"><i />With reviews<i className="cram" />Learnt once</span>
          </div>
          <svg viewBox="0 0 720 300" role="img" aria-label="How much you remember over six weeks. Learnt once, it drops away within a few days. With reviews after an hour, 4 days and 3 weeks, it goes back up each time and is still mostly there at six weeks.">
            <line className="gl" x1="44" x2="706" y1="24" y2="24" />
            <line className="gl dash" x1="44" x2="706" y1="139" y2="139" />
            <line className="gl2" x1="44" x2="706" y1="254" y2="254" />
            <text x="36" y="28" textAnchor="end" className="lbl">All</text>
            <text x="36" y="258" textAnchor="end" className="lbl">None</text>
            <text x="44" y="282" textAnchor="start" className="lbl">Learn it</text>
            <text x="110.3" y="282" textAnchor="middle" className="lbl">1 hr</text>
            <text x="352.1" y="282" textAnchor="middle" className="lbl">1 day</text>
            <text x="481.8" y="282" textAnchor="middle" className="lbl">4 days</text>
            <text x="639.8" y="282" textAnchor="middle" className="lbl">3 wks</text>
            <text x="706" y="282" textAnchor="end" className="lbl">6 wks</text>
            <path d={CURVE_CRAM} className="cramp" opacity={op('cram')} />
            <path d={CURVE_GF} className="gfp" opacity={op('gf')} />
            <g className="fade" opacity={op('gf')}>
              {[110.3, 481.8, 639.8].map(x => <g key={x}><circle className="rvd" cx={x} cy="24" r="6" /><text x={x} y="13" textAnchor="middle" className="lbl strong">Back</text></g>)}
              <text x="706" y="103.6" textAnchor="end" className="lbl strong">Still there</text>
            </g>
            <text x="706" y="244" textAnchor="end" className="lbl" opacity={op('cram')}>Mostly gone</text>
          </svg>
        </div>
      </div>
    </Panel>
  )
}

/* ─── 5 · The Exam Builder ─────────────────────────────────────────────── */

// Sample multiple-choice questions for the preview, by where they'd come from.
const EX = [
  { id: 'P1', kind: 'past', s: 'The derivative of x²eˣ with respect to x is', o: ['𝑥²𝑒ˣ', '2𝑥𝑒ˣ', '𝑒ˣ(𝑥² + 2𝑥)', '2𝑥 + 𝑒ˣ'] },
  { id: 'P2', kind: 'past', s: 'X is normally distributed with mean 50 and standard deviation 4. Pr(X > 58) is closest to', o: ['0.023', '0.046', '0.159', '0.977'] },
  { id: 'P3', kind: 'past', s: 'The gradient of the tangent to y = ln(2x) at x = 1 is', o: ['1', '2', '1/2', 'ln 2'] },
  { id: 'P4', kind: 'past', s: 'The integral of 2/x from x = 1 to x = e is', o: ['2', '1', '2𝑒 − 2', '𝑒²'] },
  { id: 'T1', kind: 'trial', s: 'The average value of f(x) = 3x² over [0, 2] is', o: ['2', '4', '6', '8'] },
  { id: 'T2', kind: 'trial', s: 'Pr(A) = 0.4, Pr(B) = 0.5, and A and B are independent. Pr(A ∪ B) is', o: ['0.2', '0.7', '0.9', '0.1'] },
  { id: 'B1', kind: 'bank', s: 'If log₂(x) + log₂(x − 2) = 3, then x is', o: ['−2', '4', '−2 or 4', '8'] },
  { id: 'B2', kind: 'bank', s: 'The function f(x) = x³ − 3x² has a local maximum at', o: ['(0, 0)', '(2, −4)', '(1, −2)', '(3, 0)'] },
]
const SRC_LABEL = { past: 'Past exam', trial: 'Trial exam', bank: 'gradefarm.' }

function shuffle(list, seed) {
  let a = (seed >>> 0) || 1
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}
const RANK = { past: 0, trial: 1, bank: 2 }
const buildIds = (seed, src) => shuffle(EX.filter(q => src[q.kind]), seed).slice(0, 4).sort((a, b) => RANK[a.kind] - RANK[b.kind]).map(q => q.id)

function ExamBuilder() {
  const timers = useTimers()
  const [paper, setPaper] = useState(2)
  const [src, setSrc] = useState({ past: true, trial: true, bank: true })
  const [seed, setSeed] = useState(7)
  const [ids, setIds] = useState(() => buildIds(7, { past: true, trial: true, bank: true }))
  const [anim, setAnim] = useState([0, 0, 0, 0])
  const [toast, setToast] = useState('')
  const flash = (msg) => { setToast(msg); timers.current.push(setTimeout(() => setToast(''), 2800)) }
  const toggleSrc = (kind) => {
    const next = { ...src, [kind]: !src[kind] }
    if (!next.past && !next.trial && !next.bank) return flash('Keep at least one source switched on.')
    setSrc(next); setIds(buildIds(seed, next)); setAnim(a => a.map(x => 1 - x))
  }
  const rebuild = () => { setSeed(seed + 1); setIds(buildIds(seed + 1, src)); setAnim(a => a.map(x => 1 - x)) }
  const swap = (i) => {
    const pool = EX.filter(q => src[q.kind] && !ids.includes(q.id))
    if (!pool.length) return flash('Nothing else matches these sources. Switch another one on.')
    const pick = pool[(seed + i) % pool.length]
    setIds(cur => cur.map((id, j) => (j === i ? pick.id : id)))
    setAnim(a => a.map((x, j) => (j === i ? 1 - x : x)))
    setSeed(seed + 1)
  }
  const p2 = paper === 2
  const ex = ids.map(id => EX.find(e => e.id === id))
  return (
    <Panel title="The Exam Builder" intro="A full practice exam in seconds, laid out like the real paper, from past and trial exams.">
      <Rules title="How it builds your exam" row r2 items={[
        ['Real papers, never mixed', 'Official past exams, trial exams and gradefarm.’s own bank. Exam 1 and Exam 2 never mix.'],
        ['New questions first', 'Ones you haven’t done, across every topic, in course order.'],
        ['The real structure', 'Methods Exam 2: 20 multiple choice and about 60 marks of extended response, in 2 hours.'],
        ['Swap anything', 'Swap any question for an unseen one from the same section and topic.'],
      ]} />
      <div className="xb">
        <div className="card bld">
          <div className="fld"><span className="lab">Paper</span>
            <div className="seg">
              <button type="button" aria-pressed={!p2} onClick={() => setPaper(1)}>Exam 1 · no calculator</button>
              <button type="button" aria-pressed={p2} onClick={() => setPaper(2)}>Exam 2 · calculator</button>
            </div>
          </div>
          <div className="fld"><span className="lab">Questions from</span>
            <div className="chips">
              {['past', 'trial', 'bank'].map(k => <button key={k} type="button" className="chip" aria-pressed={!!src[k]} onClick={() => toggleSrc(k)}><span className="bx" />{k === 'past' ? 'Past exams' : k === 'trial' ? 'Trial exams' : 'gradefarm.'}</button>)}
            </div>
          </div>
          <dl className="spec">
            <dt>Section A</dt><dd>{p2 ? '20 multiple choice' : 'None'}</dd>
            <dt>Section B</dt><dd>{p2 ? '60 marks, extended' : '40 marks, short answer'}</dd>
            <dt>Writing time</dt><dd>{p2 ? '2 hours' : '1 hour'}</dd>
          </dl>
          <div className="bb">
            <button type="button" className="btn gold" onClick={rebuild}>Build a new exam</button>
            <button type="button" className="btn" onClick={() => flash('In the app, this saves an A4 PDF ready to print.')}>Download PDF</button>
          </div>
          {toast && <p className="toast" role="status">{toast}</p>}
        </div>
        <div className="paperwrap">
          <div className="sheet bk b1" aria-hidden="true" />
          <div className="sheet bk b2" aria-hidden="true" />
          <article className="sheet main" aria-label="Sample practice exam preview">
            <div className="sh-top"><span><span className="wm">grade<span>farm.</span></span><small>Sample paper</small></span><span className="sh-box">{p2 ? 'Exam 2' : 'Exam 1'}</span></div>
            <h3 className="sh-title">Mathematical Methods</h3>
            <p className="sh-meta">{p2 ? 'Calculator allowed · Section A: 20 marks · Section B: 60 marks · Writing time 2 hours' : 'Calculator-free · 40 marks · Writing time 1 hour'}</p>
            {p2 ? (
              <>
                <p className="secl">Section A · Multiple choice · showing {ex.length} of 20</p>
                {ex.map((x, i) => (
                  <div key={i + '-' + x.id + anim[i]} className={`pq ${anim[i] ? 'fa' : 'fb'}`}>
                    <div className="pq-h"><b>Question {i + 1}</b><span className={`src ${x.kind}`}>{SRC_LABEL[x.kind]}</span>
                      <button type="button" className="swap" onClick={() => swap(i)} aria-label={`Swap question ${i + 1} for another`}><svg className="i s" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></svg></button>
                    </div>
                    <p className="pq-s">{x.s}</p>
                    <div className="pq-o">{x.o.map((t, j) => <span key={j}><b>{'ABCD'[j]}.</b> <span className="m">{t}</span></span>)}</div>
                  </div>
                ))}
                <p className="secl">Section B · Extended response</p>
                <div className="pq">
                  <div className="pq-h"><b>Question 1 (7 marks)</b><span className="src past">Past exam</span></div>
                  <p className="pq-s">Let <span className="m">𝑓(𝑥) = 𝑥³ − 6𝑥² + 9𝑥</span>.</p>
                  <div className="part"><b>a.</b><span>Find the coordinates of the stationary points of <span className="m">𝑓</span>.</span><em>3 marks</em></div>
                  <div className="lines" />
                  <div className="part"><b>b.</b><span>Find the area enclosed by the graph of <span className="m">𝑓</span> and the <span className="m">𝑥</span>-axis between <span className="m">𝑥 = 0</span> and <span className="m">𝑥 = 3</span>.</span><em>4 marks</em></div>
                  <div className="lines" />
                </div>
              </>
            ) : (
              <>
                <p className="secl">Short answer · calculator-free</p>
                <div className="pq fa"><div className="pq-h"><b>Question 1 (2 marks)</b><span className="src past">Past exam</span></div><p className="pq-s">Let <span className="m">𝑦 = 𝑥² sin(𝑥)</span>. Find <span className="m">d𝑦/d𝑥</span>.</p><div className="lines" /></div>
                <div className="pq fa"><div className="pq-h"><b>Question 2 (3 marks)</b><span className="src trial">Trial exam</span></div><p className="pq-s">Solve <span className="m">𝑒²ˣ − 5𝑒ˣ + 6 = 0</span> for <span className="m">𝑥</span>.</p><div className="lines" /></div>
                <div className="pq fa"><div className="pq-h"><b>Question 3 (2 marks)</b><span className="src bank">gradefarm.</span></div><p className="pq-s">Find the equation of the tangent to <span className="m">𝑦 = √𝑥</span> at <span className="m">𝑥 = 4</span>.</p><div className="lines" /></div>
              </>
            )}
            <p className="turn">Turn over</p>
          </article>
        </div>
      </div>
      <div className="flowrow" aria-label="How it works"><span className="st2">Build it</span><i>→</i><span className="st2">Print it</span><i>→</i><span className="st2">Sit it</span><i>→</i><span className="st2 last">Mark it against the solutions</span></div>
      <p className="xnote"><b>Prefer a screen?</b> Exam mode runs it timed, with the answers held back until you finish.</p>
    </Panel>
  )
}

/* ─── 6 · Examiner Marking ─────────────────────────────────────────────── */

const TICK = <svg className="i s" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
const CROSS = <svg className="i s" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>

function ExaminerMarking() {
  const [mark, setMark] = useState(0)
  const [adv, setAdv] = useState(false)
  const MARKS = [
    [true, 'Hydrogen bonding between ethanol molecules', 'You wrote: “form hydrogen bonds with each other because of the O–H group”', '1/1'],
    [true, 'Only dispersion forces between propane molecules', 'You wrote: “Propane only has dispersion forces”', '1/1'],
    [false, 'Stronger forces, so more energy to separate the molecules', 'You said ethanol boils higher, but not why. Say hydrogen bonds are stronger, so more energy is needed to separate ethanol molecules.', '0/1'],
  ]
  return (
    <Panel title="Examiner Marking" intro="Written answers are marked against the marking scheme, one mark at a time, with your own words quoted back.">
      <Rules title="How it marks" row items={[
        ['Against the scheme', 'Your answer is checked against each point an examiner looks for.'],
        ['Your words, quoted', 'Every mark shows the part of your answer that earned it.'],
        ['Help before you answer', 'Titan’s Advice highlights the key words and nudges you, without giving the answer.'],
      ]} />
      <div className="mk">
        <div className={`card pane ${adv ? 'adv-on' : ''}`}>
          <div className="ph"><span className="lab">SACE Chemistry · Stage 2</span><span className="lab">3 marks</span></div>
          <p className="qtext">Ethanol (<span className="an c">C₂H₅OH</span>) boils at 78 °C, but propane (C₃H₈), which has a <span className="an u">similar molar mass</span>, boils at −42 °C. <span className="an u">Explain</span> the difference.</p>
          {adv && (
            <div className="advn">
              <p className="note">Similar molar mass: so the dispersion forces are about the same. That's not it.</p>
              <p className="note">C₂H₅OH has an O–H group. What can that form?</p>
            </div>
          )}
          <p className="yl">Your answer</p>
          <p className="ans">
            <span>Ethanol molecules can </span><span className={`hl ${mark === 0 ? 'on' : ''}`}>form hydrogen bonds with each other because of the O–H group</span><span>. </span>
            <span className={`hl ${mark === 1 ? 'on' : ''}`}>Propane only has dispersion forces</span><span> between its molecules. </span>
            <span className={`hl miss ${mark === 2 ? 'on' : ''}`}>So ethanol has a higher boiling point.</span>
          </p>
          <div style={{ marginTop: 14 }}><button type="button" className="btn sm" onClick={() => setAdv(a => !a)} aria-pressed={adv}>{adv ? 'Hide Titan’s Advice' : 'Show Titan’s Advice'}</button></div>
        </div>
        <div className="card pane">
          <div className="ph"><span className="lab">Tap a mark to see where it came from</span><span className="total">2<small>/3</small></span></div>
          <div className="mps">
            {MARKS.map(([got, title, note, pts], i) => (
              <button key={i} type="button" className="mp" aria-pressed={mark === i} onClick={() => setMark(i)}>
                <span className={`tick ${got ? 'y' : 'n'}`}>{got ? TICK : CROSS}</span>
                <span><b>{title}</b><span className="qt2">{note}</span></span>
                <span className="pts2">{pts}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  )
}

/* ─── 7 · Titan ────────────────────────────────────────────────────────── */

function Titan() {
  return (
    <Panel title="Your Tutor, Titan AI" intro="An AI tutor for your subject, any time. Open it from a question and it already knows what you're on.">
      <Rules title="How Titan helps" row items={[
        ['It asks before it tells', 'Stuck? It asks the question that gets you to the next step.'],
        ['It checks your working', 'Write it out and it points to the line that went wrong.'],
        ['Photos and lessons', 'Snap a question from your textbook, or take a guided lesson on a topic.'],
      ]} />
      <div className="tg">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="ti-h"><b>Titan</b><span style={{ color: 'var(--muted)' }}>Chain rule</span></div>
          <div className="ti-m">
            <div className="me">Why isn't it <span className="m">3(2𝑥 − 5)²</span>? I brought the power down.</div>
            <div className="re"><b>Titan</b>Bringing the power down is the right start. But 2𝑥 − 5 is a function inside a function, so you also multiply by the derivative of the inside. What's the derivative of 2𝑥 − 5?</div>
            <div className="me">2</div>
            <div className="re"><b>Titan</b>Exactly. So it's 3(2𝑥 − 5)² × 2, which is 6(2𝑥 − 5)².</div>
          </div>
        </div>
        <div className="tcs">
          <div className="board" aria-label="Rough work being checked by Titan">
            <span className="q">Check my working · Differentiate y = (2x − 5)³</span>
            <div className="hw hw1">y′ = 3(2x − 5)²</div>
            <div className="hw hw2">{'   '}= 6x − 15 ...</div>
            <div className="tnote">Line 1: what's the derivative of the inside, 2x − 5? Multiply by it.</div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

/* ─── 8 · Exam-Grade Questions ─────────────────────────────────────────── */

const FORMATS = [['graph', 'Graphs'], ['chem', 'Chemistry'], ['num', 'Number + units'], ['order', 'Put in order'], ['spot', 'Tap the spot'], ['read', 'Reading']]
const CURVE_PTS = 'M20 135 L35 89.6 L50 60 L65 43.9 L80 39 L95 43.1 L110 54 L125 69.4 L140 87 L155 104.6 L170 120 L185 130.9 L200 135'

function ExamGradeQuestions() {
  const [fmt, setFmt] = useState('graph')
  return (
    <Panel title="Exam-Grade Questions" intro="Written for your course in your exam's style, with real graphs, diagrams and passages.">
      <div className="ftabs" role="group" aria-label="Question formats">
        {FORMATS.map(([id, name]) => <button key={id} type="button" aria-pressed={fmt === id} onClick={() => setFmt(id)}>{name}</button>)}
      </div>
      <div className="split">
        <div className="how">
          <Rules title="How the engine writes them" items={[
            ['Built from your course', 'Every question sits under a topic in your official course, like the VCAA study design.'],
            ['Modelled on real exams', 'Written from real exam questions, so the style and difficulty match.'],
            ['Nothing off the course', 'Nothing from later in your course. Seems off? Tap “It’s not in my course”.'],
          ]} />
        </div>
        <div>
          {fmt === 'graph' && (
            <div className="card fq"><span className="meta">Integral calculus · ★★★</span><p>The graph of <span className="m">𝑦 = 𝑥(𝑥 − 3)²</span> is shown. Find the area of the shaded region.</p>
              <svg viewBox="0 0 260 160" role="img" aria-label="Graph of y equals x times x minus 3 squared, shaded between x equals 0 and 3, with a turning point at 1, 4">
                <path className="sh2" d={`${CURVE_PTS} Z`} />
                <path className="ax" d="M10 135H250M20 150V10" />
                <path className="cv" d={`${CURVE_PTS} L215 130.1 L230 114`} />
                <circle className="pt2" cx="80" cy="39" r="4" /><circle className="pt2" cx="200" cy="135" r="4" />
                <text x="86" y="32">(1, 4)</text><text x="186" y="152">(3, 0)</text>
              </svg>
              <div className="fopts"><span className="r">A. 27/4</span><span>B. 9/2</span><span>C. 4</span><span>D. 27/2</span></div>
            </div>
          )}
          {fmt === 'chem' && (
            <div className="card fq"><span className="meta">Intermolecular forces · ★★</span><p>Which force is strongest between molecules of this compound?</p>
              <svg viewBox="0 0 260 110" role="img" aria-label="Skeletal formula of ethanol">
                <path className="cv" d="M60 78 L110 48 L160 78" strokeLinecap="round" />
                <text x="166" y="86" style={{ fontSize: 20 }}>OH</text>
              </svg>
              <div className="fopts"><span className="r">A. Hydrogen bonding</span><span>B. Dispersion forces</span><span>C. Ionic bonding</span><span>D. Covalent bonding</span></div>
            </div>
          )}
          {fmt === 'num' && (
            <div className="card fq"><span className="meta">Concentration · ★★</span><p>0.050 mol of NaCl is dissolved to make 250 mL of solution. Find its concentration.</p>
              <div className="numbox"><span className="v">0.20</span><span className="u">mol L⁻¹</span></div>
            </div>
          )}
          {fmt === 'order' && (
            <div className="card fq"><span className="meta">Stationary points · ★★</span><p>Put these steps in order to find and classify a stationary point.</p>
              <div className="ord">
                <span><i>⋮⋮</i>Differentiate <span className="m">𝑓(𝑥)</span></span><span><i>⋮⋮</i>Solve <span className="m">𝑓′(𝑥) = 0</span></span>
                <span><i>⋮⋮</i>Substitute back into <span className="m">𝑓(𝑥)</span></span><span><i>⋮⋮</i>Check the sign of <span className="m">𝑓′</span> either side</span>
              </div>
            </div>
          )}
          {fmt === 'spot' && (
            <div className="card fq"><span className="meta">Graphs · ★★★</span><p>Tap the point where the curve stops increasing.</p>
              <svg viewBox="0 0 260 160" role="img" aria-label="A curve with three tappable points; the turning point at the top is the answer">
                <path className="ax" d="M10 135H250M20 150V10" />
                <path className="cv" d={`${CURVE_PTS} L215 130.1 L230 114`} />
                <circle className="tap yes" cx="80" cy="39" r="14" /><circle className="tap" cx="140" cy="87" r="14" /><circle className="tap" cx="200" cy="135" r="14" />
              </svg>
            </div>
          )}
          {fmt === 'read' && (
            <div className="card fq"><span className="meta">Year 6 English · reading</span>
              <p className="passage">The lighthouse keeper climbed the spiral stairs for the last time. For forty years she had polished the great lens until it shone, and tonight the light would switch to automatic. She lingered at the window, watching the beam sweep the dark water, and said goodbye.</p>
              <p>Why does the writer say "for the last time"?</p>
              <div className="fopts"><span className="r">A. She is leaving the job</span><span>B. The stairs are being removed</span><span>C. The light has broken</span><span>D. She is afraid of heights</span></div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}

/* ─── 9 · Ranks & Leagues ──────────────────────────────────────────────── */

function RanksAndLeagues() {
  return (
    <Panel title="Ranks & Leagues" intro="XP, ranks, a daily streak and a weekly league at your level, plus a predicted grade.">
      <Rules title="How it's worked out" row items={[
        ['Ranks you can’t fake', 'Silver and up need real accuracy too: 50% for Silver II, up to 85% for Legend.'],
        ['Fair leagues', 'Up to 20 students at your level, Monday to Sunday. Top 5 move up.'],
        ['A predicted grade', 'From your accuracy at each difficulty, after 40 answers.'],
      ]} />
      <div className="four">
        <div className="card bx"><h3>Ranks you can't fake</h3>
          <div className="rk">
            <div><span className="emb" style={{ '--c': '#e0a91f' }} /><span>Gold</span><small>60% right</small></div>
            <div className="me2"><span className="emb" style={{ '--c': '#c7cdd9' }} /><span>Silver I · you</span><small>55% right</small></div>
            <div><span className="emb" style={{ '--c': '#a7afc2' }} /><span>Silver II</span><small>50% right</small></div>
          </div>
          <p>From Silver up, every rank needs real accuracy as well as XP.</p>
        </div>
        <div className="card bx"><h3>Streaks</h3>
          <div className="week">
            {['M', 'T', 'W'].map((d, i) => <div key={i} className="wd"><span className="sq s3" />{d}</div>)}
            <div className="wd"><span className="sq frz"><svg className="i s" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17" /></svg></span>T</div>
            <div className="wd"><span className="sq s3" />F</div><div className="wd"><span className="sq s3" />S</div><div className="wd"><span className="sq today" />S</div>
          </div>
          <p>Set a daily goal. Miss a day and a freeze covers it. You earn them, never buy them.</p>
        </div>
        <div className="card bx"><h3>Weekly league</h3>
          <div>
            <div className="lgr"><span>2</span><span>Jordan T.</span><span>1,105</span></div>
            <div className="lgr you2"><span>3</span><span>You</span><span>980</span></div>
            <div className="lgr"><span>5</span><span>Lucas W.</span><span>905</span></div>
            <div className="promo">Top 5 move up</div>
          </div>
          <p>Up to 20 people at your level, Monday to Sunday.</p>
        </div>
        <div className="card bx"><h3>Predicted grade</h3>
          <div className="grade"><b>B+</b><span>estimate</span></div>
          <p>From your accuracy at each difficulty, after 40 answers.</p>
        </div>
      </div>
    </Panel>
  )
}

const PANELS = [InfiniteQuestions, AdaptiveDifficulty, ComebackMode, SpacedRepetition, ExamBuilder, ExaminerMarking, Titan, ExamGradeQuestions, RanksAndLeagues]

/* ─── page ─────────────────────────────────────────────────────────────── */

export default function FeaturesPage({ theme = 'light', onToggleTheme, onSignIn }) {
  const navigate = useNavigate()
  const location = useLocation()
  const open = featureFromHash(location.hash)
  const [seen, setSeen] = useState(() => [open])
  useEffect(() => { setSeen(s => (s.includes(open) ? s : [...s, open])) }, [open])
  const pick = (n) => navigate({ hash: `#${FEATURES[n].slug}` }, { replace: true })
  const start = () => navigate('/pricing')
  const homeSection = (id) => navigate('/home', { state: { scrollTo: id } })
  const NAV = [['Features', () => window.scrollTo({ top: 0, behavior: 'smooth' }), true], ['Subjects', () => homeSection('subjects')], ['Pricing', () => navigate('/pricing')]]
  const Current = PANELS[open]
  const nextN = (open + 1) % FEATURES.length
  const dark = theme === 'dark'

  return (
    <div className={`lp gfx${dark ? ' dark' : ''}`} style={{ ...themeVars(theme), colorScheme: dark ? 'dark' : 'light' }}>
      <style>{SITE_FONTS + SITE_CSS + FEATURES_CSS + EXTRA_CSS}</style>
      <SiteNav theme={theme} onToggleTheme={onToggleTheme} onSignIn={onSignIn} onStart={start} onLogo={() => navigate('/home')} links={NAV} />

      <main>
        <div className="fwrap">
        <div className="calm" aria-hidden="true"><span className="glow a" /><span className="glow b" /></div>
        <header className="fhead">
          <div className="in wide">
            <h1 className="fh1">Everything inside gradefarm.</h1>
          </div>
        </header>
        <section className="fx" id="features" aria-label="Features">
          <div className="in wide fxg">
            <nav className="fl" aria-label="Features">
              {FEATURES.map((f, n) => (
                <button key={f.slug} type="button" className="fli" aria-current={open === n ? 'true' : 'false'} onClick={() => pick(n)}>
                  <span className={`sq ${open === n ? 's3' : seen.includes(n) ? 's2' : ''}`} /><span>{f.name}</span>
                </button>
              ))}
            </nav>
            <div className="card fp">
              <div className="acc" key={open}><Current /></div>
              <div className="fpf">
                <span>{open + 1} of {FEATURES.length}</span>
                <button type="button" className="link" onClick={() => pick(nextN)}>Next: {FEATURES[nextN].name}<ArrowRight className="ar" aria-hidden="true" /></button>
              </div>
            </div>
          </div>
        </section>
        </div>

        <section className="end" id="start" aria-labelledby="gfx-end-h">
          <div className="calm" aria-hidden="true"><span className="glow a" /><span className="glow b" /></div>
          <div className="in">
            <h2 id="gfx-end-h">Start with one subject, free.</h2>
            <StartButton onClick={start} />
          </div>
          <CitySkyline state="SA" className="city" />
        </section>
      </main>

      <SiteFooter links={siteFooterLinks(navigate, homeSection)} />
    </div>
  )
}
