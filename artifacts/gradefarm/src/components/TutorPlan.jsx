import { useEffect, useState } from 'react'
import { THEMES } from '../lib/theme'
import { getTutorBilling, chooseTutorPlan, openTutorBillingPortal, removeTutorPlanSubject, syncCheckout } from '../lib/db'

// Tutor plans (api-server lib/tutor-plan.ts): the tutor portal needs a live
// plan unless the tutor is an admin or an admin made them exempt.
// TutorPlanGate shows the plan picker instead of the portal until then;
// TutorPlanTab is the portal's "Plan & billing" tab.

const PURPLE = '#a78bfa'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const studentsText = (n) => (n == null ? 'Unlimited students' : `Up to ${n} students`)
const subjectsText = (n) => (n == null ? 'Every subject' : n === 1 ? '1 subject' : `Up to ${n} subjects`)

/** What a plan includes, for its card: [text, included]. */
const planFeatures = (plan) => [
  [studentsText(plan.students), true],
  [`${subjectsText(plan.subjects)}${plan.subjects != null && !plan.subjectSwaps ? ' (can’t be swapped)' : ''}`, true],
  ['Assignments, sessions, messages & progress', true],
  ['Lesson recordings', plan.recordings],
  ['Weekly parent progress reports', plan.parentReports],
]
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

function useCard(theme) {
  const t = THEMES[theme]
  return theme === 'dark'
    ? { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20 }
    : { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, boxShadow: t.shadowCard }
}

/** Back from Stripe Checkout (?plan_checkout=success&session_id=…): record the plan, then tidy the URL. */
async function finishCheckout() {
  const params = new URLSearchParams(window.location.search)
  const result = params.get('plan_checkout')
  if (!result) return
  const sessionId = params.get('session_id')
  params.delete('plan_checkout'); params.delete('session_id')
  const rest = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`)
  if (result === 'success' && sessionId) await syncCheckout(sessionId).catch(() => {})
}

/** The plans on offer, monthly or annual, each with a button to choose it. */
function TutorPlanPicker({ billing, theme, onChanged }) {
  const t = THEMES[theme]
  const card = useCard(theme)
  const [period, setPeriod] = useState(billing.interval || 'month')
  const [busy, setBusy] = useState(null) // plan name
  const [error, setError] = useState('')
  const discount = Math.round((billing.annualDiscount || 0) * 100)

  const choose = async (plan) => {
    const switching = billing.plan && !billing.exempt
    if (switching && !window.confirm(`Move to ${plan.name}, billed ${period === 'year' ? 'annually' : 'monthly'}? The change is prorated: unused time on your current plan comes off your next bill.`)) return
    setBusy(plan.name); setError('')
    try {
      const result = await chooseTutorPlan(plan.name, period)
      if (result.url) { window.location.assign(result.url); return }
      await onChanged?.()
    } catch (e) { setError(e.message || 'Could not update your plan.') }
    setBusy(null)
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Billing period" style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 12, background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : t.bgInput, marginBottom: 18 }}>
        {[['month', 'Monthly'], ['year', discount ? `Annual · save ${discount}%` : 'Annual']].map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={period === value} onClick={() => setPeriod(value)} disabled={!!busy}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
              background: period === value ? PURPLE : 'transparent', color: period === value ? '#0c1037' : t.textMuted }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {billing.plans.map(plan => {
          const current = billing.plan === plan.name && billing.interval === period && !billing.endsAtPeriodEnd
          const full = plan.students != null && billing.studentsUsed > plan.students
          return (
            <div key={plan.name} style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column', gap: 8, ...(current ? { borderColor: PURPLE } : {}) }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: PURPLE, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{plan.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 34, fontWeight: 900, color: t.text }}>${period === 'year' ? plan.annual : plan.monthly}</span>
                <span style={{ fontSize: 13, color: t.textMuted }}>/ {period} · AUD</span>
              </div>
              {period === 'year' && <div style={{ fontSize: 12, color: t.textMuted }}>${Math.round(plan.annual / 12)}/month, billed once a year</div>}
              <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {planFeatures(plan).map(([text, included]) => (
                  <li key={text} aria-label={included ? text : `Not included: ${text}`} style={{ fontSize: 13, color: included ? t.textSub : t.textMuted, display: 'flex', gap: 8 }}>
                    <span aria-hidden="true" style={{ color: included ? PURPLE : t.textMuted, fontWeight: 900 }}>{included ? '✓' : '–'}</span>
                    <span aria-hidden="true" style={{ textDecoration: included ? 'none' : 'line-through' }}>{text}</span>
                  </li>
                ))}
              </ul>
              {full && <div style={{ fontSize: 12, color: t.danger }}>You have {billing.studentsUsed} students and invites, so you couldn't invite more on this plan.</div>}
              <button type="button" onClick={() => choose(plan)} disabled={!!busy || current || billing.enabled === false}
                style={{ marginTop: 'auto', padding: '11px 14px', borderRadius: 12, border: 'none', fontFamily: FONT_B, fontSize: 14, fontWeight: 800,
                  cursor: busy || current || billing.enabled === false ? 'default' : 'pointer',
                  background: current ? 'transparent' : PURPLE, color: current ? PURPLE : '#0c1037', opacity: busy && busy !== plan.name ? 0.5 : 1 }}>
                {busy === plan.name ? 'Opening…' : current ? 'Your plan' : billing.enabled === false ? 'Payments coming soon' : billing.plan && !billing.exempt ? `Switch to ${plan.name}` : `Choose ${plan.name}`}
              </button>
            </div>
          )
        })}
      </div>
      {error && <div style={{ fontSize: 13, color: t.danger, marginTop: 12 }}>{error}</div>}
      <p style={{ fontSize: 12, color: t.textMuted, marginTop: 14 }}>Secure payment by Stripe. Cancel any time from Plan &amp; billing; you keep the portal until the end of the period you've paid for.</p>
    </div>
  )
}

/** Shows the plan picker instead of the tutor portal until the tutor has a plan. */
export default function TutorPlanGate({ theme, children }) {
  const t = THEMES[theme]
  const [billing, setBilling] = useState(null)
  const [error, setError] = useState('')

  const load = async () => {
    setError('')
    try { setBilling(await getTutorBilling()) }
    catch (e) { setError(e.message || 'Could not load your tutor plan.') }
  }
  useEffect(() => { finishCheckout().finally(load) }, [])

  if (billing?.active) return children
  return (
    <div style={{ padding: '32px 24px 56px', maxWidth: 980, margin: '0 auto', fontFamily: FONT_B, color: t.text }}>
      {error ? (
        <div style={{ fontSize: 14, color: t.danger }}>
          {error} <button type="button" onClick={load} style={{ border: 'none', background: 'none', color: PURPLE, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>Try again</button>
        </div>
      ) : !billing ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>Loading…</div>
      ) : (
        <>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 8px' }}>Choose your tutor plan</h1>
          <p style={{ fontSize: 14, color: t.textMuted, margin: '0 0 24px', lineHeight: 1.6, maxWidth: 640 }}>
            {billing.status
              ? 'Your tutor plan has ended. Choose a plan to open the tutor portal again; your students, classes and their work are all still here.'
              : 'The tutor portal comes with your roster, assignments, live sessions, messages and student progress. Pick the plan that fits how many students you tutor.'}
          </p>
          <TutorPlanPicker billing={billing} theme={theme} onChanged={load} />
        </>
      )}
    </div>
  )
}

/** Tutor portal → Plan & billing. */
export function TutorPlanTab({ theme }) {
  const t = THEMES[theme]
  const card = useCard(theme)
  const [billing, setBilling] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => getTutorBilling().then(setBilling).catch(e => setError(e.message || 'Could not load your tutor plan.'))
  useEffect(() => { load() }, [])

  const dropSubject = async (name) => {
    if (!window.confirm(`Remove ${name} from your plan's subjects? You can add it back later if there's room.`)) return
    setBusy(true); setError('')
    try { await removeTutorPlanSubject(name); await load() }
    catch (e) { setError(e.message || 'Could not update your subjects.') }
    setBusy(false)
  }

  const openPortal = async () => {
    setBusy(true); setError('')
    try { window.location.assign(await openTutorBillingPortal()) }
    catch (e) { setError(e.message || 'Could not open billing.'); setBusy(false) }
  }

  if (!billing) {
    return <div style={{ ...card, padding: 24, fontSize: 13.5, color: error ? t.danger : t.textMuted }}>{error || 'Loading…'}</div>
  }

  const summary = billing.plan
    ? `${billing.plan} · billed ${billing.interval === 'year' ? 'annually' : 'monthly'}`
    : billing.exempt ? 'Free tutor portal' : 'No plan'
  const renewal = billing.plan && billing.renewsAt
    ? billing.endsAtPeriodEnd ? `Ends ${shortDate(billing.renewsAt)}` : `Renews ${shortDate(billing.renewsAt)}`
    : billing.exempt ? 'Given by an admin: no plan or student limit needed.' : ''
  const limit = billing.studentLimit

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: FONT_B }}>
      <div style={{ ...card, padding: 22, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: PURPLE, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Your plan</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: t.text }}>{summary}</div>
          {renewal && <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>{renewal}</div>}
          {billing.status === 'past_due' && <div style={{ fontSize: 13, color: t.danger, marginTop: 6 }}>Your last payment didn't go through. Update your card to keep the portal.</div>}
        </div>
        <div style={{ flex: '0 1 220px' }}>
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 6 }}>Students and pending invites</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: t.text }}>{billing.studentsUsed}{limit != null ? ` of ${limit}` : ''}</div>
          {limit != null && (
            <div style={{ height: 6, borderRadius: 99, background: theme === 'dark' ? 'rgba(255,255,255,0.08)' : t.border, marginTop: 8, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, (billing.studentsUsed / limit) * 100)}%`, height: '100%', background: billing.studentsUsed >= limit ? t.danger : PURPLE }} />
            </div>
          )}
        </div>
        {billing.plan && (
          <button type="button" onClick={openPortal} disabled={busy}
            style={{ padding: '10px 16px', borderRadius: 12, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Opening…' : 'Card, receipts & cancel'}
          </button>
        )}
      </div>
      {(billing.plan || billing.exempt) && (
        <div style={{ ...card, padding: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.text, marginBottom: 4 }}>Your subjects</div>
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12, lineHeight: 1.55 }}>
            {billing.subjectLimit == null
              ? 'Your plan covers every subject.'
              : `Your plan covers ${subjectsText(billing.subjectLimit).toLowerCase()}. A subject is added the first time you set an assignment, include it for a student or add it to a student's subjects. ${billing.subjectSwaps
                ? 'Remove one to make room for another; your past work in it stays.'
                : `On ${billing.plan || 'your plan'} the subjects you start with can't be swapped: upgrade to tutor more or change them.`}`}
          </div>
          {billing.subjectLimit != null && (billing.subjects.length === 0
            ? <div style={{ fontSize: 13, color: t.textMuted }}>None yet.</div>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {billing.subjects.map((name, i) => {
                  // Past the limit after moving to a smaller plan: not covered, and removable even without swaps.
                  const over = i >= billing.subjectLimit
                  return (
                    <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: billing.subjectSwaps || over ? '6px 10px 6px 12px' : '6px 12px', borderRadius: 99, border: `1px solid ${over ? t.danger : t.border}`, fontSize: 13, fontWeight: 700, color: over ? t.danger : t.text }}>
                      {name}{over ? ' · not on your plan' : ''}
                      {(billing.subjectSwaps || over) && (
                        <button type="button" onClick={() => dropSubject(name)} disabled={busy} aria-label={`Remove ${name}`}
                          style={{ border: 'none', background: 'none', padding: 0, color: t.textMuted, cursor: busy ? 'default' : 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
                      )}
                    </span>
                  )
                })}
              </div>
            ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16, fontSize: 13, color: t.textSub }}>
            <span>{billing.features?.recordings ? '✓ Lesson recordings' : '– No lesson recordings'}</span>
            <span>{billing.features?.parentReports ? '✓ Weekly parent reports' : '– No parent reports'}</span>
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: 13, color: t.danger }}>{error}</div>}
      {!(billing.exempt && !billing.plan) && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.text, marginBottom: 12 }}>{billing.plan ? 'Change plan' : 'Plans'}</div>
          <TutorPlanPicker billing={billing} theme={theme} onChanged={load} />
        </div>
      )}
    </div>
  )
}
