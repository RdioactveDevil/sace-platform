import { useState, useEffect, useMemo, useRef } from 'react'
import { Check, MapPin } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getPlatformSettings, getBillingConfig, quickSignUp } from '../lib/db'
import { usePublicSubjects } from '../lib/publicSubjects'
import { DEFAULT_STUDENT_TIERS, DEFAULT_MONTHLY_TIERS, studentTiers, monthlySaving, money } from '../lib/pricing'
import { rememberPendingCheckout, takePendingCheckout, startCheckout } from '../lib/pendingCheckout'
import { AU_STATES, stateLabel, isStateCode, rememberedState, rememberState } from '../lib/subjectFilter'
import { SITE_CSS, SITE_FONTS, themeVars, SiteNav, SiteFooter, siteFooterLinks } from './SiteChrome'
import PlanBuilder, { PLAN_CSS, BillingToggle, planGroups } from './PlanBuilder'
import CitySkyline from './CitySkyline'

// /pricing: "Build your plan". It first asks which state they're in, and
// nothing else (a signed-in student's profile already says, so they skip
// it). The list then shows that state's subjects and the ones every state
// shares (lib/subjectFilter.js fitsStudent), under Primary, Middle and High
// School, and the bill beside it adds them up at the real per-subject prices
// (platform_settings.pricing, Admin → Settings), weekly or monthly. The list
// and bill are PlanBuilder.jsx, shared with Get Access.
//
// Signed out, the bill's button turns it into step 2: just their name and
// email. That makes their account (lib/db.js quickSignUp, no password yet)
// with the plan kept (lib/pendingCheckout.js), and App.jsx takes them
// straight on to Stripe Checkout; onboarding then asks them to choose a
// password. Signing in, or a parent's sign-up, keeps the plan the same way.
//
// The free trial covers one subject (api-server routes/billing.ts): with one
// ticked the receipt says "Today $0"; with more, billing starts today.
// Checkout takes every ticked subject at once. Signed out, the plan is kept
// (lib/pendingCheckout.js) while they make an account, and App.jsx carries on
// to Checkout once they're in.
//
// Below: the free plan against the paid one, questions about paying, a box for tutors, and
// the homepage's nav and footer (SiteChrome.jsx).

const DEFAULT_PRICING = {
  student_tiers: DEFAULT_STUDENT_TIERS, student_monthly_tiers: DEFAULT_MONTHLY_TIERS,
  free_daily_questions: 20, free_daily_ai_messages: 10, free_daily_marked_answers: 5, student_trial_days: 7, student_intro_price: 2,
  tutor_plans: [
    { name: 'Starter', price: 59, students: 3, subjects: 1, subject_swaps: false, recordings: false, parent_reports: false },
    { name: 'Pro', price: 89, students: 10, subjects: 3, subject_swaps: true, recordings: true, parent_reports: true },
    { name: 'Agency', price: 129, students: 20, subjects: 999, subject_swaps: true, recordings: true, parent_reports: true },
  ],
  annual_discount: 0.15,
}

const CSS = `${SITE_CSS}${PLAN_CSS}
.pp-head { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; padding-top: 44px; }
/* Weekly / Monthly sits halfway between the heading's baseline and the list (32px either side). */
.pp-head .pp-seg { margin-top: 12px; }
.pp-build { margin-top: 32px; }
/* Their state's capital, a faint silhouette along the bottom of the screen behind everything (CitySkyline.jsx). */
.pp-city { position: fixed; left: 0; right: 0; bottom: 0; height: clamp(150px, 30vh, 280px); z-index: -1; pointer-events: none; color: var(--lp-ink); opacity: var(--pp-city-o);
  -webkit-mask-image: linear-gradient(to top, #000 45%, transparent); mask-image: linear-gradient(to top, #000 45%, transparent); animation: ppCityIn 1.1s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.pp-city svg { display: block; width: 100%; height: 100%; }
@keyframes ppCityIn { from { opacity: 0; transform: translateY(30px); } to { opacity: var(--pp-city-o); transform: none; } }
.pp-head h1 { font-size: clamp(34px, 5vw, 54px); font-weight: 800; line-height: 1.05; letter-spacing: -0.035em; }
.pp-head p { color: var(--lp-muted); font-size: 17px; max-width: 52ch; }
/* Which state are you in? The only thing on the page until they answer. */
.pp-ask { min-height: calc(100vh - 140px); min-height: calc(100svh - 140px); justify-content: center; padding-bottom: 64px; gap: 28px; }
.pp-states { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; width: 100%; max-width: 620px; }
.pp-states button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 56px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--lp-line); background: var(--lp-card); color: var(--lp-ink); font-size: 15.5px; font-weight: 700; cursor: pointer; transition: border-color 0.15s, transform 0.2s, background 0.2s, color 0.2s, opacity 0.25s; }
.pp-states button:hover { border-color: var(--lp-gold); transform: translateY(-1px); }
.pp-states button[aria-pressed="true"] { border-color: var(--lp-on-bg); box-shadow: 0 0 0 1px var(--lp-on-bg); background: var(--lp-sel-row); }
/* Picking a state: it turns green with a tick, the rest fall back, then the question slides away. */
.pp-states.leaving button { cursor: default; }
.pp-states.leaving button:not(.go) { opacity: 0.35; transform: scale(0.97); }
.pp-states button.go { background: var(--pp-go); border-color: var(--pp-go); color: var(--pp-go-fg); box-shadow: 0 10px 24px -10px var(--pp-go); animation: ppPop 0.4s ease; }
.pp-tick { animation: ppTick 0.35s ease 0.05s both; }
@keyframes ppPop { 0%, 100% { transform: scale(1); } 40% { transform: scale(1.06); } }
@keyframes ppTick { from { opacity: 0; transform: scale(0.3) rotate(-25deg); } to { opacity: 1; transform: none; } }
.pp-ask { animation: ppRise 0.35s ease both; }
.pp-ask.out { animation: ppOut 0.22s ease forwards; }
@keyframes ppOut { to { opacity: 0; transform: translateY(-16px); } }
/* Then the plan comes up: heading, list, bill, one after another. */
.pp-enter .pp-head, .pp-enter .pp-list { animation: ppRise 0.45s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.pp-enter .pp-list { animation-delay: 0.08s; }
.pp-enter ~ .lp-sec { animation: ppRise 0.45s ease 0.16s both; }
.pp-head h1:focus { outline: none; }

.pp-cmp { overflow-x: auto; margin: 26px auto 0; max-width: 860px; }
.pp-cmp table { width: 100%; border-collapse: collapse; min-width: 500px; font-size: 14.5px; }
.pp-cmp th, .pp-cmp td { padding: 12px 18px; border-bottom: 1px solid var(--lp-line); text-align: left; }
.pp-cmp thead th { font-size: 13px; color: var(--lp-muted); }
.pp-cmp tbody th { font-weight: 700; }
.pp-cmp td { color: var(--lp-ink-2); }
.pp-cmp .st { background: var(--lp-sel-row); color: var(--lp-ink); font-weight: 700; }
.pp-cmp .no { color: var(--lp-faint); }
.pp-cmp tr:last-child th, .pp-cmp tr:last-child td { border-bottom: none; }
.pp-faq { max-width: 760px; margin-left: auto; margin-right: auto; }

.pp-tut { max-width: 860px; margin: 0 auto; padding: 20px 22px; display: flex; flex-direction: column; gap: 16px; }
.pp-tut-top { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
.pp-tut-top b { font-size: 16px; display: block; }
.pp-tut-top span { color: var(--lp-muted); }
.pp-tplans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--lp-line); padding-top: 16px; gap: 18px; }
.pp-tplans .nm { font-weight: 800; display: block; }
.pp-tplans .p { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; display: block; margin: 2px 0 8px; font-variant-numeric: tabular-nums; }
.pp-tplans .p small { font-size: 13px; font-weight: 600; color: var(--lp-muted); letter-spacing: 0; }
.pp-tplans ul { margin: 0; padding: 0 0 0 18px; color: var(--lp-ink-2); font-size: 14px; display: grid; gap: 4px; }
.pp-tut-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.pp-tut-foot span { color: var(--lp-muted); font-size: 13.5px; }

.lp-end { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 20px; }
.lp-end h2 { font-size: clamp(28px, 4vw, 44px); font-weight: 800; letter-spacing: -0.03em; }

@media (prefers-reduced-motion: reduce) {
  .pp-city { animation: none; }
  .pp-states button, .pp-tick, .pp-ask, .pp-enter .pp-head, .pp-enter .pp-list, .pp-enter ~ .lp-sec { animation: none; }
  .pp-states button { transition: none; }
  .pp-states.leaving button:not(.go) { transform: none; }
}
@media (max-width: 860px) {
  .pp-tplans { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .pp-states { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pp-head { padding-top: 28px; }
  .pp-head p { font-size: 16px; }
  .pp-cmp table { min-width: 0; font-size: 13.5px; }
  .pp-cmp th, .pp-cmp td { padding: 10px 12px; }
}
`

/** The limit as tutor plans word it: 999 or more (or none) reads as every one. */
const limitText = (n, one, many, all) => (typeof n === 'number' && n > 0 && n < 999 ? `${n} ${n === 1 ? one : many}` : all)

export default function PricingPage({ theme = 'light', onSignIn, signedIn = false, profileState = null }) {
  const navigate = useNavigate()
  const [pricing, setPricing] = useState(DEFAULT_PRICING)
  const [billing, setBilling] = useState(null) // signed in: /api/billing/config
  const [interval, setBillInterval] = useState('week')
  const [picked, setPicked] = useState([]) // ids of the ticked subjects
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showTutors, setShowTutors] = useState(false)
  const subjects = usePublicSubjects()
  // Their state: from their profile if signed in, else what they picked here last time.
  const [studyState, setStudyState] = useState(() => (isStateCode(profileState) ? profileState : rememberedState()))
  const [changingState, setChangingState] = useState(false)
  useEffect(() => { if (isStateCode(profileState)) setStudyState(s => s || profileState) }, [profileState])
  const askState = !studyState || changingState
  const pickState = (code) => {
    setStudyState(code)
    setChangingState(false)
    setPicked([])
    setError('')
    setDetails(false)
    rememberState(code)
    window.scrollTo(0, 0)
  }
  // Tapping a state: it goes green with a tick (leaving), the question slides
  // out (askOut), then the plan comes up (entering) with focus on its heading.
  const [leaving, setLeaving] = useState(null)
  const [askOut, setAskOut] = useState(false)
  const [entering, setEntering] = useState(false)
  const timers = useRef([])
  const planHeading = useRef(null)
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const chooseState = (code) => {
    if (leaving) return
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const later = (ms, fn) => timers.current.push(setTimeout(fn, ms))
    setLeaving(code)
    later(calm ? 250 : 480, () => setAskOut(true))
    later(calm ? 250 : 700, () => {
      pickState(code)
      setLeaving(null)
      setAskOut(false)
      setEntering(true)
    })
    later(calm ? 300 : 1500, () => setEntering(false))
  }
  useEffect(() => { if (entering) planHeading.current?.focus({ preventScroll: true }) }, [entering])

  useEffect(() => { window.scrollTo(0, 0) }, [])
  useEffect(() => {
    getPlatformSettings('pricing').then(val => {
      if (val) setPricing({ ...DEFAULT_PRICING, ...val, tutor_plans: val.tutor_plans?.length ? val.tutor_plans : DEFAULT_PRICING.tutor_plans })
    }).catch(() => {})
  }, [])
  useEffect(() => {
    if (!signedIn) { setBilling(null); return }
    getBillingConfig().then(setBilling).catch(() => {})
  }, [signedIn])

  // The live subjects for their state under Primary, Middle and High School, youngest year first.
  const groups = useMemo(() => planGroups(subjects, { state: studyState }), [subjects, studyState])
  const pick = (ids) => { setError(''); setPicked(ids); if (!ids.length) setDetails(false) }

  const weekTiers = studentTiers(billing?.tiers || pricing.student_tiers)
  const monthTiers = studentTiers(billing?.monthlyTiers || pricing.student_monthly_tiers, 'month')
  // On a plan already: new subjects go on it, at its prices, after the ones it has.
  const onPlan = !!billing?.hasPlan
  const tiers = onPlan && billing.planTiers?.length ? billing.planTiers : interval === 'month' ? monthTiers : weekTiers
  const per = (onPlan ? billing.interval : interval) === 'month' ? 'a month' : 'a week'
  const already = onPlan ? billing.paidCount || 0 : 0
  const saving = monthlySaving(weekTiers[0], monthTiers[0])
  const freeDaily = billing?.freeDailyQuestions ?? pricing.free_daily_questions ?? 20
  const freeAi = pricing.free_daily_ai_messages ?? 10
  const freeMarked = typeof pricing.free_daily_marked_answers === 'number' && pricing.free_daily_marked_answers >= 0 ? Math.floor(pricing.free_daily_marked_answers) : 5
  // Days free on a first plan: signed in, the server says whether they still get it.
  const settingTrial = Math.max(0, Math.floor(Number(pricing.student_trial_days ?? 7)) || 0)
  const trialDays = billing ? billing.trialDays || 0 : settingTrial
  // $ for the first week of a first weekly plan (one subject); signed in, the server says whether they still get it.
  const settingIntro = Math.max(0, Number(pricing.student_intro_price ?? 2) || 0)
  const introPrice = billing ? billing.introPrice || 0 : settingIntro < weekTiers[0] ? settingIntro : 0

  const signUp = () => navigate('/auth', { state: { mode: 'signup' } })
  const homeSection = (id) => navigate('/home', { state: { scrollTo: id } })

  // Signed out: step 2 of the bill, their name and email.
  const [details, setDetails] = useState(false)
  const [detailsBusy, setDetailsBusy] = useState(false)
  const [detailsError, setDetailsError] = useState(null)
  const planOf = (chosen) => ({ subjects: chosen.map(x => x.subject), interval })
  const signInWith = (email, chosen) => { rememberPendingCheckout(planOf(chosen)); navigate('/auth', { state: email ? { email } : undefined }) }
  const parentSignUp = (chosen) => { rememberPendingCheckout(planOf(chosen)); navigate('/auth', { state: { mode: 'signup', as: 'parent' } }) }
  const submitDetails = async ({ name, email }, chosen) => {
    setDetailsBusy(true)
    setDetailsError(null)
    // Kept first: once the account exists, App.jsx opens Checkout for it.
    rememberPendingCheckout(planOf(chosen))
    try {
      const data = await quickSignUp(email, name)
      if (!data.session) {
        // Only if the project asks for email confirmation: the link signs them in, then Checkout.
        setDetailsError(`We've sent a link to ${email}. Open it to confirm your email and you'll go on to payment.`)
        setDetailsBusy(false)
      }
    } catch (e) {
      if (e.code === 'user_already_exists') {
        setDetailsError(<>That email already has an account. <button type="button" className="lp-link" onClick={() => navigate('/auth', { state: { email } })}>Log in</button> to carry on with this plan.</>)
      } else {
        takePendingCheckout() // nothing was made, so forget it
        setDetailsError(e.message || "We couldn't set that up. Please try again.")
      }
      setDetailsBusy(false)
    }
  }

  const checkout = async (chosen) => {
    if (!chosen.length) return
    const plan = planOf(chosen)
    setError('')
    if (!signedIn) {
      setDetailsError(null)
      setDetails(true)
      return
    }
    setBusy(true)
    try {
      const result = await startCheckout(plan)
      // Already on a plan: Get Access adds them to it.
      if (result.hasPlan) navigate('/get-access', { state: { plan } })
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  const tutorPlans = (pricing.tutor_plans || []).slice(0, 3).map(p => ({
    name: p.name,
    price: p.price,
    items: [
      limitText(p.students, 'student', 'students', 'Any number of students'),
      `${limitText(p.subjects, 'subject', 'subjects', 'Every subject')}${typeof p.subjects === 'number' && p.subjects > 0 && p.subjects < 999 && p.subject_swaps === false ? " (can't be swapped)" : ''}`,
      p.recordings !== false && 'Lesson recordings',
      p.parent_reports !== false && 'Weekly parent reports',
    ].filter(Boolean),
  }))
  const tutorFrom = tutorPlans.length ? Math.min(...tutorPlans.map(p => p.price)) : null
  const annualPct = Math.round((pricing.annual_discount ?? 0.15) * 100)

  const NAV = [['Features', () => navigate('/features')], ['Subjects', () => homeSection('subjects')], ['Pricing', () => window.scrollTo({ top: 0, behavior: 'smooth' }), true]]

  return (
    <div className="lp" style={{ ...themeVars(theme), colorScheme: theme === 'dark' ? 'dark' : 'light',
      // The green a picked state turns: dark enough for white text on light, light enough for navy on dark.
      '--pp-go': theme === 'dark' ? '#5bb98c' : '#047857', '--pp-go-fg': theme === 'dark' ? '#0c1037' : '#ffffff',
      // The city skyline sits behind the page's content (z-index -1 inside this stacking context).
      isolation: 'isolate', '--pp-city-o': theme === 'dark' ? 0.06 : 0.07 }}>
      <style>{SITE_FONTS + CSS}</style>
      <SiteNav onSignIn={onSignIn || (() => navigate('/auth'))} onStart={signUp}
        onLogo={() => navigate('/home')} links={NAV} />

      {!askState && <CitySkyline key={studyState} state={studyState} className="pp-city" />}

      <main>
        {askState ? (
          <div className="lp-in">
            <div className={`pp-head pp-ask${askOut ? ' out' : ''}`}>
              <h1 id="pp-ask">Which state are you in?</h1>
              <div className={`pp-states${leaving ? ' leaving' : ''}`} role="group" aria-labelledby="pp-ask">
                {AU_STATES.map(([code, label]) => (
                  <button key={code} type="button" className={leaving === code ? 'go' : undefined}
                    aria-pressed={(leaving || studyState) === code} aria-disabled={leaving ? true : undefined} onClick={() => chooseState(code)}>
                    {leaving === code && <Check className="pp-tick" size={19} strokeWidth={3} aria-hidden="true" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
        <>
        <div className={`lp-in${entering ? ' pp-enter' : ''}`}>
          <div className="pp-head">
            <h1 ref={planHeading} tabIndex={-1}>Build your plan.</h1>
            {!onPlan && <BillingToggle interval={interval} onChange={setBillInterval} saving={saving} />}
          </div>

          <PlanBuilder
            groups={groups} loading={subjects === null} picked={picked} onPick={pick}
            top={<>
              <span><MapPin size={16} aria-hidden="true" />Subjects for <b>{stateLabel(studyState)}</b></span>
              <button type="button" className="lp-link" onClick={() => { setChangingState(true); window.scrollTo(0, 0) }}>Change</button>
            </>}
            empty={subjects?.length
              ? <>No subjects for {stateLabel(studyState)} yet. <button type="button" className="lp-link" onClick={() => setChangingState(true)}>Pick another state</button>.</>
              : <>Couldn't load the subjects just now. <button type="button" className="lp-link" onClick={signUp}>Make an account</button> and pick yours inside.</>}
            tiers={tiers} per={per} onPlan={onPlan} already={already} trialDays={trialDays} introPrice={onPlan ? 0 : introPrice} trialing={!!billing?.trialing}
            onCheckout={checkout} busy={busy} error={error}
            details={details && !signedIn ? { onBack: () => setDetails(false), onSubmit: submitDetails, busy: detailsBusy, error: detailsError, onSignIn: signInWith, onParent: parentSignUp } : null}
            unavailable={billing?.enabled === false ? "Payments aren't switched on yet. You can start free in the meantime." : ''}
            footer={!onPlan && <p className="pp-note">Or <button type="button" className="lp-link" onClick={signUp}>start free</button> with limited features.</p>} />
        </div>

        <section className="lp-in lp-sec" aria-labelledby="pp-cmp">
          <div className="lp-sec-head"><h2 id="pp-cmp">Free Plan vs Paid Plan</h2></div>
          <div className="lp-card pp-cmp">
            <table>
              <thead><tr><th><span className="lp-sr">What you get</span></th><th>Free</th><th className="st">Paid</th></tr></thead>
              <tbody>
                <tr><th>Subjects</th><td>One, swap any time</td><td className="st">Any you add</td></tr>
                <tr><th>Questions a day</th><td>{freeDaily}</td><td className="st">No limit</td></tr>
                <tr><th>Titan messages a day</th><td>{freeAi}</td><td className="st">No limit</td></tr>
                <tr><th>Worked solutions</th><td>Every question</td><td className="st">Every question</td></tr>
                <tr><th>Wrong answers come back</th><td>Yes</td><td className="st">Yes</td></tr>
                <tr><th>Written answers marked a day</th><td className={freeMarked ? undefined : 'no'}>{freeMarked || 'No'}</td><td className="st">No limit</td></tr>
                <tr><th>Exam mode</th><td className="no">No</td><td className="st">Yes</td></tr>
                <tr><th>Printable practice exams</th><td className="no">No</td><td className="st">Yes</td></tr>
                <tr><th>Price</th><td>$0</td><td className="st">${money(weekTiers[0])} a week, or ${money(monthTiers[0])} a month</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="lp-in lp-sec" aria-labelledby="pp-faq">
          <div className="lp-sec-head"><h2 id="pp-faq">Questions about paying</h2></div>
          <div className="lp-faq pp-faq">
            {settingIntro > 0 && settingIntro < weekTiers[0] && <details open><summary>How does the ${money(settingIntro)} first week work?</summary><p>Your first subject on weekly billing costs ${money(settingIntro)} for its first week, then ${money(weekTiers[0])} a week. Cancel any time in your Account.</p></details>}
            {settingTrial > 0 && <details><summary>How does the free trial work?</summary><p>Your first paid subject on monthly billing starts with {settingTrial} days free. We take a card when you start, charge nothing for {settingTrial} days, and you can cancel in your Account before then and pay nothing.</p></details>}
            <details open={settingTrial === 0}><summary>Can I cancel any time?</summary><p>Yes, from your Account, whenever you like. There's no contract.</p></details>
            <details><summary>What happens after {freeDaily} questions on the free plan?</summary><p>You can carry on tomorrow, or go unlimited on that subject.</p></details>
            <details><summary>Can I change my free subject?</summary><p>Yes, any time.</p></details>
            <details><summary>Weekly or monthly?</summary><p>{saving ? `Monthly is about ${saving}% cheaper: ` : 'Either: '}${money(monthTiers[0])} a month for your first subject instead of ${money(weekTiers[0])} a week. Extra subjects are ${monthTiers.slice(1).map(money).join(', then $') || money(monthTiers[0])} a month.</p></details>
            <details><summary>What if I want more subjects?</summary><p>Each one costs less than the last: ${weekTiers.slice(1).map(money).join(' a week for the second and $')}{weekTiers.length > 2 ? ' for each after that' : ' a week each'}, all on one bill.{settingTrial > 0 ? ' The free trial covers one subject, so adding another during it ends the trial and billing starts that day.' : ''}</p></details>
          </div>
        </section>

        {tutorPlans.length > 0 && (
          <section className="lp-in lp-sec" aria-label="For tutors">
            <div className="lp-card pp-tut">
              <div className="pp-tut-top">
                <div><b>Tutoring?</b><span>Plans for tutors start at ${money(tutorFrom)} a month, and your students get the subjects you teach free.</span></div>
                <button type="button" className="lp-link" aria-expanded={showTutors} aria-controls="pp-tplans" onClick={() => setShowTutors(v => !v)}>{showTutors ? 'Hide tutor plans' : 'See tutor plans'}</button>
              </div>
              {showTutors && (
                <>
                  <div className="pp-tplans" id="pp-tplans">
                    {tutorPlans.map(p => (
                      <div key={p.name}>
                        <span className="nm">{p.name}</span>
                        <span className="p">${money(p.price)}<small> a month</small></span>
                        <ul>{p.items.map(t => <li key={t}>{t}</li>)}</ul>
                      </div>
                    ))}
                  </div>
                  <div className="pp-tut-foot">
                    <span>{annualPct > 0 ? `Pay yearly and save ${annualPct}%.` : 'Billed monthly.'}</span>
                    <button type="button" className="lp-btn" onClick={() => navigate('/auth/tutor')}>Start as a tutor</button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        <section className="lp-in lp-sec">
          <div className="lp-end">
            <h2>Start with one subject, free.</h2>
            <button type="button" className="lp-btn gold lg" onClick={signUp}>Start free</button>
          </div>
        </section>
        </>
        )}
      </main>

      <SiteFooter links={siteFooterLinks(navigate, homeSection)} />
    </div>
  )
}
