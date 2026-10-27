import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LayoutDashboard, UserRound, CreditCard, ShieldCheck, SlidersHorizontal, Flame, Trophy, Zap, CalendarDays, Eye, EyeOff, Moon, Sun } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { getLevelProgress, nextRankHint, rankAccuracy, RANKS, RANK_TIERS } from '../lib/engine'
import { currentStreak } from '../lib/streak'
import { updateProfile, getSubscriptions, getBillingConfig, openBillingPortal, removePaidSubject, switchBillingInterval, changeEmail, deleteMyAccount, syncBillingEmail, saveParentDetails, addFamilyChild, switchToChild, removeFamilyChild } from '../lib/db'
import { useFamily } from './FamilySwitcher'
import { awaitingParent, needsParentConsent } from '../lib/parentConsent'
import { formatSubjectLabel } from '../lib/subjects'
import { studentTiers, planTotal, extraLadder, monthlySaving, money } from '../lib/pricing'
import { supabase } from '../lib/supabase'
import RankIcon from './RankIcon'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"
const SUPPORT_EMAIL = 'support@titaniumtutoring.com.au'

// Same choices as onboarding, so what a student picked there shows up here.
const YEAR_LEVELS  = [6, 7, 8, 9, 10, 11, 12]
const ATAR_TARGETS = [
  { value: 99.5, label: '99.5+ (top 0.5%)' },
  { value: 95,   label: '95+ (top 5%)' },
  { value: 90,   label: '90+ (top 10%)' },
  { value: 80,   label: '80+ (above average)' },
  { value: 70,   label: '70+ (comfortable pass)' },
]
const STUDY_HOURS  = [1, 2, 3, 5, 7, 10]

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '')
const longDate  = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

/** What a subject's access row means for the student, in one line. */
function accessLine(sub, freeDaily) {
  if (sub.source === 'beta') return { text: 'Free — beta member', tone: 'success' }
  if (sub.source === 'free') return { text: `Free subject — ${freeDaily} questions a day`, tone: 'success' }
  if (sub.source === 'tutor') return { text: 'Included with your tutoring', tone: 'success' }
  if (sub.source !== 'stripe') return { text: 'Included by Titanium Tutoring', tone: 'success' }
  if (sub.status === 'past_due') return { text: 'Payment failed — update your card', tone: 'danger' }
  if (sub.cancel_at_period_end) return { text: `Ends ${shortDate(sub.current_period_end)}`, tone: 'muted' }
  if (sub.status === 'trialing') return { text: `Free trial until ${shortDate(sub.current_period_end)}`, tone: 'success' }
  return { text: 'In your plan', tone: 'muted' }
}

/** Card heading with an optional one-line description under it. */
function CardTitle({ t, title, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  )
}

/** The gold on/off switch used for settings. */
function Toggle({ on, onClick, disabled, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} disabled={disabled}
      style={{
        width: 44, height: 24, borderRadius: 999, border: 'none', padding: 2, flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
        background: on ? `linear-gradient(135deg,${GOLD},${GOLDL})` : 'rgba(148,163,184,0.35)',
        display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background 0.2s',
      }}
    >
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  )
}

/** A label above a form control. */
function Field({ t, label, hint, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: t.textFaint }}>{hint}</span>}
    </label>
  )
}

/**
 * The student's parent or guardian (lib/parentConsent.js): who confirms a
 * student under 15, and who gets the weekly progress email. A parent who set
 * the account up sees their own weekly email setting instead.
 */
function ParentCard({ profile, theme, card, btn, inputStyle, onProfileUpdated }) {
  const t = THEMES[theme]
  const [email, setEmail] = useState(profile.parent_email || '')
  const [name, setName] = useState(profile.parent_name || '')
  const [busy, setBusy] = useState(null) // 'save' | 'resend' | 'reports'
  const [msg, setMsg] = useState(null) // { ok, text }
  useEffect(() => { setEmail(profile.parent_email || ''); setName(profile.parent_name || '') }, [profile.parent_email, profile.parent_name])

  const young = needsParentConsent(profile.dob, profile.year_level)
  const first = (profile.display_name || '').split(' ')[0] || 'your child'
  const run = async (kind, body, okText) => {
    setBusy(kind); setMsg(null)
    try {
      const { parent } = await saveParentDetails(body)
      onProfileUpdated?.(parent)
      setMsg({ ok: true, text: okText })
    } catch (e) {
      setMsg({ ok: false, text: e.message || "Couldn't save. Please try again." })
    }
    setBusy(null)
  }
  const msgLine = msg && <div role="status" style={{ fontSize: 12, color: msg.ok ? t.success : t.danger, marginTop: 8 }}>{msg.text}</div>

  if (profile.account_holder === 'parent') {
    const reportsOn = !profile.parent_reports_stopped_at
    return (
      <div style={card}>
        <CardTitle t={t} title="Parent or guardian" sub={`You set this account up for ${first}${profile.parent_name ? `, as ${profile.parent_name}` : ''}. The weekly progress email goes to the email you sign in with.`} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>Weekly progress email</div>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2, lineHeight: 1.5 }}>Sunday evenings: how much {first} practised, how well, and what to work on next.</div>
          </div>
          <Toggle on={reportsOn} disabled={busy === 'reports'} label="Weekly progress email"
            onClick={() => run('reports', { reports: !reportsOn }, reportsOn ? 'Weekly emails stopped.' : 'Weekly emails are back on.')} />
        </div>
        {msgLine}
      </div>
    )
  }

  const clean = email.trim().toLowerCase()
  const changed = clean !== (profile.parent_email || '').toLowerCase() || name.trim() !== (profile.parent_name || '')
  const confirmed = !!profile.parent_consent_at
  const status = !profile.parent_email ? null
    : confirmed ? `Confirmed on ${longDate(profile.parent_consent_at)}.`
    : `Waiting for them to confirm${profile.parent_consent_requested_at ? ` (sent ${longDate(profile.parent_consent_requested_at)})` : ''}. Ask them to check their inbox and spam folder.`
  return (
    <div style={card}>
      <CardTitle t={t} title="Parent or guardian" sub={young
        ? "You're under 15, so Titan AI and the other AI features switch on once your parent or guardian confirms by email. They'll also get a short progress email on Sundays."
        : "Optional. Once they confirm by email, they'll get a short progress email about your week every Sunday."} />
      {status && (
        <div style={{ fontSize: 13, color: confirmed ? t.success : t.text, marginBottom: 12, lineHeight: 1.5 }}>
          <strong>{profile.parent_email}</strong> · {status}
          {confirmed && profile.parent_reports_stopped_at && <span style={{ color: t.textMuted }}> They've stopped the weekly emails.</span>}
        </div>
      )}
      <div className="acct-form">
        <Field t={t} label="Their email" hint={confirmed && young ? 'A new email has to confirm again, and Titan AI pauses until it does.' : null}>
          <input type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} placeholder="parent@example.com" maxLength={254} style={inputStyle} />
        </Field>
        <Field t={t} label="Their name (optional)">
          <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="e.g. Sam Smith" style={inputStyle} />
        </Field>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" disabled={!clean || !changed || !!busy} style={btn('primary', !clean || !changed || !!busy)}
          onClick={() => run('save', { parentEmail: clean, parentName: name.trim() },
            clean !== (profile.parent_email || '').toLowerCase() ? `Saved. We've emailed ${clean} to confirm.` : 'Saved.')}>
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
        {profile.parent_email && !confirmed && !changed && (
          <button type="button" disabled={!!busy} style={btn('secondary', !!busy)}
            onClick={() => run('resend', { resend: true }, `Sent again to ${profile.parent_email}.`)}>
            {busy === 'resend' ? 'Sending…' : 'Send again'}
          </button>
        )}
      </div>
      {msgLine}
    </div>
  )
}

/** The student's subjects, their weekly or monthly plan, and the Stripe portal. */
/**
 * A parent's children (api-server routes/family.ts): one sign-in email for
 * all of them. Switch to a child, add one, or remove an added one.
 */
function FamilyCard({ family, theme, card, btn, inputStyle }) {
  const t = THEMES[theme]
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState('')
  const [removing, setRemoving] = useState(null) // child id
  const [password, setPassword] = useState('')
  const children = family.children || []

  const act = async (key, fn) => {
    setBusy(key); setMsg('')
    try { await fn() } catch (e) { setMsg(e.message || 'Something went wrong.'); setBusy(null) }
  }
  const add = (e) => {
    e.preventDefault()
    if (name.trim()) act('add', async () => { const child = await addFamilyChild(name.trim()); await switchToChild(child.id) })
  }
  const remove = (child) => act(`remove-${child.id}`, async () => {
    await removeFamilyChild(child.id, password)
    window.location.reload()
  })

  return (
    <div style={card}>
      <CardTitle t={t} title="Your children" sub={<>Each child has their own progress, subjects and tutor. You sign in to all of them with <strong style={{ color: t.text }}>{family.parentEmail}</strong> and switch between them from the menu.</>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children.map(c => (
          <div key={c.id} style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{c.name}{c.id === family.currentId && <span style={{ color: t.goldText || GOLD, fontSize: 12, fontWeight: 700 }}> · open now</span>}</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>{[c.year_level ? (String(c.year_level).startsWith('Year') ? c.year_level : `Year ${c.year_level}`) : null, c.set_up ? null : 'Not set up yet', c.primary ? 'The account you sign in to' : null].filter(Boolean).join(' · ')}</div>
              </div>
              {c.id !== family.currentId && (
                <button type="button" onClick={() => act(c.id, () => switchToChild(c.id))} disabled={!!busy} style={btn('secondary', !!busy)}>{busy === c.id ? 'Opening…' : `Switch to ${c.name}`}</button>
              )}
              {!c.primary && c.id !== family.currentId && removing !== c.id && (
                <button type="button" onClick={() => { setRemoving(c.id); setPassword(''); setMsg('') }} style={btn('danger')}>Remove</button>
              )}
            </div>
            {removing === c.id && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 8, lineHeight: 1.5 }}>This deletes {c.name}'s account, progress and any paid plan for them. It can't be undone.</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input type="password" autoComplete="current-password" aria-label="Your password" placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, flex: '1 1 180px', width: 'auto' }} />
                  <button type="button" onClick={() => remove(c)} disabled={!password || !!busy} style={btn('danger', !password || !!busy)}>{busy === `remove-${c.id}` ? 'Removing…' : `Remove ${c.name}`}</button>
                  <button type="button" onClick={() => setRemoving(null)} style={btn('secondary')}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Another child's first name" aria-label="Another child's first name" style={{ ...inputStyle, flex: '1 1 200px', width: 'auto' }} />
        <button type="submit" disabled={!name.trim() || !!busy} style={btn('primary', !name.trim() || !!busy)}>{busy === 'add' ? 'Adding…' : 'Add a child'}</button>
      </form>
      {msg && <div role="alert" style={{ fontSize: 12, color: t.danger, marginTop: 8 }}>{msg}</div>}
    </div>
  )
}

function BillingCard({ profile, theme, card, btn, onChangeSubject }) {
  const t = THEMES[theme]
  const [subs, setSubs] = useState(null)
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(null) // 'portal' | 'interval' | row id
  const [error, setError] = useState('')

  const load = async () => {
    const [rows, config] = await Promise.all([
      getSubscriptions(profile.id).catch(() => []),
      getBillingConfig().catch(() => null),
    ])
    setSubs(rows)
    setPlan(config)
  }
  useEffect(() => { load() }, [profile.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const paid = (subs || []).filter(s => s.source === 'stripe')
  const freeDaily = plan?.freeDailyQuestions ?? 20
  // A plan bills weekly or monthly, at the prices it started on.
  const interval = plan?.interval ?? 'week'
  const weekly = studentTiers(plan?.tiers)
  const monthly = studentTiers(plan?.monthlyTiers, 'month')
  const tiers = plan?.hasPlan ? studentTiers(plan.planTiers, interval) : weekly
  const saving = monthlySaving(weekly[0], monthly[0])
  const totalAfterRemoving = () => planTotal(tiers, paid.length - 1)
  const otherInterval = interval === 'month' ? 'week' : 'month'
  const switchedTotal = planTotal(otherInterval === 'month' ? monthly : weekly, paid.length)

  const switchInterval = async () => {
    const msg = plan?.trialing
      ? `Switch to ${otherInterval}ly billing? You'll pay $${money(switchedTotal)}/${otherInterval} when your free trial ends on ${shortDate(plan.renewsAt)}.`
      : `Switch to ${otherInterval}ly billing at $${money(switchedTotal)}/${otherInterval}? Your new ${otherInterval} starts today, and the unused part of this ${interval} comes off the first bill.`
    if (!window.confirm(msg)) return
    setBusy('interval'); setError('')
    try { await switchBillingInterval(otherInterval); await load() }
    catch (e) { setError(e.message || 'Could not change your billing.') }
    setBusy(null)
  }

  const openPortal = async () => {
    setBusy('portal'); setError('')
    try { window.location.assign(await openBillingPortal()) }
    catch (e) { setError(e.message || 'Could not open billing.'); setBusy(null) }
  }

  const remove = async (sub) => {
    const label = formatSubjectLabel({ name: sub.subject_name, stage: sub.stage })
    const msg = paid.length === 1
      ? sub.status === 'trialing'
        ? `Cancel your free trial of ${label}? You keep access until ${shortDate(sub.current_period_end)} and won't be charged.`
        : `Remove ${label}? It's your only paid subject, so your plan ends on ${shortDate(sub.current_period_end)} and you keep access until then.`
      : `Remove ${label} now? Your plan drops to $${money(totalAfterRemoving())}/${interval} and unused time is credited to your next bill.`
    if (!window.confirm(msg)) return
    setBusy(sub.id); setError('')
    try { await removePaidSubject(sub.id); await load() }
    catch (e) { setError(e.message || 'Could not update your plan.') }
    setBusy(null)
  }

  const toneColour = { success: t.success, danger: t.danger, muted: t.textMuted }

  return (
    <>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Your subjects</div>
          {plan?.hasPlan && (
            <span style={{ fontSize: 12.5, color: t.textMuted }}>
              <strong style={{ color: t.text }}>${money(plan.total)}/{interval}</strong>
              {plan.endsAtPeriodEnd ? ` · ends ${shortDate(plan.renewsAt)}` : plan.renewsAt ? ` · ${plan.trialing ? 'first' : 'next'} bill ${shortDate(plan.renewsAt)}` : ''}
            </span>
          )}
        </div>
        {subs === null ? (
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 14 }}>Loading…</div>
        ) : subs.length === 0 ? (
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 14 }}>You haven't picked a subject yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 14 }}>
            {subs.map((s, i) => {
              const line = accessLine(s, freeDaily)
              const removable = s.source === 'stripe' && !s.cancel_at_period_end
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? `1px solid ${t.border}` : 'none', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 140, fontSize: 13.5, fontWeight: 700, color: t.text }}>{formatSubjectLabel({ name: s.subject_name, stage: s.stage })}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: toneColour[line.tone], textAlign: 'right' }}>{line.text}</span>
                  {removable && (
                    <button type="button" onClick={() => remove(s)} disabled={!!busy}
                      style={{ border: 'none', background: 'none', padding: 0, color: t.textFaint, fontFamily: FONT_B, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
                      {busy === s.id ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onChangeSubject} style={btn('primary')}>+ Add a subject</button>
          <button type="button" onClick={onChangeSubject} style={btn('secondary')}>⇄ Switch subject</button>
        </div>
        {error && <div style={{ fontSize: 12, color: t.danger, marginTop: 8 }}>{error}</div>}
      </div>

      <div style={card}>
        <CardTitle t={t} title="Pricing" sub={`${plan?.hasPlan ? `Your plan is billed ${interval}ly: ` : ''}$${tiers[0]}/${plan?.hasPlan ? interval : 'week'} for your first paid subject${tiers.length > 1 ? `, then $${extraLadder(tiers)}/${plan?.hasPlan ? interval : 'week'} for each extra one` : ''}.${plan?.hasPlan ? '' : ` Or pay monthly from $${monthly[0]}/month${saving ? ` (save ${saving}%)` : ''}.`} Your one free subject has ${freeDaily} questions a day.`} />
        {paid.length > 0 ? (
          <>
            <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 14, lineHeight: 1.55 }}>
              Update your card, download receipts or cancel your plan in the secure Stripe billing portal.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={openPortal} disabled={!!busy} style={btn('secondary', !!busy)}>
                {busy === 'portal' ? 'Opening…' : 'Card & receipts'}
              </button>
              {plan?.hasPlan && !plan.endsAtPeriodEnd && (
                <button type="button" onClick={switchInterval} disabled={!!busy} style={btn('secondary', !!busy)}>
                  {busy === 'interval' ? 'Switching…'
                    : otherInterval === 'month' ? `Pay monthly${saving ? ` · save ${saving}%` : ''}`
                    : 'Pay weekly instead'}
                </button>
              )}
            </div>
          </>
        ) : (
          <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
            You don't have a paid plan. Add a subject to unlock unlimited questions in it.
          </p>
        )}
      </div>
    </>
  )
}

export default function AccountScreen({ profile, theme, onToggleTheme, onSignOut, onChangeSubject, onReplayFeatureTour, onProfileUpdated }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  const recentAccuracy = rankAccuracy(profile)
  const { level, pct, next, maxed } = getLevelProgress(profile.xp, recentAccuracy)
  const rank     = RANKS[level]
  const isStudent = !profile.is_tutor && !profile.is_admin

  const TABS = [
    { id: 'overview',    label: 'Overview',            icon: LayoutDashboard },
    { id: 'profile',     label: 'Profile',             icon: UserRound },
    isStudent && { id: 'billing', label: 'Subjects & billing', icon: CreditCard },
    { id: 'security',    label: 'Security & privacy',  icon: ShieldCheck },
    { id: 'preferences', label: 'Preferences',         icon: SlidersHorizontal },
  ].filter(Boolean)

  // ?tab=billing etc. opens a tab directly; switching tabs keeps the URL in step.
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(() => (TABS.some(x => x.id === params.get('tab')) ? params.get('tab') : 'overview'))
  // The screen stays mounted, so a later link to ?tab=… switches tabs too.
  const tabParam = params.get('tab')
  useEffect(() => {
    if (tabParam && tabParam !== tab && TABS.some(x => x.id === tabParam)) setTab(tabParam)
  }, [tabParam]) // eslint-disable-line react-hooks/exhaustive-deps
  const tabRefs = useRef({})
  const selectTab = (id, focus = false) => {
    setTab(id)
    setParams(p => { const n = new URLSearchParams(p); n.set('tab', id); return n }, { replace: true })
    if (focus) tabRefs.current[id]?.focus()
  }
  const onTabKey = (e) => {
    const i = TABS.findIndex(x => x.id === tab)
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (e.key === 'Home') { e.preventDefault(); selectTab(TABS[0].id, true) }
    else if (e.key === 'End') { e.preventDefault(); selectTab(TABS[TABS.length - 1].id, true) }
    else if (step) { e.preventDefault(); selectTab(TABS[(i + step + TABS.length) % TABS.length].id, true) }
  }

  const [authUser, setAuthUser] = useState(null)
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => { if (!cancelled) setAuthUser(data?.user || null) }).catch(() => {})
    // Receipts go to the email on the Stripe customer; keep it on the current sign-in email.
    if (isStudent) syncBillingEmail().catch(() => {})
    return () => { cancelled = true }
  }, [profile.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // A child added to a family signs in through the parent (api-server lib/family.ts).
  const familyChild = !!authUser?.user_metadata?.family_child
  const email = (familyChild ? authUser?.user_metadata?.family_email : authUser?.email) || ''
  const family = useFamily(profile)
  const otherChildren = (family?.children || []).filter(c => !c.primary && c.id !== profile.id)
  const pendingEmail = authUser?.new_email || ''
  const memberSince = profile.created_at || authUser?.created_at

  // ── Profile form ──
  const saved = {
    display_name:         profile.display_name || '',
    school:               profile.school || '',
    year_level:           profile.year_level ?? '',
    dob:                  profile.dob || '',
    atar_target:          profile.atar_target ?? '',
    study_hours_per_week: profile.study_hours_per_week ?? '',
    goals:                profile.goals || '',
  }
  const [form, setForm]                 = useState(saved)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg]     = useState(null) // { ok, text }
  const setField = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const profileDirty = Object.keys(saved).some(k => String(form[k]) !== String(saved[k]))
  // Waiting on a parent: the database keeps these as they are (migration
  // 20261025000012_parent_consent.sql), so don't offer to change them.
  const dobLocked = awaitingParent(profile)
  const nameMissing  = !form.display_name.trim()

  // ── Password ──
  const [newPw, setNewPw]               = useState('')
  const [confirmPw, setConfirmPw]       = useState('')
  const [showPw, setShowPw]             = useState(false)
  const [savingPw, setSavingPw]         = useState(false)
  const [pwMsg, setPwMsg]               = useState(null) // { ok, text }
  const [signingOutAll, setSigningOutAll] = useState(false)

  // ── Email change ──
  const [editingEmail, setEditingEmail] = useState(false)
  const [newEmail, setNewEmail]         = useState('')
  const [savingEmail, setSavingEmail]   = useState(false)
  const [emailMsg, setEmailMsg]         = useState(null) // { ok, text }

  // ── Delete account ──
  const [deleteOpen, setDeleteOpen]     = useState(false)
  const [deletePw, setDeletePw]         = useState('')
  const [deleteWord, setDeleteWord]     = useState('')
  const [deleting, setDeleting]         = useState(false)
  const [deleteMsg, setDeleteMsg]       = useState('')

  const [replayTourBusy, setReplayTourBusy] = useState(false)

  const [remindersOn, setRemindersOn]   = useState(!profile.emails_unsubscribed_at)
  const [savingReminders, setSavingReminders] = useState(false)
  const [remindersMsg, setRemindersMsg] = useState('')

  const card = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: 16,
    boxShadow: theme === 'light' ? '0 2px 12px rgba(12,16,55,0.07)' : '0 2px 12px rgba(0,0,0,0.25)',
    padding: '20px 24px',
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
    border: `1px solid ${t.border}`, background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : t.bg,
    color: t.text, fontSize: 14, fontFamily: FONT_B, outline: 'none', colorScheme: theme,
  }

  const btn = (variant = 'primary', disabled = false) => ({
    padding: '10px 20px', borderRadius: 10, fontFamily: FONT_B, fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    ...(variant === 'primary' ? {
      border: 'none',
      background: disabled ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`,
      color: '#0c1037',
      boxShadow: disabled ? 'none' : '0 4px 16px rgba(241,190,67,0.3)',
    } : variant === 'danger' ? {
      border: `1px solid rgba(239,68,68,0.35)`,
      background: 'rgba(239,68,68,0.06)',
      color: t.danger,
    } : {
      border: `1px solid ${t.border}`,
      background: 'transparent',
      color: t.textMuted,
    }),
  })

  const handleSaveProfile = async () => {
    if (nameMissing || !profileDirty) return
    const updates = { display_name: form.display_name.trim() }
    // Tutors and admins only see the name field.
    if (isStudent) {
      const num = (v) => (v === '' ? null : Number(v))
      Object.assign(updates, {
        school:               form.school.trim() || null,
        year_level:           num(form.year_level),
        dob:                  form.dob || null,
        atar_target:          num(form.atar_target),
        study_hours_per_week: num(form.study_hours_per_week),
        goals:                form.goals.trim() || null,
      })
    }
    setSavingProfile(true); setProfileMsg(null)
    try {
      await updateProfile(profile.id, updates)
      onProfileUpdated?.(updates)
      setForm(f => ({ ...f, display_name: updates.display_name }))
      setProfileMsg({ ok: true, text: 'Saved!' })
    } catch {
      setProfileMsg({ ok: false, text: 'Failed to save. Check your connection and try again.' })
    } finally {
      setSavingProfile(false)
      setTimeout(() => setProfileMsg(null), 3000)
    }
  }

  const pwTooShort = newPw.length < 6
  const pwMismatch = confirmPw.length > 0 && confirmPw !== newPw
  const handleChangePassword = async () => {
    if (pwTooShort) { setPwMsg({ ok: false, text: 'Password must be at least 6 characters.' }); return }
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: "Passwords don't match." }); return }
    setSavingPw(true); setPwMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) setPwMsg({ ok: false, text: error.message })
    else { setPwMsg({ ok: true, text: 'Password updated!' }); setNewPw(''); setConfirmPw('') }
    setSavingPw(false)
    setTimeout(() => setPwMsg(null), 4000)
  }

  const handleSignOutEverywhere = async () => {
    if (!window.confirm('Sign out on every device, including this one?')) return
    setSigningOutAll(true)
    try { await supabase.auth.signOut({ scope: 'global' }) } catch { /* still sign out locally below */ }
    onSignOut()
  }

  const newEmailTrim = newEmail.trim()
  const newEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmailTrim) && newEmailTrim.toLowerCase() !== email.toLowerCase()
  const handleChangeEmail = async () => {
    if (!newEmailValid || savingEmail) return
    setSavingEmail(true); setEmailMsg(null)
    try {
      const user = await changeEmail(newEmailTrim)
      if (user) setAuthUser(user)
      setEditingEmail(false); setNewEmail('')
      setEmailMsg({ ok: true, text: `Check ${newEmailTrim} for a confirmation link. If one also arrives at ${email}, confirm that too. Until then you keep signing in with ${email}.` })
    } catch (e) {
      setEmailMsg({ ok: false, text: e.message || "Couldn't start the email change." })
    } finally {
      setSavingEmail(false)
    }
  }

  const canDelete = deletePw.length > 0 && deleteWord.trim().toUpperCase() === 'DELETE'
  const handleDeleteAccount = async () => {
    if (!canDelete || deleting) return
    setDeleting(true); setDeleteMsg('')
    try {
      await deleteMyAccount(deletePw)
    } catch (e) {
      setDeleteMsg(e.message || "Couldn't delete your account.")
      setDeleting(false)
      return
    }
    window.alert('Your account has been deleted.')
    onSignOut()
  }

  const handleToggleReminders = async () => {
    const nextOn = !remindersOn
    setSavingReminders(true); setRemindersMsg('')
    try {
      const updates = { emails_unsubscribed_at: nextOn ? null : new Date().toISOString() }
      await updateProfile(profile.id, updates)
      onProfileUpdated?.(updates)
      setRemindersOn(nextOn)
    } catch {
      setRemindersMsg('Failed to save.')
      setTimeout(() => setRemindersMsg(''), 3000)
    } finally {
      setSavingReminders(false)
    }
  }

  const handleReplayFeatureTour = async () => {
    if (!onReplayFeatureTour || replayTourBusy) return
    setReplayTourBusy(true)
    try {
      await onReplayFeatureTour()
    } finally {
      setReplayTourBusy(false)
    }
  }

  const exportMailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Copy of my GradeFarm data')}&body=${encodeURIComponent(
    `Hi,\n\nPlease send me a copy of the personal information GradeFarm holds about me.\n\nAccount email: ${email || '(the email I signed up with)'}\n\nThanks`,
  )}`

  const levelBadges = RANK_TIERS.map((tier, i) => ({
    rank: tier.name, level: i,
    xpRequired: tier.xp,
    accuracyRequired: tier.accuracy,
    unlocked: i <= level,
    current: i === level,
  }))

  const atarLabel = ATAR_TARGETS.find(a => a.value === Number(profile.atar_target))?.label

  const dayStreak = currentStreak(profile.streak, profile.last_active)
  const stats = [
    { icon: Zap,          label: 'Total XP',       value: (profile.xp || 0).toLocaleString('en-AU') },
    { icon: Flame,        label: 'Current streak', value: `${dayStreak} day${dayStreak === 1 ? '' : 's'}` },
    { icon: Trophy,       label: 'Best streak',    value: `${profile.best_streak || 0} day${profile.best_streak === 1 ? '' : 's'}` },
    { icon: CalendarDays, label: 'Member since',   value: memberSince ? new Date(memberSince).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) : '—' },
  ]

  const msgLine = (m) => m && <div role="status" style={{ fontSize: 12, color: m.ok ? t.success : t.danger, marginTop: 8 }}>{m.text}</div>

  // ── Tab panels ──

  const overview = (
    <>
      {/* ── Profile summary ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#080d28', flexShrink: 0 }}>
            {(profile.display_name || '?')[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.display_name}</div>
            <div style={{ fontSize: 12, color: GOLD, fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><RankIcon level={level} size={13} /> {rank} · Level {level}</div>
            {(profile.school || profile.year_level) && (
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>
                {[profile.year_level && `Year ${profile.year_level}`, profile.school].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <button type="button" onClick={() => selectTab('profile')} style={btn('secondary')}>Edit profile</button>
        </div>

        {/* XP bar */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: t.textMuted }}>Level {level}</span>
            <span style={{ fontSize: 11, color: t.textMuted }}>{maxed ? `${profile.xp.toLocaleString('en-AU')} XP` : `${profile.xp} / ${next} XP`}</span>
          </div>
          <div style={{ background: t.border, borderRadius: 999, height: 6, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, borderRadius: 999, transition: 'width 0.8s' }} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 6 }}>
          {nextRankHint(profile.xp, recentAccuracy)}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="acct-stats">
        {stats.map(s => (
          <div key={s.label} style={{ ...card, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: t.textMuted, fontWeight: 600 }}>
              <s.icon size={14} color={GOLD} aria-hidden="true" /> {s.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.text, marginTop: 6 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Goals ── */}
      {isStudent && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Your goals</div>
            <button type="button" onClick={() => selectTab('profile')}
              style={{ border: 'none', background: 'none', padding: 0, color: t.goldText || GOLD, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              Edit
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11.5, color: t.textMuted, fontWeight: 600 }}>ATAR target</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginTop: 3 }}>{atarLabel || 'Not set'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: t.textMuted, fontWeight: 600 }}>Study time</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginTop: 3 }}>{profile.study_hours_per_week ? `${profile.study_hours_per_week} hours a week` : 'Not set'}</div>
            </div>
          </div>
          {profile.goals && <p style={{ fontSize: 13, color: t.textMuted, marginTop: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{profile.goals}</p>}
        </div>
      )}

      {/* ── Rank progression ── */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>Rank Progression</div>
        <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55, marginBottom: 14 }}>
          Each rank needs its XP and, from Silver up, a minimum accuracy over your recent answers.
          Yours is <strong style={{ color: t.text }}>{profile.recent_answers > 0 ? `${Math.round(recentAccuracy * 100)}%` : 'not set yet'}</strong>.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {levelBadges.map(b => (
            <div key={b.rank} style={{
              padding: '10px 12px', borderRadius: 10, border: `1px solid ${b.current ? GOLD : b.unlocked ? t.success + '44' : t.border}`,
              background: b.current ? `${GOLD}12` : b.unlocked ? `${t.success}08` : 'transparent',
              opacity: b.unlocked ? 1 : 0.45,
            }}>
              <div style={{ marginBottom: 4, display: 'flex' }}><RankIcon level={b.level} size={18} color={b.unlocked ? GOLD : t.textMuted} /></div>
              <div style={{ fontSize: 12, fontWeight: 700, color: b.current ? GOLD : t.text }}>{b.rank}</div>
              <div style={{ fontSize: 10, color: t.textFaint, marginTop: 2 }}>
                {b.xpRequired.toLocaleString('en-AU')} XP{b.accuracyRequired > 0 && ` · ${Math.round(b.accuracyRequired * 100)}%`}
              </div>
              {b.current && <div style={{ fontSize: 9, color: GOLD, fontWeight: 700, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Current</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  )

  const profilePanel = (
    <div style={card}>
      <CardTitle t={t} title="Personal details" sub={isStudent ? 'Your name shows on class leaderboards. The rest helps us pitch questions and your study plan at the right level.' : 'Your name shows to students and on class leaderboards.'} />
      <div className="acct-form">
        <Field t={t} label="Display name">
          <input value={form.display_name} onChange={setField('display_name')} maxLength={60} style={{ ...inputStyle, borderColor: nameMissing ? 'rgba(248,113,113,0.5)' : t.border }} />
        </Field>
        <Field t={t} label="Email" hint={pendingEmail ? `Changing to ${pendingEmail}, waiting for confirmation.` : 'Change it under Security & privacy.'}>
          <input value={email} readOnly disabled style={{ ...inputStyle, opacity: 0.7, cursor: 'not-allowed' }} />
        </Field>
        {isStudent && (
          <>
            <Field t={t} label="School">
              <input value={form.school} onChange={setField('school')} maxLength={120} placeholder="Your school name" style={inputStyle} />
            </Field>
            <Field t={t} label="Year level" hint={dobLocked ? 'Can be changed once your parent or guardian confirms.' : null}>
              <select value={form.year_level} onChange={setField('year_level')} disabled={dobLocked} style={{ ...inputStyle, cursor: dobLocked ? 'not-allowed' : 'pointer' }}>
                <option value="">Not set</option>
                {YEAR_LEVELS.map(y => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </Field>
            <Field t={t} label="Date of birth" hint={dobLocked ? 'Can be changed once your parent or guardian confirms.' : null}>
              <input type="date" value={form.dob} onChange={setField('dob')} max={new Date().toISOString().split('T')[0]} disabled={dobLocked} style={inputStyle} />
            </Field>
            {(!form.year_level || Number(form.year_level) >= 11 || form.atar_target !== '') && (
              <Field t={t} label="ATAR target">
                <select value={form.atar_target} onChange={setField('atar_target')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Not set</option>
                  {ATAR_TARGETS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </Field>
            )}
            <Field t={t} label="Study hours per week">
              <select value={form.study_hours_per_week} onChange={setField('study_hours_per_week')} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Not set</option>
                {STUDY_HOURS.map(h => <option key={h} value={h}>{h} hour{h === 1 ? '' : 's'}</option>)}
              </select>
            </Field>
            <div className="acct-form-wide">
              <Field t={t} label="What do you want to get better at?">
                <textarea value={form.goals} onChange={setField('goals')} maxLength={1000} rows={3}
                  placeholder="e.g. I want to improve my understanding of organic chemistry…"
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 80, lineHeight: 1.5 }} />
              </Field>
            </div>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="button" onClick={handleSaveProfile} disabled={savingProfile || nameMissing || !profileDirty} style={btn('primary', savingProfile || nameMissing || !profileDirty)}>
          {savingProfile ? 'Saving…' : 'Save changes'}
        </button>
        {profileDirty && !savingProfile && (
          <button type="button" onClick={() => setForm(saved)} style={btn('secondary')}>Discard</button>
        )}
        {nameMissing && <span style={{ fontSize: 12, color: t.danger }}>Your display name can't be empty.</span>}
      </div>
      {msgLine(profileMsg)}
    </div>
  )

  const securityPanel = (
    <>
      {familyChild ? (
      <div style={card}>
        <CardTitle t={t} title="Sign-in" sub={<>{profile.display_name || 'This child'} is part of your family account. You sign in with <strong style={{ color: t.text }}>{email}</strong> and switch to them from the menu, so they have no email or password of their own. To change the email or password, switch to the account you sign in to.</>} />
      </div>
      ) : (
      <div style={card}>
        <CardTitle t={t} title="Sign-in" sub={email ? <>You sign in as <strong style={{ color: t.text }}>{email}</strong>{authUser?.last_sign_in_at ? ` · last signed in ${longDate(authUser.last_sign_in_at)}` : ''}.</> : null} />

        <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>Email address</div>
        {pendingEmail && !emailMsg && (
          <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
            Waiting for you to confirm <strong style={{ color: t.text }}>{pendingEmail}</strong> from the link we emailed.
          </div>
        )}
        {editingEmail ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="email" autoComplete="email" aria-label="New email address" placeholder="New email address"
              value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChangeEmail()}
              style={{ ...inputStyle, flex: '1 1 220px', width: 'auto' }} autoFocus
            />
            <button type="button" onClick={handleChangeEmail} disabled={!newEmailValid || savingEmail} style={btn('primary', !newEmailValid || savingEmail)}>
              {savingEmail ? 'Sending…' : 'Send confirmation'}
            </button>
            <button type="button" onClick={() => { setEditingEmail(false); setNewEmail('') }} style={btn('secondary')}>Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => { setEditingEmail(true); setEmailMsg(null) }} style={btn('secondary')}>Change email</button>
        )}
        {msgLine(emailMsg)}

        <div style={{ height: 1, background: t.border, margin: '18px 0' }} />
        <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>Change password</div>
        <div className="acct-form">
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'} autoComplete="new-password" aria-label="New password"
              placeholder="New password (min 6 chars)" value={newPw} onChange={e => setNewPw(e.target.value)}
              style={{ ...inputStyle, paddingRight: 40 }}
            />
            <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', padding: 4, cursor: 'pointer', color: t.textMuted, display: 'flex' }}>
              {showPw ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
          <input
            type={showPw ? 'text' : 'password'} autoComplete="new-password" aria-label="Confirm new password"
            placeholder="Confirm new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
            style={{ ...inputStyle, borderColor: pwMismatch ? 'rgba(248,113,113,0.5)' : t.border }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={handleChangePassword} disabled={savingPw || pwTooShort || newPw !== confirmPw} style={btn('primary', savingPw || pwTooShort || newPw !== confirmPw)}>
            {savingPw ? 'Saving…' : 'Update password'}
          </button>
          {pwMismatch && <span style={{ fontSize: 12, color: t.danger }}>Passwords don't match.</span>}
        </div>
        {msgLine(pwMsg)}
      </div>
      )}

      <div style={card}>
        <CardTitle t={t} title="Sessions" sub="Signed in on a shared or lost device? Signing out everywhere ends every session, including this one." />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onSignOut} style={btn('secondary')}>Sign out</button>
          <button type="button" onClick={handleSignOutEverywhere} disabled={signingOutAll} style={btn('danger', signingOutAll)}>
            {signingOutAll ? 'Signing out…' : 'Sign out everywhere'}
          </button>
        </div>
      </div>

      <div style={card}>
        <CardTitle t={t} title="Your data" sub="You can ask for a copy of the information we hold about you. We action requests within 30 days." />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <a href={exportMailto} style={{ ...btn('secondary'), textDecoration: 'none', display: 'inline-block' }}>Request a copy of my data</a>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5 }}>
          <button type="button" onClick={() => navigate('/privacy')} style={{ border: 'none', background: 'none', padding: 0, color: t.goldText || GOLD, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Privacy Policy</button>
          <button type="button" onClick={() => navigate('/terms')} style={{ border: 'none', background: 'none', padding: 0, color: t.goldText || GOLD, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Terms of Service</button>
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: t.textMuted, fontWeight: 600, textDecoration: 'none' }}>{SUPPORT_EMAIL}</a>
        </div>
      </div>

      <div style={{ ...card, borderColor: 'rgba(239,68,68,0.3)' }}>
        <CardTitle t={t} title="Delete account" sub={profile.is_admin
          ? 'Admin accounts can\'t be deleted here. Ask another admin to remove your admin access first.'
          : profile.is_tutor
            ? 'Your students rely on your classes, lessons and recordings, so tutor accounts are closed by our team. We\'ll move your classes over first.'
            : familyChild
              ? `Permanently delete ${profile.display_name || 'this child'}'s account and everything tied to it. This can't be undone.`
              : otherChildren.length
                ? `Permanently delete this account and everything tied to it. ${otherChildren.map(c => c.name).join(' and ')}'s account${otherChildren.length > 1 ? 's are' : ' is'} deleted too, since you sign in to ${otherChildren.length > 1 ? 'them' : 'it'} through this one. This can't be undone.`
                : 'Permanently delete your account and everything tied to it. This can\'t be undone.'} />
        {profile.is_tutor && !profile.is_admin && (
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Close my GradeFarm tutor account')}&body=${encodeURIComponent(`Hi,\n\nPlease close my GradeFarm tutor account.\n\nAccount email: ${email || '(the email I signed up with)'}\n\nThanks`)}`}
            style={{ ...btn('danger'), textDecoration: 'none', display: 'inline-block' }}>Contact support</a>
        )}
        {isStudent && (!deleteOpen ? (
          <button type="button" onClick={() => setDeleteOpen(true)} style={btn('danger')}>Delete my account…</button>
        ) : (
          <>
            <ul style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, margin: '0 0 14px', paddingLeft: 18 }}>
              <li>Your profile, XP, streaks, practice history, study plan and messages are deleted.</li>
              <li>Any paid plan is cancelled straight away and you won't be charged again. There's no refund for the current week.</li>
              <li>You're removed from your tutors' rosters and classes.</li>
              <li>Recordings of your one-on-one lessons are deleted. Class recordings stay available to the rest of your class.</li>
              <li>We may keep payment records for as long as the law requires.</li>
            </ul>
            <div className="acct-form">
              <Field t={t} label={familyChild ? 'Your password (the one you sign in with)' : 'Your password'}>
                <input type="password" autoComplete="current-password" value={deletePw} onChange={e => setDeletePw(e.target.value)} style={inputStyle} />
              </Field>
              <Field t={t} label="Type DELETE to confirm">
                <input value={deleteWord} onChange={e => setDeleteWord(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleDeleteAccount()} autoComplete="off" style={inputStyle} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <button type="button" onClick={handleDeleteAccount} disabled={!canDelete || deleting} style={{ ...btn('danger', !canDelete || deleting), ...(canDelete && !deleting ? { background: t.danger, color: '#fff', border: 'none' } : {}) }}>
                {deleting ? 'Deleting…' : 'Permanently delete my account'}
              </button>
              <button type="button" onClick={() => { setDeleteOpen(false); setDeletePw(''); setDeleteWord(''); setDeleteMsg('') }} disabled={deleting} style={btn('secondary', deleting)}>Cancel</button>
            </div>
            {deleteMsg && <div role="alert" style={{ fontSize: 12, color: t.danger, marginTop: 8 }}>{deleteMsg}</div>}
          </>
        ))}
      </div>
    </>
  )

  const preferencesPanel = (
    <>
      {typeof onToggleTheme === 'function' && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                {theme === 'dark' ? <Moon size={15} color={GOLD} aria-hidden="true" /> : <Sun size={15} color={GOLD} aria-hidden="true" />} Dark mode
              </div>
              <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>Saved on this device.</div>
            </div>
            <Toggle on={theme === 'dark'} onClick={onToggleTheme} label="Dark mode" />
          </div>
        </div>
      )}

      {/* ── Email reminders (hidden until the automated-emails migration adds the column) ── */}
      {'emails_unsubscribed_at' in profile && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>Email reminders</div>
              <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
                Session reminders and assignment due dates. Emails your tutor sends you directly always arrive.
              </div>
            </div>
            <Toggle on={remindersOn} onClick={handleToggleReminders} disabled={savingReminders} label="Email reminders" />
          </div>
          {remindersMsg && <div style={{ fontSize: 12, color: t.danger, marginTop: 8 }}>{remindersMsg}</div>}
        </div>
      )}

      {!isStudent && (
        <div style={card}>
          <CardTitle t={t} title="Subject" sub="Switch which subject the Question Bank, Learn and Study Plan show." />
          <button type="button" onClick={onChangeSubject} style={btn('secondary')}>⇄ Change Subject</button>
        </div>
      )}

      {/* ── Feature tour (replay from Settings) ── */}
      {typeof onReplayFeatureTour === 'function' && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 8 }}>Feature tour</div>
          <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 14, lineHeight: 1.55 }}>
            Replay the guided walkthrough of the sidebar — Question Bank, Learn, History, Study Plan, and more.
          </p>
          <button type="button" onClick={handleReplayFeatureTour} disabled={replayTourBusy} style={btn('secondary', replayTourBusy)}>
            {replayTourBusy ? 'Preparing…' : 'Replay feature tour'}
          </button>
        </div>
      )}
    </>
  )

  const panels = {
    overview,
    profile: (
      <>
        {profilePanel}
        {isStudent && family && (
          <FamilyCard family={family} theme={theme} card={card} btn={btn} inputStyle={inputStyle} />
        )}
        {isStudent && 'parent_consent_at' in profile && (
          <ParentCard profile={profile} theme={theme} card={card} btn={btn} inputStyle={inputStyle} onProfileUpdated={onProfileUpdated} />
        )}
      </>
    ),
    billing: isStudent && <BillingCard profile={profile} theme={theme} card={card} btn={btn} onChangeSubject={onChangeSubject} />,
    security: securityPanel,
    preferences: preferencesPanel,
  }

  return (
    <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', fontFamily: FONT_B, color: t.text }}>
      <style>{`
        @font-face{font-family:'Sifonn Pro';src:url('/SIFONN_PRO.otf') format('opentype');font-display:swap;}
        .acct-wrap { max-width: 880px; margin: 0 auto; padding: 32px 32px 48px; }
        .acct-tabs { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid ${t.border}; margin-bottom: 20px; }
        .acct-tabs::-webkit-scrollbar { display: none; }
        .acct-tab { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; padding: 10px 14px; margin-bottom: -1px;
          border: none; border-bottom: 2px solid transparent; background: none; cursor: pointer; white-space: nowrap;
          font-family: ${FONT_B}; font-size: 13px; font-weight: 700; color: ${t.textMuted}; transition: color 0.15s, border-color 0.15s; }
        .acct-tab:hover { color: ${t.text}; }
        .acct-tab[aria-selected="true"] { color: ${t.goldText || GOLD}; border-bottom-color: ${GOLD}; }
        .acct-tab:focus-visible { outline: 2px solid ${GOLD}; outline-offset: -2px; border-radius: 6px 6px 0 0; }
        .acct-panel { display: flex; flex-direction: column; gap: 16px; }
        .acct-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .acct-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .acct-form-wide { grid-column: 1 / -1; }
        @media (max-width: 720px) { .acct-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .acct-form { grid-template-columns: minmax(0, 1fr); } }
        @media (max-width: 640px) { .acct-wrap { padding: 20px 16px 40px; } .acct-tab { padding: 10px 10px; } }
      `}</style>
      <div className="acct-wrap">
        <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Settings</div>
        <h1 style={{ fontSize: 22, fontFamily: FONT_D, fontWeight: 400, letterSpacing: 1.2, marginBottom: 6, color: t.text }}>My Account</h1>
        <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 20 }}>Your profile, subjects, security and preferences in one place.</p>

        {/* Tutor application status — surfaced here now that the global RoleSwitcherBar has been removed. */}
        {profile.tutor_application_status === 'pending' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 16, borderRadius: 12, background: 'rgba(241,190,67,0.10)', border: '1px solid rgba(241,190,67,0.28)', color: t.text, fontSize: 13 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD, boxShadow: `0 0 8px ${GOLD}`, flexShrink: 0 }} />
            <span><strong style={{ color: GOLD, fontWeight: 700 }}>Tutor application pending</strong> — an admin will review your application shortly.</span>
          </div>
        )}

        <div className="acct-tabs" role="tablist" aria-label="Account sections" onKeyDown={onTabKey}>
          {TABS.map(x => (
            <button
              key={x.id} ref={el => { tabRefs.current[x.id] = el }}
              type="button" role="tab" id={`acct-tab-${x.id}`} aria-controls={`acct-panel-${x.id}`}
              aria-selected={tab === x.id} tabIndex={tab === x.id ? 0 : -1}
              className="acct-tab" onClick={() => selectTab(x.id)}
            >
              <x.icon size={15} aria-hidden="true" /> {x.label}
            </button>
          ))}
        </div>

        <div className="acct-panel" role="tabpanel" id={`acct-panel-${tab}`} aria-labelledby={`acct-tab-${tab}`}>
          {panels[tab]}
        </div>
      </div>
    </div>
  )
}
