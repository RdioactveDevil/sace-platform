import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowRight, ArrowDown } from 'lucide-react'
import { getPlatformSettings } from '../lib/db'
import { usePublicSubjects } from '../lib/publicSubjects'
import { SUBJECT_GROUPS as GROUPS, groupSubjects } from '../lib/homeSubjects'
import { studentTiers, money } from '../lib/pricing'
import { SITE_CSS, SITE_FONTS, themeVars, SiteNav, SiteFooter, siteFooterLinks, StartButton } from './SiteChrome'
import CitySkyline from './CitySkyline'
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
.gfx .end .city { color: var(--city); }
.gfx .tonext { display: flex; justify-content: center; margin: 36px 0 0; }
.gfx .tonext .try { min-height: 56px; padding: 0 24px; font-size: 16.5px; border-radius: 14px; gap: 8px; }
`

/** The four parts of gradefarm. in the hero: what they replace, and the real screen. */
const PARTS = [
  { name: 'Question bank', what: 'Questions for your exact course, at your level. When you’re running low, it writes more.', img: '/home/question.jpg', old: ['Textbook questions', 'The same 30 questions, answers in the back.'] },
  { name: 'Tutor', what: 'Ask about any question at 11 pm. Titan asks you the next step instead of just giving the answer.', img: '/home/titan.jpg', old: ['Tutor, Tuesdays 4 pm', 'Great, for an hour a week.'] },
  { name: 'Examiner', what: 'Every answer marked straight away. Written answers marked point by point, like your real exam.', img: '/home/marking.jpg', old: ['Waiting for marks', 'Your teacher marks it next week.'] },
  { name: 'Practice papers', what: 'Full practice exams from past and trial papers, laid out like your SACE or VCE paper.', img: '/home/exam-sace.jpg', old: ['Past papers (PDF)', 'Printed, half done, never marked.'] },
]

const Wordmark = ({ size }) => <span className="wm" style={size ? { fontSize: size } : undefined}>grade<span>farm.</span></span>

function Hero({ onStart, onTry }) {
  const [on, setOn] = useState(false)
  return (
    <header className="hero">
      <span className="glow a" aria-hidden="true" /><span className="glow b" aria-hidden="true" />
      <div className="in hg">
        <div>
          <h1 className="h1"><span className="s">The adaptive learning system for Australian students.</span></h1>
        </div>
        <div className={on ? 'on' : ''}>
          <div className="swr">
            <div className={`sw${on ? ' on' : ''}`} role="group" aria-label="Compare">
              <span className="thumb" aria-hidden="true" />
              <button type="button" aria-pressed={!on} onClick={() => setOn(false)}>Without gradefarm.</button>
              <button type="button" aria-pressed={on} onClick={() => setOn(true)}>With gradefarm.</button>
            </div>
          </div>
          <div className="stage">
            <div className="frame" aria-hidden={!on}>
              <div className="bar"><Wordmark /><small>SACE Mathematical Methods</small></div>
              <div className="adapt"><Wordmark /> identifies what you already know and what you need to work on.</div>
            </div>
            {PARTS.map((p, i) => (
              <div key={p.name} className={`tile t${i}`}>
                <div className="a" aria-hidden={on}><b>{p.old[0]}</b><span>{p.old[1]}</span></div>
                <div className="b" aria-hidden={!on}>
                  <div className="th"><img src={p.img} alt={`gradefarm. screen: ${p.name}`} loading="lazy" /></div>
                  <div><strong>{p.name}</strong><em>{p.what}</em></div>
                </div>
              </div>
            ))}
            <span className="hub" aria-hidden="true">Knows your level</span>
            <p className="mob-adapt"><Wordmark size={15} /> identifies what you already know and what you need to work on.</p>
            <p className="cap">Four separate things. None of them knows what you got wrong.</p>
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
        <h2 className="h2" id="gfx-cmp-h">Your textbook has the questions. Your tutor has an hour a week. <Wordmark /> is the rest.</h2>
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
        <Hero onStart={start} onTry={(e) => { e.preventDefault(); go('try') }} />
        <TryItBox onStart={start} onNext={(e) => { e.preventDefault(); go('inside') }} />
        <Inside open={openFeatures} />
        <Compare />
        <Subjects onPick={start} />

        <section className="sec" id="pricing" aria-labelledby="gfx-price-h">
          <div className="in">
            <h2 className="h2" id="gfx-price-h">Free plan vs paid plan</h2>
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
