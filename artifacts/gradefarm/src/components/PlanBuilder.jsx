import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Lock } from 'lucide-react'
import { tierPrice, money, perDay } from '../lib/pricing'
import { groupSubject } from '../lib/homeSubjects'
import { fitsStudent, stateBoard, subjectBoard, subjectYear, schoolStage, SCHOOL_STAGES } from '../lib/subjectFilter'

// "Build your plan": the subject list and the bill beside it, shared by the
// pricing page (signed out, PricingPage.jsx) and Get Access (signed in,
// GetAccessScreen.jsx). The list sits in the middle until the first tick,
// then moves aside as the bill slides in. NEXT_DELAY_MS after that, the bill
// offers a line for the next subject at its lower price, which takes them
// back to the list. Styles use the public site's colours (--lp-*, from
// SiteChrome themeVars), so a page puts PLAN_CSS in its <style> under them.

/** How long one subject sits on the bill before "+ Add a 2nd subject" is offered. */
export const NEXT_DELAY_MS = 15000

export const PLAN_CSS = `
.pp-seg { position: relative; display: inline-flex; border: 1px solid var(--lp-line); border-radius: 10px; overflow: hidden; background: var(--lp-card); margin-top: 4px; }
.pp-seg button { position: relative; z-index: 1; border: none; background: transparent; color: var(--lp-muted); font-family: inherit; font-size: 13.5px; font-weight: 800; padding: 9px 18px; cursor: pointer; transition: color 0.3s; }
.pp-seg button + button { border-left: 1px solid var(--lp-line); }
.pp-seg button[aria-pressed="true"] { background: var(--lp-on-bg); color: var(--lp-on-fg); }
.pp-seg small { font-size: 12px; font-weight: 700; color: var(--lp-ok); margin-left: 5px; transition: color 0.3s; }
.pp-seg button[aria-pressed="true"] small { color: inherit; opacity: 0.8; }
/* Weekly / Monthly: once measured, a dark pill slides between the two instead of the colour jumping. */
.pp-seg-thumb { position: absolute; top: 0; bottom: 0; left: 0; z-index: 0; background: var(--lp-on-bg); transition: transform 0.38s cubic-bezier(0.3, 0.8, 0.2, 1), width 0.38s cubic-bezier(0.3, 0.8, 0.2, 1); }
.pp-seg.live button[aria-pressed="true"] { background: transparent; }
.pp-seg.live button + button { border-left-color: transparent; }
/* Prices fade to their new amounts when the billing period changes. */
.pp-amt { display: inline-block; animation: ppIn 0.3s ease; }

.pp-build { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 380px); gap: 22px; margin-top: 34px; padding-bottom: 64px; align-items: start; }
/* Until a subject is ticked the list sits in the middle (half the bill's column plus the gap
   to the right); then it slides across to its spot as Your plan comes in. */
.pp-build .pp-list { transition: translate 0.55s cubic-bezier(0.2, 0.7, 0.2, 1); }
.pp-build.solo .pp-list { translate: calc((380px + 22px) / 2) 0; }
/* "Subjects for South Australia · Change", at the top of the list it filters. */
.pp-list-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px; font-size: 14px; color: var(--lp-muted); border-bottom: 1px solid var(--lp-line); }
.pp-list-top span { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }
.pp-list-top b { color: var(--lp-ink); }
.pp-list-top svg { color: var(--lp-gold-text); flex: none; }
.pp-list { overflow: hidden; }
.pp-list fieldset { border: none; margin: 0; padding: 0; min-width: 0; }
.pp-list fieldset + fieldset { border-top: 1px solid var(--lp-line); }
.pp-list legend { float: left; width: 100%; padding: 11px 18px; font-size: 13px; font-weight: 800; color: var(--lp-muted); background: var(--lp-subtle); border-bottom: 1px solid var(--lp-line); }
.pp-list label { clear: both; display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--lp-line); cursor: pointer; font-weight: 700; color: var(--lp-ink); }
.pp-list fieldset label:last-child { border-bottom: none; }
.pp-list label:hover { background: var(--lp-subtle); }
.pp-list label[data-on="true"] { background: var(--lp-sel-row); }
.pp-list label small { margin-left: auto; font-weight: 600; color: var(--lp-muted); font-size: 13px; white-space: nowrap; }
.pp-list input { width: 18px; height: 18px; margin: 0; flex: none; accent-color: var(--lp-on-bg); }
.pp-list .pp-msg { margin: 0; padding: 22px 18px; color: var(--lp-muted); }

/* Your plan only shows once a subject is ticked, and slides in beside the list (rises in below it on phones). */
.pp-rcpt { padding: 22px; display: flex; flex-direction: column; gap: 13px; position: sticky; top: 76px; color: var(--lp-ink); animation: ppSlideIn 0.45s cubic-bezier(0.2, 0.7, 0.2, 1) 0.12s both; }
.pp-rcpt p { margin: 0; }
@keyframes ppSlideIn { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
/* The "2nd subject" line opens up in the bill when it arrives (15 seconds after the first tick). */
.pp-next-wrap { display: grid; animation: ppOpen 0.45s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.pp-next-wrap > * { min-height: 0; overflow: hidden; }
@keyframes ppOpen { from { grid-template-rows: 0fr; opacity: 0; margin-bottom: -13px; } to { grid-template-rows: 1fr; opacity: 1; margin-bottom: 0; } }
.pp-rcpt > b { font-size: 16px; }
.pp-row { display: flex; justify-content: space-between; gap: 12px; font-size: 14.5px; font-variant-numeric: tabular-nums; }
.pp-row > span:first-child { min-width: 0; }
.pp-row .lv { color: var(--lp-muted); }
.pp-row.tot { border-top: 1px dashed var(--lp-line-2); padding-top: 12px; font-weight: 800; font-size: 17px; }
.pp-row.free { color: var(--lp-ok); font-weight: 700; }
/* "+ Add a 2nd subject": an empty line on the bill, with the cheaper price, that takes them back to the list. */
.pp-next { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border: 1.5px dashed var(--lp-sq3); border-radius: 10px; background: transparent; color: var(--lp-ink); font-family: inherit; font-size: 14.5px; font-weight: 700; text-align: left; cursor: pointer; animation: ppIn 0.3s ease; transition: background 0.15s; }
.pp-next:hover { background: var(--lp-sel-row); }
.pp-next .pl { color: var(--lp-gold-text); margin-right: 6px; }
.pp-next small { display: block; font-size: 12px; font-weight: 600; color: var(--lp-muted); }
.pp-next .pr { white-space: nowrap; font-variant-numeric: tabular-nums; }
.pp-next s { color: var(--lp-faint); font-weight: 600; margin-right: 6px; }
.pp-next b { color: var(--lp-gold-text); }
@keyframes ppIn { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }
@keyframes ppRise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
/* After tapping it, the subjects they could add light up for a moment. */
.pp-list.nudge label[data-on="false"] { animation: ppNudge 1.2s ease; }
@keyframes ppNudge { 0%, 100% { background: transparent; } 30% { background: var(--lp-sel-row); } }
.pp-day { text-align: center; background: var(--lp-sel-row); border-radius: 10px; padding: 9px 12px; font-size: 15px; font-weight: 700; }
.pp-day b { font-size: 18px; font-weight: 800; color: var(--lp-gold-text); font-variant-numeric: tabular-nums; }
.pp-note { font-size: 13px; color: var(--lp-muted); text-align: center; }
.pp-err { font-size: 13.5px; color: var(--lp-bad); background: var(--lp-bad-bg); border-radius: 9px; padding: 9px 12px; }
.pp-rcpt .lp-btn { width: 100%; }
/* Step 2, signed out: their name and email, then on to payment. */
.pp-step-top { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--lp-muted); }
.pp-step-top .lp-link { font-size: 13px; }
.pp-sum { background: var(--lp-sel-row); border-radius: 10px; padding: 10px 12px; font-size: 13.5px; line-height: 1.45; }
.pp-sum b { display: block; font-size: 14.5px; }
.pp-sum span { color: var(--lp-muted); }
.pp-form { display: flex; flex-direction: column; gap: 11px; animation: ppIn 0.3s ease; }
.pp-form label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; font-weight: 700; color: var(--lp-ink-2); }
.pp-form input { height: 46px; padding: 0 13px; border-radius: 10px; border: 1px solid var(--lp-line-2); background: var(--lp-card); color: var(--lp-ink); font: inherit; font-size: 15.5px; font-weight: 500; }
.pp-form input::placeholder { color: var(--lp-faint); }
.pp-form input:focus { outline: none; border-color: var(--lp-on-bg); box-shadow: 0 0 0 1px var(--lp-on-bg); }
.pp-form input[aria-invalid="true"] { border-color: var(--lp-bad); }
.pp-form .pp-ferr { font-size: 12.5px; font-weight: 600; color: var(--lp-bad); }
.pp-form .lp-btn { width: 100%; margin-top: 3px; }
.pp-secure { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12.5px; color: var(--lp-muted); }
.pp-fine { font-size: 12px; color: var(--lp-muted); text-align: center; line-height: 1.5; }
.pp-alt { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--lp-muted); border-top: 1px solid var(--lp-line); padding-top: 11px; }
.pp-alt .lp-link, .pp-fine .lp-link, .pp-err .lp-link { font-size: inherit; }

@media (prefers-reduced-motion: reduce) {
  .pp-next, .pp-next-wrap, .pp-amt, .pp-rcpt, .pp-list.nudge label { animation: none; }
  .pp-next, .pp-seg-thumb, .pp-seg button, .pp-build .pp-list { transition: none; }
}
@media (max-width: 860px) {
  .pp-build { grid-template-columns: 1fr; }
  .pp-build.solo .pp-list { translate: none; }
  .pp-rcpt { position: static; animation-name: ppRise; }
}
@media (max-width: 760px) {
  .pp-build { padding-bottom: 44px; }
}
`

/**
 * Weekly / Monthly, with a pill that slides to the one picked. Until the
 * buttons are measured the picked one just has the dark background.
 */
export function BillingToggle({ interval, onChange, saving, disabled = false }) {
  const week = useRef(null), month = useRef(null)
  const [thumb, setThumb] = useState(null)
  useLayoutEffect(() => {
    const el = (interval === 'month' ? month : week).current
    if (!el) return undefined
    const measure = () => setThumb({ x: el.offsetLeft, w: el.offsetWidth })
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure) // widths change once the font loads
    ro.observe(el.parentElement)
    return () => ro.disconnect()
  }, [interval])
  return (
    <div className={`pp-seg${thumb ? ' live' : ''}`} role="group" aria-label="Billing">
      {thumb && <span className="pp-seg-thumb" aria-hidden="true" style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }} />}
      <button ref={week} type="button" aria-pressed={interval === 'week'} disabled={disabled} onClick={() => onChange('week')}>Weekly</button>
      <button ref={month} type="button" aria-pressed={interval === 'month'} disabled={disabled} onClick={() => onChange('month')}>Monthly{saving ? <small>save {saving}%</small> : null}</button>
    </div>
  )
}

/**
 * Subjects ({ id, name, level }) that fit a student's state and year, under
 * Primary, Middle and High School, youngest year first. `keep` ids are listed
 * even if they don't fit (a subject they already chose). Each item is
 * { id, name, level, year, subject: { curriculumId, name, level }, source }.
 */
export function planGroups(subjects, { state = null, year = null, keep = [] } = {}) {
  const own = stateBoard(state)
  const out = SCHOOL_STAGES.map(g => ({ ...g, items: [] }))
  for (const s of subjects || []) {
    const subj = { name: s.name, stage: s.level }
    if (!keep.includes(s.id) && !fitsStudent(subj, { state, year })) continue
    const g = groupSubject({ name: s.name, level: s.level })
    if (!g.name) continue
    // In Victoria or South Australia the board goes without saying. Where both
    // can show (outside Australia), each says which it is.
    const board = subjectBoard(subj)
    const level = board && !own ? [board.toUpperCase(), g.level].filter(Boolean).join(' · ') : g.level
    out.find(x => x.id === schoolStage(subj)).items.push({
      id: s.id, name: g.name, level, year: subjectYear(subj) ?? 99,
      subject: { curriculumId: s.id, name: s.name, level: s.level || '' }, source: s,
    })
  }
  for (const g of out) g.items.sort((a, b) => a.year - b.year || a.name.localeCompare(b.name))
  return out.filter(g => g.items.length)
}

/** 2 → "2nd", 3 → "3rd", 11 → "11th". */
const ordinal = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`

/**
 * The list and the bill.
 * - `groups` from planGroups; `loading` while they load; `empty` shows when there are none.
 * - `top`: what the list's first row says (e.g. "Subjects for South Australia · Change").
 * - `picked` / `onPick(ids)`: the ticked subject ids.
 * - Prices: `tiers` (per subject, 1st, 2nd, …), `per` ('a week' | 'a month'),
 *   `onPlan` with `already` subjects on it (new ones are priced after those),
 *   `trialDays` a first plan starts with, `trialing` (adding ends the trial).
 * - `onCheckout(chosenItems)`, `busy`, `error`; `unavailable`: why paying can't happen now.
 * - `footer`: under the button (the free option).
 * - `details` (signed out): after the button, the bill turns into step 2,
 *   "Your details" (name and email), with { onBack, onSubmit({ name, email },
 *   chosen), busy, error, onSignIn(email, chosen), onParent(chosen) }.
 */
export default function PlanBuilder({
  groups, loading = false, empty = null, top = null, picked, onPick,
  tiers, per, onPlan = false, already = 0, trialDays = 0, trialing = false, introPrice = 0,
  onCheckout, busy = false, error = '', unavailable = '', footer = null, details = null,
}) {
  const all = groups.flatMap(g => g.items)
  const chosen = all.filter(x => picked.includes(x.id))
  const n = chosen.length
  const toggle = (id) => onPick(picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id])

  const lines = chosen.map((x, i) => ({ ...x, price: tierPrice(tiers, already + i + 1) }))
  const total = lines.reduce((a, l) => a + l.price, 0)
  const nextPrice = tierPrice(tiers, already + 2)
  // "+ Add a 2nd subject" waits until one subject has been on the bill for NEXT_DELAY_MS, then stays offered.
  const [nextReady, setNextReady] = useState(false)
  useEffect(() => {
    if (nextReady || n === 0) return undefined
    const t = setTimeout(() => setNextReady(true), NEXT_DELAY_MS)
    return () => clearTimeout(t)
  }, [nextReady, n > 0]) // eslint-disable-line react-hooks/exhaustive-deps
  const moreCostsLess = nextReady && n === 1 && nextPrice < lines[0].price

  const [nudge, setNudge] = useState(false)
  const listRef = useRef(null)
  // Back to the list (on phones it's above the bill), with focus on the first subject they could add.
  const addAnother = () => {
    const list = listRef.current
    if (!list) return
    list.scrollIntoView({ behavior: 'smooth', block: 'start' })
    list.querySelector('input:not(:checked)')?.focus({ preventScroll: true })
    setNudge(false)
    requestAnimationFrame(() => setNudge(true))
  }
  useEffect(() => {
    if (!nudge) return undefined
    const t = setTimeout(() => setNudge(false), 1300)
    return () => clearTimeout(t)
  }, [nudge])

  // A first weekly plan for one subject: $2 (introPrice) for its first week, instead of the trial.
  const intro = !onPlan && n === 1 && per === 'a week' && introPrice > 0 ? introPrice : 0
  const trial = !intro && !onPlan && n === 1 && trialDays > 0
  const cta = busy ? (onPlan ? 'Adding…' : 'Opening checkout…')
    : unavailable ? 'Payments are coming soon'
    : onPlan ? (trialing ? 'End trial and add' : `Add ${n === 1 ? 'this subject' : `${n} subjects`}`)
    : intro ? `Start for $${money(intro)}`
    : trial ? `Start ${trialDays}-day free trial`
    : n === 1 ? 'Start 1 subject' : `Start ${n} subjects`
  const note = intro ? `$${money(intro)} for your first week, then $${money(total)} ${per}. Cancel any time from your Account.`
    : trial ? null
    : onPlan && trialing ? `Your free trial covers one subject. Adding ${n === 1 ? 'this one' : 'these'} ends it today, and billing starts now.`
    : !onPlan && n > 1 && per === 'a week' && introPrice > 0 ? `The $${money(introPrice)} first week is for one subject. Start with one, and add the rest later.`
    : !onPlan && n > 1 && trialDays > 0 ? `The ${trialDays}-day free trial is for one subject. Start with one to try it free, and add the rest later.`
    : 'Cancel any time from your Account.'

  return (
    <div className={`pp-build${n ? '' : ' solo'}`}>
      <div className={`lp-card pp-list${nudge ? ' nudge' : ''}`} ref={listRef} style={{ scrollMarginTop: 76 }}>
        {top && <div className="pp-list-top">{top}</div>}
        {loading ? <p className="pp-msg">Loading subjects…</p>
          : !all.length ? <p className="pp-msg">{empty}</p>
          : groups.map(g => (
            <fieldset key={g.id}>
              <legend>{g.title}</legend>
              {g.items.map(x => {
                const on = picked.includes(x.id)
                return (
                  <label key={x.id} data-on={on}>
                    <input type="checkbox" checked={on} disabled={busy} onChange={() => toggle(x.id)} />
                    {x.name}
                    {x.level ? <small>{x.level}</small> : null}
                  </label>
                )
              })}
            </fieldset>
          ))}
      </div>

      {/* Your plan comes in once there's something on it. */}
      {n > 0 && (
        <div className="lp-card pp-rcpt" aria-live="polite">
          {details ? (
            <DetailsStep details={details} chosen={chosen}
              names={lines.map(l => l.name).join(', ')}
              summary={intro ? `$${money(intro)} for your first week, then $${money(total)} ${per} from ${dayAfter(7)}` : trial ? `${trialDays} days free, then $${money(total)} ${per} from ${dayAfter(trialDays)}` : `$${money(total)} ${per}`}
              today={`$${intro ? money(intro) : trial ? 0 : money(total)} today.`} />
          ) : (<>
          <b>Your plan</b>
          {onPlan && <p className="pp-note" style={{ textAlign: 'left' }}>You're on a plan with {already} subject{already === 1 ? '' : 's'}. New ones go on the same bill.</p>}
          {lines.map(l => (
            <div className="pp-row" key={l.id}><span>{l.name}{l.level ? <span className="lv"> · {l.level}</span> : null}</span><span className="pp-amt" key={per}>${money(l.price)}</span></div>
          ))}
          {moreCostsLess && (
            <div className="pp-next-wrap"><div>
              <button type="button" className="pp-next" onClick={addAnother}
                aria-label={`Add a ${ordinal(already + 2)} subject for $${money(nextPrice)} ${per} instead of $${money(lines[0].price)}. Each extra subject costs less.`}>
                <span><span className="pl" aria-hidden="true">+</span>Add a {ordinal(already + 2)} subject<small>Each extra subject costs less</small></span>
                <span className="pr pp-amt" key={per}><s>${money(lines[0].price)}</s><b>${money(nextPrice)}</b></span>
              </button>
            </div></div>
          )}
          <div className="pp-row tot"><span>{onPlan ? 'Added to your bill' : 'Total'}</span><span className="pp-amt" key={per}>${money(total)} {per}</span></div>
          <p className="pp-day">That's just <b className="pp-amt" key={per}>{perDay(total, per === 'a month' ? 'month' : 'week')}</b> a day.</p>
          {intro > 0 && <div className="pp-row free"><span>First week</span><span><s>${money(total)}</s> ${money(intro)}</span></div>}
          {trial && <div className="pp-row free"><span>First {trialDays} days</span><span>Free</span></div>}
          {!onPlan && <div className="pp-row"><span>Today</span><span><b>${intro ? money(intro) : trial ? 0 : money(total)}</b></span></div>}
          {error && <p className="pp-err" role="alert">{error}</p>}
          <button type="button" className="lp-btn gold lg" onClick={() => onCheckout(chosen)} disabled={busy || !!unavailable}>{cta}</button>
          {(unavailable || note) && <p className="pp-note">{unavailable || note}</p>}
          {footer}
          </>)}
        </div>
      )}
    </div>
  )
}

/** "Sat 21 Nov": the day `days` from today. */
const dayAfter = (days) => new Date(Date.now() + days * 86_400_000).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Step 2 of the bill, signed out: their name and email, then on to payment. */
function DetailsStep({ details, chosen, names, summary, today }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [tried, setTried] = useState(false)
  const nameErr = tried && !name.trim() ? 'Enter your name.' : ''
  const emailErr = tried && !EMAIL_RE.test(email.trim()) ? 'Enter your email address.' : ''
  const submit = (e) => {
    e.preventDefault()
    setTried(true)
    if (!name.trim() || !EMAIL_RE.test(email.trim())) return
    details.onSubmit({ name: name.trim(), email: email.trim().toLowerCase() }, chosen)
  }
  const { busy } = details
  return (
    <>
      <div className="pp-step-top">
        <button type="button" className="lp-link" onClick={details.onBack} disabled={busy}>← Your plan</button>
        <span>Step 2 of 2</span>
      </div>
      <b>Your details</b>
      <div className="pp-sum"><b>{names}</b><span>{summary}</span></div>
      <form className="pp-form" noValidate onSubmit={submit}>
        <label>Your name
          <input autoComplete="name" autoFocus value={name} onChange={e => setName(e.target.value)} disabled={busy} aria-invalid={!!nameErr} />
          {nameErr && <small className="pp-ferr">{nameErr}</small>}
        </label>
        <label>Email
          <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com"
            value={email} onChange={e => setEmail(e.target.value)} disabled={busy} aria-invalid={!!emailErr} />
          {emailErr && <small className="pp-ferr">{emailErr}</small>}
        </label>
        {details.error && <div className="pp-err" role="alert">{details.error}</div>}
        <button type="submit" className="lp-btn gold lg" disabled={busy}>{busy ? 'Opening payment…' : 'Continue to payment'}</button>
        <p className="pp-secure"><Lock size={12} aria-hidden="true" />{today}</p>
        <p className="pp-fine">By continuing you agree to the <a className="lp-link" href="/terms" target="_blank" rel="noreferrer">terms</a> and <a className="lp-link" href="/privacy" target="_blank" rel="noreferrer">privacy policy</a>.</p>
        <div className="pp-alt">
          <button type="button" className="lp-link" onClick={() => details.onParent(chosen)} disabled={busy}>Setting this up for your child?</button>
          <span>Have an account? <button type="button" className="lp-link" onClick={() => details.onSignIn(email.trim(), chosen)} disabled={busy}>Log in</button></span>
        </div>
      </form>
    </>
  )
}
