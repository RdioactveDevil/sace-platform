import { useState, useEffect } from 'react'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import { getBillingConfig, addPaidSubject, chooseFreeSubject } from '../lib/db'
import { notify } from '../lib/notify'
import { formatSubjectLabel, subjectAccess } from '../lib/subjects'
import { DEFAULT_STUDENT_TIERS, studentTiers, extraLadder, monthlySaving, money } from '../lib/pricing'
import { Check } from 'lucide-react'
import { SubjectIconByName } from './SubjectIcons'
import { THEMES } from '../lib/theme'
import { AuthLayout, Note, authBtn, linkStyle } from './AuthLayout'
import CalmBackground from './CalmBackground'

const shortDate = (d) => d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })

/**
 * A locked subject: make it the student's free subject (limited questions a
 * day) or pay for it — Stripe Checkout for the first paid subject (billed
 * weekly or monthly, their choice), otherwise added straight onto their plan.
 * Without a free subject yet, the free option comes first.
 */
export default function GetAccessScreen({ subscriptions = [], onAccessChanged, onStartSubject, theme = 'dark', onToggleTheme }) {
  const t = THEMES[theme]
  const { state } = useLocation()
  const navigate  = useNavigate()
  const subj      = state?.subject
  const [error,   setError]   = useState(null)

  const [billing, setBilling] = useState(null)
  const [busy, setBusy] = useState(null) // 'free' | 'paid'
  const [chosenInterval, setChosenInterval] = useState('week')
  useEffect(() => {
    getBillingConfig().then(setBilling).catch(() => setBilling({ enabled: false, tiers: DEFAULT_STUDENT_TIERS, nextPrice: DEFAULT_STUDENT_TIERS[0], total: 0, hasPlan: false, freeDailyQuestions: 20 }))
  }, [])

  if (!subj) return <Navigate to="/subject-picker" replace />

  const curriculumId = String(subj.id || '').replace(/^curriculum_/, '')
  // An existing plan keeps its own billing period; a new one bills as chosen here.
  const interval = billing?.hasPlan ? billing.interval ?? 'week' : chosenInterval
  const weekly = studentTiers(billing?.tiers)
  const monthly = studentTiers(billing?.monthlyTiers, 'month')
  const tiers = interval === 'month' ? monthly : weekly
  const nextPrice = billing?.hasPlan ? billing.nextPrice ?? tiers[0] : tiers[0]
  const saving = monthlySaving(weekly[0], monthly[0])
  const freeDaily = billing?.freeDailyQuestions ?? 20
  // A first plan starts free; adding to a plan still on its trial ends the trial.
  const trialDays = billing?.hasPlan ? 0 : billing?.trialDays ?? 0
  const endsTrial = !!billing?.hasPlan && !!billing?.trialing
  const firstBill = shortDate(new Date(Date.now() + trialDays * 86_400_000))
  const currentFree = subscriptions.find(sub => sub.source === 'free')
  const currentFreeLabel = currentFree ? formatSubjectLabel({ name: currentFree.subject_name, stage: currentFree.stage }) : null
  // Opened from the free subject's daily limit: only the paid option applies.
  const isFreeSubject = subjectAccess(subscriptions, subj) === 'free'

  // Straight into the subject once they have it, not back to the picker.
  const openSubject = () => {
    const { questionCount, ...tile } = subj // eslint-disable-line no-unused-vars
    if (onStartSubject) onStartSubject(tile)
    else navigate('/subject-picker', { replace: true })
  }

  const handleFree = async () => {
    setBusy('free'); setError(null)
    try {
      await chooseFreeSubject(curriculumId)
      await onAccessChanged?.()
      notify.success(`${formatSubjectLabel(subj)} is now your free subject.`)
      openSubject()
    } catch (e) {
      setError(e.message || "That didn't go through. Try again.")
      setBusy(null)
    }
  }

  const handlePaid = async () => {
    setBusy('paid'); setError(null)
    try {
      const result = await addPaidSubject(curriculumId, interval, { endTrial: endsTrial })
      if (result.url) { window.location.assign(result.url); return }
      await onAccessChanged?.()
      notify.success(`${formatSubjectLabel(subj)} added. Your plan is now $${money(result.total)}/${result.interval ?? interval}.`)
      openSubject()
    } catch (e) {
      setError(e.message || "That didn't go through. Try again.")
      setBusy(null)
    }
  }

  const freeFirst = !currentFree && !isFreeSubject
  const payDisabled = !!busy || !billing || billing.enabled === false
  const subjectLabel = formatSubjectLabel(subj)
  const topics = subj.topics || []

  const payLabel = busy === 'paid' ? (billing?.hasPlan ? 'Adding…' : 'Opening secure checkout…')
    : billing?.enabled === false ? 'Payments are coming soon'
    : endsTrial ? `End trial and add ($${money(billing.total + nextPrice)}/${interval})`
    : billing?.hasPlan ? `Add to my plan (+$${money(nextPrice)}/${interval})`
    : trialDays > 0 ? `Start ${trialDays}-day free trial`
    : `Subscribe for $${money(nextPrice)} a ${interval}`
  const payNote = endsTrial
    ? `Your free trial covers one subject. Adding ${subjectLabel} ends it today: you'll be charged $${money(billing.total + nextPrice)}/${interval} from now.`
    : billing?.hasPlan
      ? `Added to your plan: $${money(billing.total)} → $${money(billing.total + nextPrice)}/${interval}, prorated from today.`
      : trialDays > 0
        ? `Free for ${trialDays} days, then $${money(nextPrice)}/${interval} from ${firstBill}. Extra subjects cost less: $${extraLadder(tiers)}/${interval} each.`
        : `Extra subjects cost less: $${extraLadder(tiers)}/${interval} each.`

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: 'clamp(18px, 4vw, 24px)', display: 'flex', flexDirection: 'column', gap: 12 }
  const h2 = { margin: 0, fontSize: 16, fontWeight: 800, color: t.text }
  const p = { margin: 0, fontSize: 13.5, color: t.textMuted, lineHeight: 1.55 }

  const freeCard = !isFreeSubject && (
    <section style={card} aria-labelledby="ga-free">
      <h2 id="ga-free" style={h2}>{freeFirst ? 'Start free' : 'Make it your free subject'}</h2>
      <p style={p}>
        {freeDaily} questions a day in {subjectLabel}, free. No card needed.
        {currentFreeLabel ? ` It replaces ${currentFreeLabel} as your free subject.` : ''}
      </p>
      <div>
        <button type="button" className="af-btn" onClick={handleFree} disabled={!!busy} style={authBtn(t, freeFirst ? 'primary' : 'secondary', { disabled: !!busy && busy !== 'free' })}>
          {busy === 'free' ? 'Setting it up…' : currentFreeLabel ? 'Switch free subject' : 'Start free'}
        </button>
      </div>
    </section>
  )

  const paidCard = (
    <section style={card} aria-labelledby="ga-paid">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 id="ga-paid" style={h2}>{freeFirst ? 'Or go unlimited' : 'Unlimited'}</h2>
        {!billing?.hasPlan && (
          <div role="radiogroup" aria-label="Billing period" style={{ display: 'flex', padding: 3, gap: 3, borderRadius: 9, background: t.bgSubtle }}>
            {[['week', 'Weekly'], ['month', saving ? `Monthly (save ${saving}%)` : 'Monthly']].map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={chosenInterval === value} className="af-btn" onClick={() => setChosenInterval(value)} disabled={!!busy}
                style={{ padding: '5px 10px', borderRadius: 7, border: 'none', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
                  background: chosenInterval === value ? t.bgCard : 'transparent', color: chosenInterval === value ? t.text : t.textMuted, boxShadow: chosenInterval === value ? `0 0 0 1px ${t.border}` : 'none' }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: t.text, fontVariantNumeric: 'tabular-nums' }}>${money(nextPrice)}</span>
        <span style={{ fontSize: 13.5, color: t.textMuted }}>a {interval} · AUD</span>
      </div>
      <p style={p}>{payNote}</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {['Unlimited practice questions', 'Unlimited Titan AI tutoring', 'Exam mode and every topic', 'Instant feedback and spaced repetition'].map(item => (
          <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: t.textSub }}>
            <Check size={15} color={t.success} strokeWidth={2.5} aria-hidden="true" style={{ flexShrink: 0 }} />{item}
          </li>
        ))}
      </ul>
      <button type="button" className="af-btn" onClick={handlePaid} disabled={payDisabled} style={authBtn(t, freeFirst ? 'secondary' : 'primary', { disabled: payDisabled, full: true })}>
        {payLabel}
      </button>
    </section>
  )

  return (
    <AuthLayout theme={theme} backdrop={<CalmBackground theme={theme} />} onToggleTheme={onToggleTheme} align="top"
      right={<button type="button" className="af-link" onClick={() => navigate('/subject-picker')} style={{ ...linkStyle(t), fontWeight: 600, textDecorationColor: t.border, color: t.textMuted }}>Back to subjects</button>}>
      <div className="af-in" style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 'clamp(8px, 5vh, 48px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 12, background: t.bgCard, border: `1px solid ${t.border}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <SubjectIconByName name={subj.name} color={t.textMuted} size={24} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px, 5vw, 26px)', fontWeight: 800, letterSpacing: '-0.02em', color: t.text, lineHeight: 1.2 }}>{subj.name}</h1>
            <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
              {[subj.stage, topics.length ? `${topics.length} topic${topics.length === 1 ? '' : 's'}` : null, subj.questionCount > 0 ? `${Number(subj.questionCount).toLocaleString()} questions` : null].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        {topics.length > 0 && (
          <p style={{ ...p, fontSize: 13 }}>
            {topics.slice(0, 6).join(', ')}{topics.length > 6 ? `, and ${topics.length - 6} more` : ''}.
          </p>
        )}

        {isFreeSubject && (
          <Note theme={theme}>{subjectLabel} is your free subject, with {freeDaily} questions a day. Go unlimited for as many as you like.</Note>
        )}
        {error && <Note tone="danger" theme={theme}>{error}</Note>}

        {freeFirst ? <>{freeCard}{paidCard}</> : <>{paidCard}{freeCard}</>}
      </div>
    </AuthLayout>
  )
}
