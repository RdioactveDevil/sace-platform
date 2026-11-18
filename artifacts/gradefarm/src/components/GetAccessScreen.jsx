import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { getBillingConfig, addPaidSubjects, chooseFreeSubject } from '../lib/db'
import { notify } from '../lib/notify'
import { fetchLiveCurricula } from '../lib/curriculaDb'
import { curriculumToSubjectTile, formatSubjectLabel, subjectAccess } from '../lib/subjects'
import { studentTiers, monthlySaving, money } from '../lib/pricing'
import { stateLabel } from '../lib/subjectFilter'
import { checkoutRetry, clearCheckoutRetry } from '../lib/pendingCheckout'
import { THEMES } from '../lib/theme'
import { AuthLayout, linkStyle } from './AuthLayout'
import CalmBackground from './CalmBackground'
import { SITE_CSS, themeVars } from './SiteChrome'
import PlanBuilder, { PLAN_CSS, BillingToggle, planGroups } from './PlanBuilder'

const CSS = `${SITE_CSS}${PLAN_CSS}
.ga { width: 100%; max-width: 1160px; color: var(--lp-ink); font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.6; }
.ga *, .ga *::before, .ga *::after { box-sizing: border-box; }
.ga p { margin: 0; }
.ga button { font-family: inherit; }
.ga :focus-visible { outline: 2px solid var(--lp-gold); outline-offset: 2px; }
.ga-head { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding-top: clamp(8px, 4vh, 36px); }
.ga-head h1 { margin: 0; font-size: clamp(28px, 4.4vw, 42px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; }
.ga-head h1:focus { outline: none; }
.ga-msg { max-width: 560px; font-size: 14px; line-height: 1.5; border-radius: 10px; padding: 10px 14px; }
.ga-msg.bad { color: var(--lp-bad); background: var(--lp-bad-bg); }
.ga-msg.info { color: var(--lp-ink-2); background: var(--lp-sel-row); }
/* Weekly / Monthly halfway between the heading's baseline and the list. */
.ga-head .pp-seg { margin-top: 10px; }
.ga .pp-build { margin-top: 28px; padding-bottom: 24px; }
.ga .pp-rcpt { top: 20px; }
`

/**
 * /get-access: "Build your plan" inside the app, the same list and bill as
 * the pricing page (PlanBuilder.jsx), for a signed-in student. It lists the
 * subjects they could add for their state and year (never another state's, a
 * year below theirs or more than 2 above), without the ones they already
 * have. What they came for is ticked: the subject they tapped (location
 * state `subject`), a plan from the pricing page (`plan`), or a plan whose
 * checkout didn't open after sign-up (lib/pendingCheckout.js checkoutRetry),
 * which says so, so they don't end up on the free plan without meaning to.
 *
 * Paying opens Stripe Checkout for a first plan (a free trial for one
 * subject), or adds the subjects to their plan. With one subject ticked,
 * "Or start free with limited features" makes it their free subject instead.
 */
export default function GetAccessScreen({ profile, subscriptions = [], onAccessChanged, onStartSubject, theme = 'dark', onToggleTheme }) {
  const t = THEMES[theme]
  const { state } = useLocation()
  const navigate = useNavigate()

  // Read once, then forgotten, so a reload doesn't bring the old error back.
  const [retry] = useState(() => checkoutRetry())
  useEffect(() => { clearCheckoutRetry() }, [])
  const tapped = state?.subject || null
  const startPlan = state?.plan || retry
  const [wanted] = useState(() => [
    ...(tapped ? [String(tapped.id || '').replace(/^curriculum_/, '')] : []),
    ...(startPlan?.subjects || []).map(s => s.curriculumId),
  ].filter((id, i, ids) => id && ids.indexOf(id) === i))
  const [problem] = useState(() => state?.error || retry?.error || '')

  const [billing, setBilling] = useState(null)
  const [tiles, setTiles] = useState(null)
  const [picked, setPicked] = useState(wanted)
  const [interval, setBillInterval] = useState(startPlan?.interval === 'month' ? 'month' : 'week')
  const [busy, setBusy] = useState(null) // 'paid' | 'free'
  const [error, setError] = useState('')

  useEffect(() => {
    getBillingConfig().then(setBilling).catch(() => setBilling({}))
    fetchLiveCurricula()
      .then(cs => setTiles(cs.map(curriculumToSubjectTile).filter(s => s.available)))
      .catch(() => setTiles([]))
  }, [])

  const year = Number(profile?.year_level) || null
  const where = [stateLabel(profile?.state), year ? `Year ${year}` : null].filter(Boolean).join(', ')
  // Every live subject they haven't got full access to yet, for their state and year.
  const groups = useMemo(() => planGroups(
    (tiles || [])
      .filter(s => subjectAccess(subscriptions, s) !== 'full')
      .map(s => ({ id: s.id.replace(/^curriculum_/, ''), name: s.name, level: s.stage || '', tile: s })),
    { state: profile?.state || null, year, keep: wanted },
  ), [tiles, subscriptions, profile?.state, year, wanted])
  const chosen = groups.flatMap(g => g.items).filter(x => picked.includes(x.id))

  const onPlan = !!billing?.hasPlan
  const weekTiers = studentTiers(billing?.tiers)
  const monthTiers = studentTiers(billing?.monthlyTiers, 'month')
  const tiers = onPlan && billing.planTiers?.length ? billing.planTiers : interval === 'month' ? monthTiers : weekTiers
  const per = (onPlan ? billing.interval : interval) === 'month' ? 'a month' : 'a week'
  const already = onPlan ? billing.paidCount || 0 : 0
  const saving = monthlySaving(weekTiers[0], monthTiers[0])
  const freeDaily = billing?.freeDailyQuestions ?? 20

  const currentFree = subscriptions.find(sub => sub.source === 'free')
  const currentFreeLabel = currentFree ? formatSubjectLabel({ name: currentFree.subject_name, stage: currentFree.stage }) : null
  const tappedIsFree = !!tapped && subjectAccess(subscriptions, tapped) === 'free'

  // Straight into the subject once they have it, not back to the picker.
  const openSubject = (tile) => {
    if (!tile || !onStartSubject) { navigate('/subject-picker', { replace: true }); return }
    const { questionCount, ...rest } = tile // eslint-disable-line no-unused-vars
    onStartSubject(rest)
  }

  const checkout = async (items) => {
    if (!items.length) return
    setBusy('paid'); setError('')
    try {
      const result = await addPaidSubjects(items.map(x => x.id), interval, { endTrial: onPlan && !!billing?.trialing })
      if (result?.url) { window.location.assign(result.url); return }
      await onAccessChanged?.()
      const what = items.length === 1 ? formatSubjectLabel(items[0].source.tile) : `${items.length} subjects`
      notify.success(`${what} added. Your plan is now $${money(result.total)} a ${result.interval ?? interval}.`)
      openSubject(items[0].source.tile)
    } catch (e) {
      setError(e?.message || "That didn't go through. Try again.")
      setBusy(null)
    }
  }

  const startFree = async (item) => {
    setBusy('free'); setError('')
    try {
      await chooseFreeSubject(item.id)
      await onAccessChanged?.()
      notify.success(`${formatSubjectLabel(item.source.tile)} is now your free subject.`)
      openSubject(item.source.tile)
    } catch (e) {
      setError(e?.message || "That didn't go through. Try again.")
      setBusy(null)
    }
  }

  // The free option covers one subject, so it shows with exactly one ticked.
  const freeItem = chosen.length === 1 && subjectAccess(subscriptions, chosen[0].source.tile) !== 'free' ? chosen[0] : null
  const footer = freeItem && (
    <p className="pp-note">
      Or <button type="button" className="lp-link" onClick={() => startFree(freeItem)} disabled={!!busy}>{busy === 'free' ? 'setting it up…' : 'start free'}</button> with limited features{currentFreeLabel ? `, instead of ${currentFreeLabel}` : ''}.
    </p>
  )

  return (
    <AuthLayout theme={theme} backdrop={<CalmBackground theme={theme} />} onToggleTheme={onToggleTheme} align="top"
      right={<button type="button" className="af-link" onClick={() => navigate('/subject-picker')} style={{ ...linkStyle(t), fontWeight: 600, textDecorationColor: t.border, color: t.textMuted }}>Back to subjects</button>}>
      <style>{CSS}</style>
      <div className="ga af-in" style={themeVars(theme)}>
        <div className="ga-head">
          <h1>Build your plan.</h1>
          {!onPlan && <BillingToggle interval={interval} onChange={setBillInterval} saving={saving} disabled={!!busy} />}
          {problem && (
            <p className="ga-msg bad" role="alert">Checkout didn't open, so you haven't been charged. {problem} Your plan is below to try again.</p>
          )}
          {tappedIsFree && (
            <p className="ga-msg info">{formatSubjectLabel(tapped)} is your free subject, with {freeDaily} questions a day. Go unlimited for as many as you like.</p>
          )}
        </div>
        <PlanBuilder
          groups={groups} loading={tiles === null} picked={picked} onPick={(ids) => { setError(''); setPicked(ids) }}
          top={<span><MapPin size={16} aria-hidden="true" />Subjects for <b>{where || 'you'}</b></span>}
          empty={<>No more subjects for {where || 'you'} yet. <button type="button" className="lp-link" onClick={() => navigate('/subject-picker')}>Back to your subjects</button></>}
          tiers={tiers} per={per} onPlan={onPlan} already={already} trialDays={onPlan ? 0 : billing?.trialDays || 0} introPrice={onPlan ? 0 : billing?.introPrice || 0} trialing={!!billing?.trialing}
          onCheckout={checkout} busy={busy === 'paid'} error={error}
          unavailable={billing?.enabled === false ? "Payments aren't switched on yet. You can start free in the meantime." : ''}
          footer={footer} />
      </div>
    </AuthLayout>
  )
}
