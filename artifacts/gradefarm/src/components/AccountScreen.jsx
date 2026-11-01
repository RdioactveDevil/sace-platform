import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { THEMES } from '../lib/theme'
import { updateProfile, getSubscriptions, getBillingConfig, openBillingPortal, removePaidSubject, switchBillingInterval, changeEmail, deleteMyAccount, syncBillingEmail, saveParentDetails, addFamilyChild, switchToChild, removeFamilyChild } from '../lib/db'
import { useFamily } from './FamilySwitcher'
import { awaitingParent, needsParentConsent } from '../lib/parentConsent'
import { formatSubjectLabel } from '../lib/subjects'
import { studentTiers, planTotal, extraLadder, monthlySaving, money } from '../lib/pricing'
import { supabase } from '../lib/supabase'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
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
  if (sub.source === 'beta') return { text: 'Free as a beta member', tone: 'success' }
  if (sub.source === 'free') return { text: `Free subject, ${freeDaily} questions a day`, tone: 'success' }
  if (sub.source === 'tutor') return { text: 'Included with your tutoring', tone: 'success' }
  if (sub.source !== 'stripe') return { text: 'Included by Titanium Tutoring', tone: 'success' }
  if (sub.status === 'past_due') return { text: 'Payment failed. Update your card.', tone: 'danger' }
  if (sub.cancel_at_period_end) return { text: `Ends ${shortDate(sub.current_period_end)}`, tone: 'muted' }
  if (sub.status === 'trialing') return { text: `Free trial until ${shortDate(sub.current_period_end)}`, tone: 'success' }
  return { text: 'In your plan', tone: 'muted' }
}

/** Card heading with an optional one-line description under it. */
function CardTitle({ t, title, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: t.textMuted, marginTop: 3, lineHeight: 1.55 }}>{sub}</div>}
    </div>
  )
}

/** An on/off switch: ink when on. */
function Toggle({ on, onClick, disabled, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} disabled={disabled} className="acct-switch"
      style={{
        width: 38, height: 22, borderRadius: 999, border: 'none', padding: 3, flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
        background: on ? 'var(--t-text)' : 'var(--t-borderMid)',
        display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background 0.15s',
      }}
    >
      <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--t-bgCard)' }} />
    </button>
  )
}

/** A label above a form control. */
function Field({ t, label, hint, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: t.textSub }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.45 }}>{hint}</span>}
    </label>
  )
}

/** A titled group of rows. `id` is what the section list jumps to. */
function Section({ id, title, sub, t, children, bare = false }) {
  return (
    <section id={`acct-${id}`} aria-labelledby={`acct-h-${id}`} style={{ scrollMarginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <h2 id={`acct-h-${id}`} style={{ margin: 0, fontSize: 15, fontWeight: 800, color: t.text }}>{title}</h2>
        {sub && <p style={{ margin: '3px 0 0', fontSize: 13, color: t.textMuted, lineHeight: 1.55, maxWidth: '68ch' }}>{sub}</p>}
      </div>
      {bare ? children : (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden' }}>{children}</div>
      )}
    </section>
  )
}

/**
 * One setting: label, its value (and a quieter note), an action on the
 * right, and an editor that opens under it.
 */
function Row({ t, label, value, note, noteTone, action, first = false, editor = null }) {
  const noteColour = noteTone === 'success' ? t.success : noteTone === 'danger' ? t.danger : t.textMuted
  return (
    <div style={{ borderTop: first ? 'none' : `1px solid ${t.border}` }}>
      <div className="acct-row">
        <div className="acct-row-label">{label}</div>
        <div className="acct-row-value">
          {value != null && value !== '' && <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text, overflowWrap: 'anywhere' }}>{value}</div>}
          {note && <div style={{ fontSize: 12.5, color: noteColour, lineHeight: 1.5, marginTop: value ? 2 : 0 }}>{note}</div>}
        </div>
        {action && <div className="acct-row-action">{action}</div>}
      </div>
      {editor && <div style={{ padding: '14px 16px 16px', borderTop: `1px solid ${t.border}`, background: t.bg, display: 'flex', flexDirection: 'column', gap: 12 }}>{editor}</div>}
    </div>
  )
}

/** The text-link action on a row. */
function RowLink({ t, onClick, children, tone, disabled, href }) {
  const style = {
    border: 'none', background: 'none', padding: 0, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
    color: tone === 'danger' ? t.danger : t.text, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
    textDecoration: 'underline', textDecorationColor: tone === 'danger' ? t.danger : t.accent, textDecorationThickness: 2, textUnderlineOffset: 3,
  }
  return href
    ? <a href={href} className="acct-link" style={style}>{children}</a>
    : <button type="button" className="acct-link" onClick={onClick} disabled={disabled} style={style}>{children}</button>
}

/** Tap-to-choose options, ink when chosen. */
function Chips({ t, options, value, onChange, label, disabled }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(([v, text]) => {
        const on = String(value) === String(v)
        return (
          <button key={v} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(on ? '' : v)} className="acct-chip"
            style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${on ? t.text : t.border}`, background: on ? t.text : t.bgCard, color: on ? t.bg : t.textSub,
              fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', fontVariantNumeric: 'tabular-nums' }}>
            {text}
          </button>
        )
      })}
    </div>
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
                <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{c.name}{c.id === family.currentId && <span style={{ color: t.textMuted, fontSize: 12, fontWeight: 700 }}> · open now</span>}</div>
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

function BillingCard({ profile, theme, onChangeSubject }) {
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

  const toneOf = (line) => line.tone === 'danger' ? 'danger' : line.tone === 'success' ? 'success' : null
  const pricing = `$${tiers[0]}/${plan?.hasPlan ? interval : 'week'} for your first paid subject${tiers.length > 1 ? `, then $${extraLadder(tiers)}/${plan?.hasPlan ? interval : 'week'} for each extra one` : ''}. One free subject has ${freeDaily} questions a day.`
  let first = true
  const isFirst = () => { const f = first; first = false; return f }
  return (
    <Section id="billing" title="Subjects and billing" sub={pricing} t={t}>
      {subs === null ? (
        <Row t={t} first={isFirst()} label="Subjects" note="Loading…" />
      ) : subs.length === 0 ? (
        <Row t={t} first={isFirst()} label="Subjects" note="You haven't picked a subject yet." />
      ) : subs.map(s => {
        const line = accessLine(s, freeDaily)
        const removable = s.source === 'stripe' && !s.cancel_at_period_end
        return (
          <Row key={s.id} t={t} first={isFirst()} label={formatSubjectLabel({ name: s.subject_name, stage: s.stage })} note={line.text} noteTone={toneOf(line)}
            action={removable && <RowLink t={t} onClick={() => remove(s)} disabled={!!busy}>{busy === s.id ? 'Removing…' : 'Remove'}</RowLink>} />
        )
      })}
      <Row t={t} label="Change subject" note="Add a subject, or switch which one you're studying."
        action={<RowLink t={t} onClick={onChangeSubject}>Choose subject</RowLink>} />
      {plan?.hasPlan ? (
        <>
          <Row t={t} label="Plan" value={`$${money(plan.total)} a ${interval}`}
            note={plan.endsAtPeriodEnd ? `Ends ${shortDate(plan.renewsAt)}` : plan.renewsAt ? `${plan.trialing ? 'First' : 'Next'} bill ${shortDate(plan.renewsAt)}` : null}
            action={paid.length > 0 && <RowLink t={t} onClick={openPortal} disabled={!!busy}>{busy === 'portal' ? 'Opening…' : 'Card and receipts'}</RowLink>} />
          {!plan.endsAtPeriodEnd && (
            <Row t={t} label="Billed" value={interval === 'month' ? 'Monthly' : 'Weekly'}
              action={<RowLink t={t} onClick={switchInterval} disabled={!!busy}>
                {busy === 'interval' ? 'Switching…' : otherInterval === 'month' ? `Pay monthly${saving ? ` (save ${saving}%)` : ''}` : 'Pay weekly instead'}
              </RowLink>} />
          )}
        </>
      ) : paid.length > 0 ? (
        <Row t={t} label="Plan" note="Update your card or download receipts in the secure Stripe billing page."
          action={<RowLink t={t} onClick={openPortal} disabled={!!busy}>{busy === 'portal' ? 'Opening…' : 'Card and receipts'}</RowLink>} />
      ) : (
        <Row t={t} label="Plan" value="No paid plan" note="Add a subject to unlock unlimited questions in it." />
      )}
      {error && <div role="alert" style={{ fontSize: 12.5, color: t.danger, padding: '0 16px 12px' }}>{error}</div>}
    </Section>
  )
}

export default function AccountScreen({ profile, theme, onToggleTheme, onSignOut, onChangeSubject, onReplayFeatureTour, onProfileUpdated }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  const isStudent = !profile.is_tutor && !profile.is_admin

  // The section list on the left jumps to a section and shows where you are.
  const scrollRef = useRef(null)
  const [active, setActive] = useState('profile')
  const jumpTo = (id, smooth = true) => {
    const el = document.getElementById(`acct-${id}`)
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'start' })
    setActive(id)
  }
  // Old links (?tab=billing and so on) open at that section.
  const [params] = useSearchParams()
  const tabParam = params.get('tab')
  useEffect(() => {
    const id = { billing: 'billing', security: 'signin', preferences: 'preferences' }[tabParam]
    if (!id) return
    const timer = setTimeout(() => jumpTo(id, false), 80)
    return () => clearTimeout(timer)
  }, [tabParam]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Editing one row at a time ──
  const [editing, setEditing]   = useState(null) // row key
  const [draft, setDraft]       = useState({})
  const [rowBusy, setRowBusy]   = useState(false)
  const [rowMsg, setRowMsg]     = useState(null) // { key, ok, text }
  const startEdit = (key, values) => { setEditing(key); setDraft(values); setRowMsg(null) }
  const cancelEdit = () => { setEditing(null); setDraft({}); setRowMsg(null) }
  const saveRow = async (key, updates) => {
    setRowBusy(true)
    try {
      await updateProfile(profile.id, updates)
      onProfileUpdated?.(updates)
      setEditing(null)
      setRowMsg({ key, ok: true, text: 'Saved.' })
      setTimeout(() => setRowMsg(m => (m?.key === key && m.ok ? null : m)), 3000)
    } catch {
      setRowMsg({ key, ok: false, text: "Couldn't save. Check your connection and try again." })
    }
    setRowBusy(false)
  }

  // Waiting on a parent: the database keeps these as they are (migration
  // 20261025000012_parent_consent.sql), so don't offer to change them.
  const dobLocked = awaitingParent(profile)

  // ── Password ──
  const [newPw, setNewPw]               = useState('')
  const [confirmPw, setConfirmPw]       = useState('')
  const [showPw, setShowPw]             = useState(false)
  const [editingPw, setEditingPw]       = useState(false)
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

  // A plain card, for the parent and family panels.
  const plainCard = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: '16px 18px' }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
    border: `1px solid ${t.border}`, background: t.bgCard,
    color: t.text, fontSize: 14, fontFamily: FONT_B, outline: 'none', colorScheme: theme,
  }

  const btn = (variant = 'primary', disabled = false) => ({
    padding: '8px 16px', borderRadius: 9, fontFamily: FONT_B, fontSize: 13, fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
    ...(variant === 'primary' ? { border: 'none', background: t.accent, color: '#0c1037' }
      : variant === 'danger' ? { border: `1px solid ${t.danger}`, background: 'transparent', color: t.danger }
      : { border: `1px solid ${t.border}`, background: t.bgCard, color: t.text }),
  })

  const pwTooShort = newPw.length < 6
  const pwMismatch = confirmPw.length > 0 && confirmPw !== newPw
  const handleChangePassword = async () => {
    if (pwTooShort) { setPwMsg({ ok: false, text: 'Use at least 6 characters.' }); return }
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: "The two don't match." }); return }
    setSavingPw(true); setPwMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) setPwMsg({ ok: false, text: error.message })
    else { setPwMsg({ ok: true, text: 'Password updated.' }); setNewPw(''); setConfirmPw(''); setEditingPw(false) }
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
      setRemindersMsg("Couldn't save. Try again.")
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

  // ── Sections ──
  const isFamilyParent = isStudent && !!family
  const hasParentCard = isStudent && 'parent_consent_at' in profile
  const NAV = [
    { id: 'profile', label: 'Profile' },
    isFamilyParent && { id: 'family', label: 'Your children' },
    hasParentCard && { id: 'parent', label: 'Parent or guardian' },
    isStudent && { id: 'billing', label: 'Subjects and billing' },
    { id: 'signin', label: 'Sign-in' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'data', label: 'Your data' },
  ].filter(Boolean)

  // Highlight the section being read in the list on the left.
  const navKey = NAV.map(n => n.id).join(',')
  useEffect(() => {
    const root = scrollRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(entries => {
      const seen = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (seen[0]) setActive(seen[0].target.id.replace('acct-', ''))
    }, { root, rootMargin: '0px 0px -65% 0px' })
    navKey.split(',').forEach(id => { const el = document.getElementById(`acct-${id}`); if (el) obs.observe(el) })
    return () => obs.disconnect()
  }, [navKey])

  const atarLabel = ATAR_TARGETS.find(a => a.value === Number(profile.atar_target))?.label
  const goalValue = [atarLabel && `ATAR ${atarLabel}`, profile.study_hours_per_week && `${profile.study_hours_per_week} hour${Number(profile.study_hours_per_week) === 1 ? '' : 's'} a week`].filter(Boolean).join(' · ')
  const lockNote = 'Can be changed once your parent or guardian confirms.'
  const saveCancel = (key, onSave, disabled) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" onClick={onSave} disabled={disabled || rowBusy} style={btn('primary', disabled || rowBusy)}>{rowBusy ? 'Saving…' : 'Save'}</button>
      <button type="button" onClick={cancelEdit} disabled={rowBusy} style={btn('secondary', rowBusy)}>Cancel</button>
      {rowMsg?.key === key && !rowMsg.ok && <span role="alert" style={{ fontSize: 12.5, color: t.danger }}>{rowMsg.text}</span>}
    </div>
  )
  const saved = (key) => rowMsg?.key === key && rowMsg.ok ? 'Saved.' : null
  const change = (key, values, disabled) => editing === key ? null : <RowLink t={t} onClick={() => startEdit(key, values)} disabled={disabled}>Change</RowLink>

  const profileSection = (
    <Section id="profile" title="Profile" t={t}>
      <Row t={t} first label="Name" value={profile.display_name || 'Not set'}
        note={saved('name') || (isStudent ? 'Shows on class leaderboards.' : 'Shows to students and on class leaderboards.')} noteTone={saved('name') ? 'success' : null}
        action={change('name', { display_name: profile.display_name || '' })}
        editor={editing === 'name' && (
          <>
            <Field t={t} label="Name">
              <input value={draft.display_name} onChange={e => setDraft(d => ({ ...d, display_name: e.target.value }))} maxLength={60} autoFocus style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter' && draft.display_name.trim()) saveRow('name', { display_name: draft.display_name.trim() }) }} />
            </Field>
            {saveCancel('name', () => saveRow('name', { display_name: draft.display_name.trim() }), !draft.display_name?.trim())}
          </>
        )} />
      {isStudent && (
        <>
          <Row t={t} label="Year level" value={profile.year_level ? `Year ${profile.year_level}` : 'Not set'} note={saved('year') || (dobLocked ? lockNote : null)} noteTone={saved('year') ? 'success' : null}
            action={!dobLocked && change('year', { year_level: profile.year_level ?? '' })}
            editor={editing === 'year' && (
              <>
                <Chips t={t} label="Year level" options={YEAR_LEVELS.map(y => [y, `Year ${y}`])} value={draft.year_level} onChange={v => setDraft(d => ({ ...d, year_level: v }))} />
                {saveCancel('year', () => saveRow('year', { year_level: draft.year_level === '' ? null : Number(draft.year_level) }))}
              </>
            )} />
          <Row t={t} label="School" value={profile.school || 'Not set'} note={saved('school')} noteTone="success"
            action={change('school', { school: profile.school || '' })}
            editor={editing === 'school' && (
              <>
                <Field t={t} label="School">
                  <input value={draft.school} onChange={e => setDraft(d => ({ ...d, school: e.target.value }))} maxLength={120} autoFocus autoComplete="organization" style={inputStyle}
                    onKeyDown={e => { if (e.key === 'Enter') saveRow('school', { school: draft.school.trim() || null }) }} />
                </Field>
                {saveCancel('school', () => saveRow('school', { school: draft.school.trim() || null }))}
              </>
            )} />
          <Row t={t} label="Date of birth" value={profile.dob ? longDate(profile.dob) : 'Not set'} note={saved('dob') || (dobLocked ? lockNote : null)} noteTone={saved('dob') ? 'success' : null}
            action={!dobLocked && change('dob', { dob: profile.dob || '' })}
            editor={editing === 'dob' && (
              <>
                <Field t={t} label="Date of birth">
                  <input type="date" value={draft.dob} onChange={e => setDraft(d => ({ ...d, dob: e.target.value }))} max={new Date().toISOString().split('T')[0]} autoFocus style={{ ...inputStyle, maxWidth: 240 }} />
                </Field>
                {saveCancel('dob', () => saveRow('dob', { dob: draft.dob || null }))}
              </>
            )} />
          <Row t={t} label="Goal" value={goalValue || 'Not set'} note={saved('goal') || profile.goals || null} noteTone={saved('goal') ? 'success' : null}
            action={change('goal', { atar_target: profile.atar_target ?? '', study_hours_per_week: profile.study_hours_per_week ?? '', goals: profile.goals || '' })}
            editor={editing === 'goal' && (
              <>
                {(!profile.year_level || Number(profile.year_level) >= 11 || draft.atar_target !== '') && (
                  <Field t={t} label="ATAR target">
                    <Chips t={t} label="ATAR target" options={ATAR_TARGETS.map(a => [a.value, a.label])} value={draft.atar_target} onChange={v => setDraft(d => ({ ...d, atar_target: v }))} />
                  </Field>
                )}
                <Field t={t} label="Hours a week you can study">
                  <Chips t={t} label="Hours a week" options={STUDY_HOURS.map(h => [h, String(h)])} value={draft.study_hours_per_week} onChange={v => setDraft(d => ({ ...d, study_hours_per_week: v }))} />
                </Field>
                <Field t={t} label="What do you want to get better at?">
                  <textarea value={draft.goals} onChange={e => setDraft(d => ({ ...d, goals: e.target.value }))} maxLength={1000} rows={2} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                </Field>
                {saveCancel('goal', () => saveRow('goal', {
                  atar_target: draft.atar_target === '' ? null : Number(draft.atar_target),
                  study_hours_per_week: draft.study_hours_per_week === '' ? null : Number(draft.study_hours_per_week),
                  goals: draft.goals.trim() || null,
                }))}
              </>
            )} />
        </>
      )}
    </Section>
  )

  const signinSection = (
    <Section id="signin" title="Sign-in" t={t}>
      {familyChild ? (
        <Row t={t} first label="Sign-in" note={<>{profile.display_name || 'This child'} is part of your family account. You sign in with <strong style={{ color: t.text }}>{email}</strong> and switch to them from the menu, so they have no email or password of their own.</>} />
      ) : (
        <>
          <Row t={t} first label="Email" value={email || '—'}
            note={emailMsg ? emailMsg.text : pendingEmail ? `Waiting for you to confirm ${pendingEmail} from the link we emailed.` : null}
            noteTone={emailMsg ? (emailMsg.ok ? 'success' : 'danger') : null}
            action={!editingEmail && <RowLink t={t} onClick={() => { setEditingEmail(true); setEmailMsg(null) }}>Change</RowLink>}
            editor={editingEmail && (
              <>
                <Field t={t} label="New email address" hint="We email it a link to confirm. You keep signing in with the old one until then.">
                  <input type="email" autoComplete="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChangeEmail()} autoFocus style={inputStyle} />
                </Field>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={handleChangeEmail} disabled={!newEmailValid || savingEmail} style={btn('primary', !newEmailValid || savingEmail)}>{savingEmail ? 'Sending…' : 'Send confirmation'}</button>
                  <button type="button" onClick={() => { setEditingEmail(false); setNewEmail('') }} style={btn('secondary')}>Cancel</button>
                </div>
              </>
            )} />
          <Row t={t} label="Password" value="••••••••" note={pwMsg?.text} noteTone={pwMsg ? (pwMsg.ok ? 'success' : 'danger') : null}
            action={!editingPw && <RowLink t={t} onClick={() => { setEditingPw(true); setPwMsg(null) }}>Change</RowLink>}
            editor={editingPw && (
              <>
                <div className="acct-form">
                  <Field t={t} label="New password" hint="At least 6 characters.">
                    <div style={{ position: 'relative' }}>
                      <input type={showPw ? 'text' : 'password'} autoComplete="new-password" value={newPw} onChange={e => setNewPw(e.target.value)} autoFocus style={{ ...inputStyle, paddingRight: 60 }} />
                      <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}
                        style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', padding: '4px 6px', cursor: 'pointer', color: t.textSub, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700 }}>
                        {showPw ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </Field>
                  <Field t={t} label="Type it again">
                    <input type={showPw ? 'text' : 'password'} autoComplete="new-password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                      aria-invalid={pwMismatch || undefined} style={{ ...inputStyle, borderColor: pwMismatch ? t.danger : t.border }} />
                  </Field>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={handleChangePassword} disabled={savingPw || pwTooShort || newPw !== confirmPw} style={btn('primary', savingPw || pwTooShort || newPw !== confirmPw)}>{savingPw ? 'Saving…' : 'Update password'}</button>
                  <button type="button" onClick={() => { setEditingPw(false); setNewPw(''); setConfirmPw('') }} style={btn('secondary')}>Cancel</button>
                  {pwMismatch && <span style={{ fontSize: 12.5, color: t.danger }}>The two don't match.</span>}
                </div>
              </>
            )} />
        </>
      )}
      <Row t={t} label="This device" note={authUser?.last_sign_in_at ? `Last signed in ${longDate(authUser.last_sign_in_at)}. Signing out everywhere ends every session, including this one.` : 'Signing out everywhere ends every session, including this one.'}
        action={(
          <span style={{ display: 'inline-flex', gap: 16, flexWrap: 'wrap' }}>
            <RowLink t={t} onClick={onSignOut}>Sign out</RowLink>
            <RowLink t={t} onClick={handleSignOutEverywhere} disabled={signingOutAll}>{signingOutAll ? 'Signing out…' : 'Sign out everywhere'}</RowLink>
          </span>
        )} />
    </Section>
  )

  const preferencesSection = (
    <Section id="preferences" title="Preferences" t={t}>
      {'emails_unsubscribed_at' in profile && (
        <Row t={t} first label="Email reminders" note={remindersMsg || 'Lesson reminders and assignment due dates. Emails your tutor sends you directly always arrive.'} noteTone={remindersMsg ? 'danger' : null}
          action={<Toggle on={remindersOn} onClick={handleToggleReminders} disabled={savingReminders} label="Email reminders" />} />
      )}
      {typeof onToggleTheme === 'function' && (
        <Row t={t} first={!('emails_unsubscribed_at' in profile)} label="Dark mode" note="Saved on this device. Also in the sidebar."
          action={<Toggle on={theme === 'dark'} onClick={onToggleTheme} label="Dark mode" />} />
      )}
      {!isStudent && (
        <Row t={t} label="Subject" note="Which subject the Question Bank, Learn and Study Plan show."
          action={<RowLink t={t} onClick={onChangeSubject}>Change subject</RowLink>} />
      )}
      {typeof onReplayFeatureTour === 'function' && (
        <Row t={t} label="Feature tour" note="The guided walk through the sidebar: Question Bank, Learn, History, Study Plan and more."
          action={<RowLink t={t} onClick={handleReplayFeatureTour} disabled={replayTourBusy}>{replayTourBusy ? 'Preparing…' : 'Replay'}</RowLink>} />
      )}
    </Section>
  )

  const deleteNote = profile.is_admin
    ? "Admin accounts can't be deleted here. Ask another admin to remove your admin access first."
    : profile.is_tutor
      ? 'Your students rely on your classes, lessons and recordings, so tutor accounts are closed by our team. We move your classes over first.'
      : familyChild
        ? `Deletes ${profile.display_name || 'this child'}'s account and everything tied to it. This can't be undone.`
        : otherChildren.length
          ? `Deletes this account and everything tied to it. ${otherChildren.map(c => c.name).join(' and ')}'s account${otherChildren.length > 1 ? 's are' : ' is'} deleted too, since you sign in to ${otherChildren.length > 1 ? 'them' : 'it'} through this one. This can't be undone.`
          : "Deletes your account and everything tied to it. This can't be undone."
  const dataSection = (
    <Section id="data" title="Your data" t={t}>
      <Row t={t} first label="A copy of your data" note="Ask for a copy of the information we hold about you. We reply within 30 days."
        action={<RowLink t={t} href={exportMailto}>Ask for a copy</RowLink>} />
      <Row t={t} label="Policies" note={<>Questions? Email <span style={{ color: t.text, fontWeight: 600, userSelect: 'all' }}>{SUPPORT_EMAIL}</span></>}
        action={(
          <span style={{ display: 'inline-flex', gap: 16, flexWrap: 'wrap' }}>
            <RowLink t={t} onClick={() => navigate('/privacy')}>Privacy policy</RowLink>
            <RowLink t={t} onClick={() => navigate('/terms')}>Terms</RowLink>
          </span>
        )} />
      <Row t={t} label="Delete account" note={deleteNote}
        action={
          profile.is_tutor && !profile.is_admin
            ? <RowLink t={t} tone="danger" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Close my GradeFarm tutor account')}&body=${encodeURIComponent(`Hi,\n\nPlease close my GradeFarm tutor account.\n\nAccount email: ${email || '(the email I signed up with)'}\n\nThanks`)}`}>Contact support</RowLink>
            : isStudent && !deleteOpen && <RowLink t={t} tone="danger" onClick={() => setDeleteOpen(true)}>Delete account</RowLink>
        }
        editor={isStudent && deleteOpen && (
          <>
            <ul style={{ fontSize: 13, color: t.textSub, lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={handleDeleteAccount} disabled={!canDelete || deleting} style={{ ...btn('danger', !canDelete || deleting), ...(canDelete && !deleting ? { background: t.danger, color: '#fff', border: 'none' } : {}) }}>
                {deleting ? 'Deleting…' : 'Permanently delete my account'}
              </button>
              <button type="button" onClick={() => { setDeleteOpen(false); setDeletePw(''); setDeleteWord(''); setDeleteMsg('') }} disabled={deleting} style={btn('secondary', deleting)}>Cancel</button>
            </div>
            {deleteMsg && <div role="alert" style={{ fontSize: 12.5, color: t.danger }}>{deleteMsg}</div>}
          </>
        )} />
    </Section>
  )

  return (
    <div ref={scrollRef} style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', fontFamily: FONT_B, color: t.text, background: t.bg }}>
      <style>{`
        .acct-wrap { max-width: 980px; margin: 0 auto; padding: 24px 28px 64px; }
        .acct-grid { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 32px; align-items: start; margin-top: 20px; }
        .acct-nav { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 2px; }
        .acct-nav button { text-align: left; padding: 7px 10px; border-radius: 8px; border: none; background: transparent; color: ${t.textMuted}; font-family: ${FONT_B}; font-size: 13px; font-weight: 500; cursor: pointer; }
        .acct-nav button:hover { color: ${t.text}; }
        .acct-nav button[aria-current="true"] { background: ${t.bgCard}; color: ${t.text}; font-weight: 700; box-shadow: 0 0 0 1px ${t.border}; }
        .acct-main { display: flex; flex-direction: column; gap: 28px; min-width: 0; }
        .acct-row { display: flex; align-items: center; gap: 16px; padding: 12px 16px; }
        .acct-row-label { width: 170px; flex-shrink: 0; font-size: 13px; color: ${t.textMuted}; }
        .acct-row-value { flex: 1; min-width: 0; }
        .acct-row-action { flex-shrink: 0; display: flex; align-items: center; }
        .acct-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .acct-link:focus-visible, .acct-switch:focus-visible, .acct-chip:focus-visible, .acct-nav button:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 2px; }
        .acct-chip:hover:not(:disabled) { border-color: ${t.textMuted} !important; }
        @media (max-width: 860px) {
          .acct-wrap { padding: 18px 16px 48px; }
          .acct-grid { grid-template-columns: 1fr; }
          .acct-nav { display: none; }
        }
        @media (max-width: 560px) {
          .acct-row { flex-wrap: wrap; gap: 2px 12px; }
          .acct-row-label { width: 100%; }
          .acct-form { grid-template-columns: 1fr; }
        }
      `}</style>
      <div className="acct-wrap">
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: t.text }}>Account</h1>
        <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>
          {[email, memberSince && `member since ${new Date(memberSince).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}`].filter(Boolean).join(' · ')}
        </div>
        <div className="acct-grid">
          <nav className="acct-nav" aria-label="Account sections">
            {NAV.map(n => (
              <button key={n.id} type="button" aria-current={active === n.id ? 'true' : undefined} onClick={() => jumpTo(n.id)}>{n.label}</button>
            ))}
          </nav>
          <div className="acct-main">
            {profileSection}
            {isFamilyParent && (
              <section id="acct-family" style={{ scrollMarginTop: 16 }}>
                <FamilyCard family={family} theme={theme} card={plainCard} btn={btn} inputStyle={inputStyle} />
              </section>
            )}
            {hasParentCard && (
              <section id="acct-parent" style={{ scrollMarginTop: 16 }}>
                <ParentCard profile={profile} theme={theme} card={plainCard} btn={btn} inputStyle={inputStyle} onProfileUpdated={onProfileUpdated} />
              </section>
            )}
            {isStudent && <BillingCard profile={profile} theme={theme} onChangeSubject={onChangeSubject} />}
            {signinSection}
            {preferencesSection}
            {dataSection}
          </div>
        </div>
      </div>
    </div>
  )
}
