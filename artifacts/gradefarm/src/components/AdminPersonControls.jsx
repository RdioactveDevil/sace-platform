import { useCallback, useEffect, useState } from 'react'
import { confirmDialog } from '../lib/dialog'
import { FONT_B } from '../lib/adminUi'
import { AU_STATES } from '../lib/subjectFilter'
import {
  getPerson, savePersonDetails, savePersonParent, sendPersonPasswordReset, signOutPerson,
  savePersonSettings, changePersonBilling, clearPersonEmailBlock,
} from '../lib/adminDb'

// Admin → People → a person: their details, parent or guardian, sign-in and
// settings, and plan. AdminPeopleTab places each section in the panel;
// usePerson loads them once for all four.

const YEARS = [6, 7, 8, 9, 10, 11, 12]
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const money = (n) => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`

/** The person's account, and a reload. person: null while loading, { error } if it failed. */
export function usePerson(id) {
  const [person, setPerson] = useState(null)
  const load = useCallback(async () => {
    if (!id) return
    try { setPerson(await getPerson(id)) } catch (e) { setPerson({ error: e.message || "Couldn't load their account." }) }
  }, [id])
  useEffect(() => { setPerson(null); load() }, [load])
  return [person, load]
}

/** Runs one action at a time per section, with its message. */
function useAction(reload, onChanged) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const run = async (key, fn, ok) => {
    setBusy(key); setMsg(null)
    try {
      const r = await fn()
      setMsg({ ok: true, text: typeof ok === 'function' ? ok(r) : ok })
      await reload()
      onChanged?.()
    } catch (e) {
      setMsg({ ok: false, text: e.message || "That didn't work." })
    }
    setBusy('')
  }
  return { busy, msg, run }
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-text)', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}
function Btn({ children, onClick, disabled, variant, title }) {
  const primary = variant === 'primary'
  const danger = variant === 'danger'
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} style={{
      padding: '7px 13px', borderRadius: 9, fontSize: 12.5, fontWeight: 800, fontFamily: FONT_B, whiteSpace: 'nowrap',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      border: primary ? 'none' : `1px solid ${danger ? 'var(--t-danger)' : 'var(--t-border)'}`,
      background: primary ? 'var(--t-accent)' : danger ? 'transparent' : 'var(--t-bgCard)',
      color: primary ? 'var(--t-onAccent)' : danger ? 'var(--t-danger)' : 'var(--t-text)',
    }}>{children}</button>
  )
}
const Msg = ({ msg }) => msg && (
  <div role="status" style={{ fontSize: 12, marginTop: 8, color: msg.ok ? 'var(--t-success)' : 'var(--t-danger)', lineHeight: 1.5 }}>{msg.text}</div>
)
const Hint = ({ children }) => <div style={{ fontSize: 11.5, color: 'var(--t-textMuted)', lineHeight: 1.5 }}>{children}</div>
const field = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--t-textMuted)' }
const input = { padding: '7px 10px', borderRadius: 9, background: 'var(--t-bgInput)', border: '1px solid var(--t-border)', color: 'var(--t-text)', fontSize: 13, fontFamily: FONT_B, outline: 'none', boxSizing: 'border-box', width: '100%', fontWeight: 500 }
const loadingOrError = (person) => (!person
  ? <Hint>Loading…</Hint>
  : person.error ? <div style={{ fontSize: 12, color: 'var(--t-danger)' }}>{person.error}</div> : null)

// ── Details ──────────────────────────────────────────────────────────────────

export function PersonDetails({ person, reload, onChanged }) {
  const p = person?.profile
  const s = person?.signIn
  const initial = p ? {
    displayName: p.display_name || '', email: s?.email || '', yearLevel: p.year_level ?? '', state: p.state || '', school: p.school || '', dob: p.dob || '',
  } : null
  const [form, setForm] = useState(initial)
  useEffect(() => { setForm(initial) }, [person]) // eslint-disable-line react-hooks/exhaustive-deps
  const { busy, msg, run } = useAction(reload, onChanged)
  const wait = loadingOrError(person)
  if (wait) return <Section title="Details">{wait}</Section>

  // The form catches up with a newly loaded person one render later.
  const values = form || initial
  const set = (k) => (e) => setForm(f => ({ ...(f || initial), [k]: e.target.value }))
  const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => String(v ?? '') !== String(initial[k] ?? '')))
  if (s.family) delete changed.email
  const isStudent = !p.is_tutor && !p.is_admin

  return (
    <Section title="Details">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <label style={field}>Name<input value={values.displayName} onChange={set('displayName')} style={input} maxLength={80} /></label>
        <label style={field}>Sign-in email
          <input type="email" value={s.family ? (s.contactEmail || '') : values.email} onChange={set('email')} style={{ ...input, opacity: s.family ? 0.6 : 1 }} disabled={s.family} />
        </label>
        {isStudent && (
          <label style={field}>Year
            <select value={values.yearLevel} onChange={set('yearLevel')} style={input}>
              <option value="">Not set</option>
              {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </label>
        )}
        <label style={field}>State
          <select value={values.state} onChange={set('state')} style={input}>
            <option value="">Not set</option>
            {AU_STATES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        {isStudent && <label style={field}>School<input value={values.school} onChange={set('school')} style={input} maxLength={120} /></label>}
        {isStudent && <label style={field}>Date of birth<input type="date" value={values.dob} onChange={set('dob')} style={input} /></label>}
      </div>
      {s.family && <div style={{ marginTop: 6 }}><Hint>Signs in through their parent's account, so it has no email of its own. Shown: the parent's.</Hint></div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <Btn variant="primary" disabled={!Object.keys(changed).length || !!busy} onClick={async () => {
          if (changed.email && !(await confirmDialog(`Change their sign-in email to ${changed.email}? They'll sign in with it from now on.`, { confirm: 'Change it' }))) return
          run('save', () => savePersonDetails(p.id, changed), 'Saved.')
        }}>{busy === 'save' ? 'Saving…' : 'Save details'}</Btn>
        {Object.keys(changed).length > 0 && <Btn disabled={!!busy} onClick={() => setForm(initial)}>Undo</Btn>}
      </div>
      <Msg msg={msg} />
    </Section>
  )
}

// ── Parent or guardian ───────────────────────────────────────────────────────

export function PersonParent({ person, reload, onChanged }) {
  const p = person?.profile
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  useEffect(() => { setName(p?.parent_name || ''); setEmail(p?.parent_email || '') }, [person]) // eslint-disable-line react-hooks/exhaustive-deps
  const { busy, msg, run } = useAction(reload, onChanged)
  const wait = loadingOrError(person)
  if (wait) return <Section title="Parent or guardian">{wait}</Section>
  if (p.is_tutor || p.is_admin) return null

  const holder = p.account_holder === 'parent'
  const status = !p.parent_email ? 'None added.'
    : p.parent_consent_at ? `Confirmed ${fmtDate(p.parent_consent_at)}.`
      : `Hasn't confirmed yet${p.parent_consent_requested_at ? ` (email sent ${fmtDate(p.parent_consent_requested_at)})` : ''}.`
  const dirty = name !== (p.parent_name || '') || email.trim().toLowerCase() !== (p.parent_email || '').toLowerCase()

  return (
    <Section title="Parent or guardian">
      <div style={{ fontSize: 12.5, color: 'var(--t-textSub)', lineHeight: 1.5, marginBottom: 8 }}>
        {holder ? 'A parent set this account up and signs in with it.' : status}
        {person.parentConsentNeeded && !p.parent_consent_at && <span style={{ color: 'var(--t-goldText)', fontWeight: 600 }}> Under 15: the AI features wait until a parent confirms.</span>}
        {p.parent_reports_stopped_at && <span> Weekly reports stopped {fmtDate(p.parent_reports_stopped_at)}.</span>}
      </div>
      {!holder && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <label style={field}>Their name<input value={name} onChange={e => setName(e.target.value)} style={input} maxLength={80} /></label>
          <label style={field}>Their email<input type="email" value={email} onChange={e => setEmail(e.target.value)} style={input} /></label>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {!holder && (
          <Btn variant="primary" disabled={!dirty || !!busy} onClick={() => run('save', () => savePersonParent(p.id, { parentName: name, parentEmail: email }),
            r => (r.sent ? `Saved, and the email went to ${email.trim()}.` : 'Saved.'))}>{busy === 'save' ? 'Saving…' : 'Save'}</Btn>
        )}
        {!holder && p.parent_email && !p.parent_consent_at && (
          <Btn disabled={!!busy} onClick={() => run('resend', () => savePersonParent(p.id, { resend: true }), `Sent again to ${p.parent_email}.`)}>Send the email again</Btn>
        )}
        {!holder && p.parent_email && (p.parent_consent_at
          ? <Btn disabled={!!busy} onClick={() => run('unconfirm', () => savePersonParent(p.id, { confirmed: false }), 'Marked as not confirmed.')}>Mark not confirmed</Btn>
          : <Btn disabled={!!busy} onClick={async () => {
              if (!(await confirmDialog(`Mark ${p.parent_email} as confirmed without them clicking the link? Only do this if you've heard from them directly.`, { confirm: 'Mark confirmed' }))) return
              run('confirm', () => savePersonParent(p.id, { confirmed: true }), 'Marked as confirmed.')
            }}>Mark confirmed</Btn>)}
      </div>
      <Msg msg={msg} />
    </Section>
  )
}

// ── Sign-in and settings ─────────────────────────────────────────────────────

const BLOCK_REASON = {
  complained: 'They reported one of our emails as spam',
  bounced: 'An email to them bounced',
  suppressed: 'Our email provider is refusing to send to them',
}

export function PersonSignIn({ person, reload, onChanged, isSelf }) {
  const { busy, msg, run } = useAction(reload, onChanged)
  const wait = loadingOrError(person)
  if (wait) return <Section title="Sign-in and settings">{wait}</Section>
  const p = person.profile
  const s = person.signIn
  const isStudent = !p.is_tutor && !p.is_admin
  const toggle = (key, on, label) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t-textSub)', cursor: busy ? 'wait' : 'pointer' }}>
      <input type="checkbox" checked={on} disabled={!!busy} style={{ accentColor: 'var(--t-text)' }}
        onChange={e => run(key, () => savePersonSettings(p.id, { [key]: e.target.checked }), `${label} ${e.target.checked ? 'on' : 'off'}.`)} />
      {label}
    </label>
  )
  return (
    <Section title="Sign-in and settings">
      <div style={{ fontSize: 12.5, color: 'var(--t-textSub)', lineHeight: 1.6, marginBottom: 10 }}>
        {s.family ? "Signs in through their parent's account." : <>Signs in as <strong>{s.email}</strong>{s.emailConfirmedAt ? '' : ' (email not confirmed yet)'}.</>}
        {' '}{s.lastSignInAt ? `Last signed in ${fmtDate(s.lastSignInAt)}.` : 'Has never signed in.'}
      </div>
      {(person.emailBlocks || []).map(b => (
        <div key={b.email} role="note" style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 10, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--t-danger)', color: 'var(--t-textSub)' }}>
          <strong style={{ color: 'var(--t-danger)' }}>{b.email} gets no emails.</strong>{' '}
          {BLOCK_REASON[b.reason] || BLOCK_REASON.suppressed}
          {b.subject ? ` (“${b.subject}”, ${fmtDate(b.occurred_at)})` : ` (${fmtDate(b.occurred_at)})`}
          {b.detail && b.reason === 'bounced' ? `: ${b.detail}` : '.'}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            <Btn disabled={!!busy} onClick={async () => {
              if (!(await confirmDialog(`Email ${b.email} again? First check they want our emails, and remove the address from Resend's suppression list (Resend → Suppressions), or it still won't arrive.`, { confirm: 'Email them again' }))) return
              run(`unblock:${b.email}`, () => clearPersonEmailBlock(p.id, b.email), `${b.email} will get emails again.`)
            }}>{busy === `unblock:${b.email}` ? 'Clearing…' : 'Email them again'}</Btn>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Btn disabled={!!busy || s.family || !s.email} title={s.family ? 'Their parent changes this password from their own account' : ''}
          onClick={() => run('reset', () => sendPersonPasswordReset(p.id), r => `A password reset link went to ${r.sentTo}.`)}>
          {busy === 'reset' ? 'Sending…' : 'Email a password reset link'}
        </Btn>
        <Btn disabled={!!busy || isSelf} title={isSelf ? "Use your own Account page to sign yourself out" : ''} onClick={async () => {
          if (!(await confirmDialog('Sign them out on every device? They stay signed in for up to an hour on a device that\'s open now, then have to sign in again.', { confirm: 'Sign out everywhere' }))) return
          run('signout', () => signOutPerson(p.id), r => `Signed out of ${r.sessions} session${r.sessions === 1 ? '' : 's'}.`)
        }}>Sign out everywhere</Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toggle('reminders', !p.emails_unsubscribed_at, 'Email reminders')}
        {toggle('sounds', p.sounds_enabled !== false, 'Sound effects')}
        {isStudent && toggle('leaderboard', !p.hide_from_leaderboard, 'Shows on class leaderboards')}
      </div>
      <Msg msg={msg} />
    </Section>
  )
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export function PersonPlan({ person, reload, onChanged }) {
  const { busy, msg, run } = useAction(reload, onChanged)
  const wait = loadingOrError(person)
  if (wait) return <Section title="Plan">{wait}</Section>
  const p = person.profile
  if (p.is_tutor || p.is_admin) return null
  const { enabled, plan } = person.billing || {}
  const per = plan?.interval === 'month' ? 'month' : 'week'

  return (
    <Section title="Plan">
      {!plan ? (
        <Hint>No paid plan.{enabled ? '' : " Payments aren't set up."} Free and granted subjects are in Subject access.</Hint>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--t-textSub)', lineHeight: 1.6 }}>
            <strong>{per === 'month' ? 'Monthly' : 'Weekly'} plan</strong>
            {plan.total != null && <> · {money(plan.total)} a {per}</>}
            {' · '}{plan.subjects.length} subject{plan.subjects.length === 1 ? '' : 's'}: {plan.subjects.join(', ')}
            <br />
            {plan.endsAtPeriodEnd
              ? <span style={{ color: 'var(--t-danger)' }}>Cancelled: ends {fmtDate(plan.renewsAt)}.</span>
              : plan.trialing ? `Free trial until ${fmtDate(plan.renewsAt)}, then it bills.` : `Renews ${fmtDate(plan.renewsAt)}.`}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {plan.endsAtPeriodEnd ? (
              <Btn disabled={!!busy || !enabled} onClick={() => run('resume', () => changePersonBilling(p.id, 'resume'), 'The plan carries on.')}>Keep the plan going</Btn>
            ) : (
              <Btn disabled={!!busy || !enabled} onClick={async () => {
                if (!(await confirmDialog(`Cancel their plan at the end of this ${plan.trialing ? 'trial' : 'period'} (${fmtDate(plan.renewsAt)})? They keep their subjects until then and aren't charged again.`, { confirm: 'Cancel at period end', danger: true }))) return
                run('cancel', () => changePersonBilling(p.id, 'cancel_at_period_end'), `Cancelled. It ends ${fmtDate(plan.renewsAt)}.`)
              }}>Cancel at period end</Btn>
            )}
            <Btn variant="danger" disabled={!!busy || !enabled} onClick={async () => {
              if (!(await confirmDialog('End their plan now? Their paid subjects stop straight away. Stripe doesn\'t refund automatically: refund from the Stripe dashboard if you need to.', { confirm: 'End it now', danger: true }))) return
              run('now', () => changePersonBilling(p.id, 'cancel_now'), 'Plan ended.')
            }}>End now</Btn>
          </div>
        </>
      )}
      <Msg msg={msg} />
    </Section>
  )
}
