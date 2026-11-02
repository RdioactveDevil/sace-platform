import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPlatformSettings, getBillingConfig } from '../lib/db'
import { usePublicSubjects } from '../lib/publicSubjects'
import { SUBJECT_GROUPS, groupSubject } from '../lib/homeSubjects'
import { DEFAULT_STUDENT_TIERS, DEFAULT_MONTHLY_TIERS, studentTiers, tierPrice, monthlySaving, money } from '../lib/pricing'
import { rememberPendingCheckout, startCheckout, subjectTileFor } from '../lib/pendingCheckout'
import { SITE_CSS, SITE_FONTS, themeVars, Brand, SiteNav, SiteFooter, siteFooterLinks } from './SiteChrome'

// /pricing: "Build your plan". A student ticks the subjects they want and a
// receipt beside the list adds them up at the real per-subject prices
// (platform_settings.pricing, Admin → Settings), weekly or monthly.
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
  free_daily_questions: 20, free_daily_ai_messages: 10, student_trial_days: 7,
  tutor_plans: [
    { name: 'Starter', price: 59, students: 3, subjects: 1, recordings: false, parent_reports: false },
    { name: 'Pro', price: 89, students: 10, subjects: 3, recordings: true, parent_reports: true },
    { name: 'Agency', price: 129, students: 20, subjects: 999, recordings: true, parent_reports: true },
  ],
  annual_discount: 0.15,
}

const CSS = `${SITE_CSS}
.pp-head { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; padding-top: 44px; }
.pp-head h1 { font-size: clamp(34px, 5vw, 54px); font-weight: 800; line-height: 1.05; letter-spacing: -0.035em; }
.pp-head p { color: var(--lp-muted); font-size: 17px; max-width: 52ch; }
.pp-seg { display: inline-flex; border: 1px solid var(--lp-line); border-radius: 10px; overflow: hidden; background: var(--lp-card); margin-top: 4px; }
.pp-seg button { border: none; background: transparent; color: var(--lp-muted); font-size: 13.5px; font-weight: 800; padding: 9px 18px; cursor: pointer; }
.pp-seg button + button { border-left: 1px solid var(--lp-line); }
.pp-seg button[aria-pressed="true"] { background: var(--lp-on-bg); color: var(--lp-on-fg); }
.pp-seg small { font-size: 12px; font-weight: 700; color: var(--lp-ok); margin-left: 5px; }
.pp-seg button[aria-pressed="true"] small { color: inherit; opacity: 0.8; }

.pp-build { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 380px); gap: 22px; margin-top: 34px; padding-bottom: 64px; align-items: start; }
.pp-list { overflow: hidden; }
.pp-list fieldset { border: none; margin: 0; padding: 0; min-width: 0; }
.pp-list fieldset + fieldset { border-top: 1px solid var(--lp-line); }
.pp-list legend { float: left; width: 100%; padding: 11px 18px; font-size: 13px; font-weight: 800; color: var(--lp-muted); background: var(--lp-subtle); border-bottom: 1px solid var(--lp-line); }
.pp-list legend span { font-weight: 600; margin-left: 8px; }
.pp-list label { clear: both; display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--lp-line); cursor: pointer; font-weight: 700; }
.pp-list fieldset label:last-child { border-bottom: none; }
.pp-list label:hover { background: var(--lp-subtle); }
.pp-list label[data-on="true"] { background: var(--lp-sel-row); }
.pp-list label small { margin-left: auto; font-weight: 600; color: var(--lp-muted); font-size: 13px; white-space: nowrap; }
.pp-list input { width: 18px; height: 18px; margin: 0; flex: none; accent-color: var(--lp-on-bg); }
.pp-list .pp-msg { padding: 22px 18px; color: var(--lp-muted); }

.pp-rcpt { padding: 22px; display: flex; flex-direction: column; gap: 13px; position: sticky; top: 76px; }
.pp-rcpt > b { font-size: 16px; }
.pp-row { display: flex; justify-content: space-between; gap: 12px; font-size: 14.5px; font-variant-numeric: tabular-nums; }
.pp-row > span:first-child { min-width: 0; }
.pp-row .lv { color: var(--lp-muted); }
.pp-row.tot { border-top: 1px dashed var(--lp-line-2); padding-top: 12px; font-weight: 800; font-size: 17px; }
.pp-row.free { color: var(--lp-ok); font-weight: 700; }
.pp-note { font-size: 13px; color: var(--lp-muted); text-align: center; }
.pp-err { font-size: 13.5px; color: var(--lp-bad); background: var(--lp-bad-bg); border-radius: 9px; padding: 9px 12px; }
.pp-rcpt .lp-btn { width: 100%; }

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

@media (max-width: 860px) {
  .pp-build { grid-template-columns: 1fr; }
  .pp-rcpt { position: static; }
  .pp-tplans { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .pp-head { padding-top: 28px; }
  .pp-head p { font-size: 16px; }
  .pp-build { padding-bottom: 44px; }
  .pp-cmp table { min-width: 0; font-size: 13.5px; }
  .pp-cmp th, .pp-cmp td { padding: 10px 12px; }
}
`

/** The limit as tutor plans word it: 999 or more (or none) reads as every one. */
const limitText = (n, one, many, all) => (typeof n === 'number' && n > 0 && n < 999 ? `${n} ${n === 1 ? one : many}` : all)

export default function PricingPage({ theme = 'light', onToggleTheme, onSignIn, signedIn = false }) {
  const navigate = useNavigate()
  const [pricing, setPricing] = useState(DEFAULT_PRICING)
  const [billing, setBilling] = useState(null) // signed in: /api/billing/config
  const [interval, setBillInterval] = useState('week')
  const [picked, setPicked] = useState(null) // ids; null until the first subject is ticked for them
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showTutors, setShowTutors] = useState(false)
  const subjects = usePublicSubjects()

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

  // The live subjects in their groups, with the first one ticked to start with.
  const groups = useMemo(() => {
    const out = SUBJECT_GROUPS.map(g => ({ ...g, items: [] }))
    for (const s of subjects || []) {
      const g = groupSubject(s)
      if (g.name) out.find(x => x.id === g.group).items.push({ ...g, id: s.id, subject: { curriculumId: s.id, name: s.name, level: s.level || '' } })
    }
    return out.filter(g => g.items.length)
  }, [subjects])
  const all = groups.flatMap(g => g.items)
  const chosenIds = picked ?? (all[0] ? [all[0].id] : [])
  const chosen = all.filter(x => chosenIds.includes(x.id))
  const toggle = (id) => {
    setError('')
    setPicked(chosenIds.includes(id) ? chosenIds.filter(x => x !== id) : [...chosenIds, id])
  }

  const weekTiers = studentTiers(billing?.tiers || pricing.student_tiers)
  const monthTiers = studentTiers(billing?.monthlyTiers || pricing.student_monthly_tiers, 'month')
  // On a plan already: new subjects go on it, at its prices, after the ones it has.
  const onPlan = !!billing?.hasPlan
  const tiers = onPlan && billing.planTiers?.length ? billing.planTiers : interval === 'month' ? monthTiers : weekTiers
  const per = (onPlan ? billing.interval : interval) === 'month' ? 'a month' : 'a week'
  const already = onPlan ? billing.paidCount || 0 : 0
  const lines = chosen.map((x, i) => ({ ...x, price: tierPrice(tiers, already + i + 1) }))
  const total = lines.reduce((a, l) => a + l.price, 0)
  const saving = monthlySaving(weekTiers[0], monthTiers[0])
  const freeDaily = billing?.freeDailyQuestions ?? pricing.free_daily_questions ?? 20
  const freeAi = pricing.free_daily_ai_messages ?? 10
  // Days free on a first plan: signed in, the server says whether they still get it.
  const settingTrial = Math.max(0, Math.floor(Number(pricing.student_trial_days ?? 7)) || 0)
  const trialDays = billing ? billing.trialDays || 0 : settingTrial
  const trial = !onPlan && chosen.length === 1 && trialDays > 0

  const signUp = () => navigate('/auth', { state: { mode: 'signup' } })
  const homeSection = (id) => navigate('/home', { state: { scrollTo: id } })

  const checkout = async () => {
    if (!chosen.length) return
    const plan = { subjects: chosen.map(x => x.subject), interval }
    setError('')
    if (!signedIn) {
      rememberPendingCheckout(plan)
      signUp()
      return
    }
    setBusy(true)
    try {
      const result = await startCheckout(plan)
      if (result.hasPlan) navigate('/get-access', { state: { subject: subjectTileFor(plan.subjects[0]) } })
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  const cta = busy ? 'Opening checkout…'
    : onPlan ? `Add ${chosen.length === 1 ? 'this subject' : `${chosen.length} subjects`}`
    : trial ? `Start ${trialDays}-day free trial`
    : chosen.length === 1 ? 'Start 1 subject' : `Start ${chosen.length} subjects`

  const tutorPlans = (pricing.tutor_plans || []).slice(0, 3).map(p => ({
    name: p.name,
    price: p.price,
    items: [
      limitText(p.students, 'student', 'students', 'Any number of students'),
      limitText(p.subjects, 'subject', 'subjects', 'Every subject'),
      p.recordings !== false && 'Lesson recordings',
      p.parent_reports !== false && 'Weekly parent reports',
    ].filter(Boolean),
  }))
  const tutorFrom = tutorPlans.length ? Math.min(...tutorPlans.map(p => p.price)) : null
  const annualPct = Math.round((pricing.annual_discount ?? 0.15) * 100)

  const NAV = [['How it works', () => homeSection('how')], ['Subjects', () => homeSection('subjects')], ['Questions', () => homeSection('questions')], ['Pricing', () => window.scrollTo({ top: 0, behavior: 'smooth' }), true]]

  return (
    <div className="lp" style={{ ...themeVars(theme), colorScheme: theme === 'dark' ? 'dark' : 'light' }}>
      <style>{SITE_FONTS + CSS}</style>
      <SiteNav theme={theme} onToggleTheme={onToggleTheme} onSignIn={onSignIn || (() => navigate('/auth'))} onStart={signUp}
        onLogo={() => navigate('/home')} links={NAV} />

      <main>
        <div className="lp-in">
          <div className="pp-head">
            <h1>Build your plan.</h1>
            <p>Pick the subjects you want. The first is ${money(tiers[0])} {per}, and each extra one costs less.</p>
            {!onPlan && (
              <div className="pp-seg" role="group" aria-label="Billing">
                <button type="button" aria-pressed={interval === 'week'} onClick={() => setBillInterval('week')}>Weekly</button>
                <button type="button" aria-pressed={interval === 'month'} onClick={() => setBillInterval('month')}>Monthly{saving ? <small>save {saving}%</small> : null}</button>
              </div>
            )}
          </div>

          <div className="pp-build">
            <div className="lp-card pp-list">
              {subjects === null ? <p className="pp-msg">Loading subjects…</p>
                : !all.length ? <p className="pp-msg">Couldn't load the subjects just now. <button type="button" className="lp-link" onClick={signUp}>Make an account</button> and pick yours inside.</p>
                : groups.map(g => (
                  <fieldset key={g.id}>
                    <legend>{g.title}{g.note ? <span>{g.note}</span> : null}</legend>
                    {g.items.map(x => {
                      const on = chosenIds.includes(x.id)
                      return (
                        <label key={x.id} data-on={on}>
                          <input type="checkbox" checked={on} onChange={() => toggle(x.id)} />
                          {x.name}
                          {x.level ? <small>{x.level}</small> : null}
                        </label>
                      )
                    })}
                  </fieldset>
                ))}
            </div>

            <div className="lp-card pp-rcpt" aria-live="polite">
              <b>Your plan</b>
              {onPlan && <p className="pp-note" style={{ textAlign: 'left' }}>You're on a plan with {already} subject{already === 1 ? '' : 's'}. New ones go on the same bill.</p>}
              {!chosen.length ? (
                <p className="pp-note" style={{ textAlign: 'left', fontSize: 14 }}>
                  {all.length ? 'Pick at least one subject.' : 'Your subjects will show here.'} Or <button type="button" className="lp-link" onClick={signUp}>start free</button> with one subject, {freeDaily} questions a day.
                </p>
              ) : (
                <>
                  {lines.map(l => (
                    <div className="pp-row" key={l.id}><span>{l.name}{l.level ? <span className="lv"> · {l.level}</span> : null}</span><span>${money(l.price)}</span></div>
                  ))}
                  <div className="pp-row tot"><span>{onPlan ? 'Added to your bill' : 'Total'}</span><span>${money(total)} {per}</span></div>
                  {trial && <div className="pp-row free"><span>First {trialDays} days</span><span>Free</span></div>}
                  {!onPlan && <div className="pp-row"><span>Today</span><span><b>${trial ? 0 : money(total)}</b></span></div>}
                  {error && <p className="pp-err" role="alert">{error}</p>}
                  <button type="button" className="lp-btn gold lg" onClick={checkout} disabled={busy}>{cta}</button>
                  {trial ? <p className="pp-note">Card required. Cancel before day {trialDays} and you pay nothing.</p>
                    : !onPlan && chosen.length > 1 && trialDays > 0 ? <p className="pp-note">The {trialDays}-day free trial is for one subject. Start with one to try it free, and add the rest later.</p>
                    : <p className="pp-note">Cancel any time from your Account.</p>}
                  {!onPlan && <p className="pp-note">Or <button type="button" className="lp-link" onClick={signUp}>start free</button> with one subject.</p>}
                </>
              )}
            </div>
          </div>
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
                <tr><th>Exam mode</th><td className="no">No</td><td className="st">Yes</td></tr>
                <tr><th>Price</th><td>$0</td><td className="st">${money(weekTiers[0])} a week, or ${money(monthTiers[0])} a month</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="lp-in lp-sec" aria-labelledby="pp-faq">
          <div className="lp-sec-head"><h2 id="pp-faq">Questions about paying</h2></div>
          <div className="lp-faq pp-faq">
            {settingTrial > 0 && <details open><summary>How does the free trial work?</summary><p>Your first paid subject starts with {settingTrial} days free. We take a card when you start, charge nothing for {settingTrial} days, and you can cancel in your Account before then and pay nothing.</p></details>}
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
            <p style={{ color: 'var(--lp-muted)' }}><Brand /> is free for one subject, {freeDaily} questions a day. No card.</p>
            <button type="button" className="lp-btn gold lg" onClick={signUp}>Start free</button>
          </div>
        </section>
      </main>

      <SiteFooter links={siteFooterLinks(navigate, homeSection)} />
    </div>
  )
}
