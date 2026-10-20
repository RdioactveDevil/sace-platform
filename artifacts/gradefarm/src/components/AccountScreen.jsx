import { useEffect, useState } from 'react'
import { THEMES } from '../lib/theme'
import { getLevelProgress, RANKS, XP_LEVELS } from '../lib/engine'
import { updateProfile, getSubscriptions, getBillingConfig, openBillingPortal, removePaidSubject } from '../lib/db'
import { formatSubjectLabel } from '../lib/subjects'
import { supabase } from '../lib/supabase'
import RankIcon from './RankIcon'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '')

/** What a subject's access row means for the student, in one line. */
function accessLine(sub, freeDaily) {
  if (sub.source === 'beta') return { text: 'Free — beta member', tone: 'success' }
  if (sub.source === 'free') return { text: `Free subject — ${freeDaily} questions a day`, tone: 'success' }
  if (sub.source !== 'stripe') return { text: 'Included by Titanium Tutoring', tone: 'success' }
  if (sub.status === 'past_due') return { text: 'Payment failed — update your card', tone: 'danger' }
  if (sub.cancel_at_period_end) return { text: `Ends ${shortDate(sub.current_period_end)}`, tone: 'muted' }
  return { text: 'In your plan', tone: 'muted' }
}

/** The student's subjects, their weekly plan, and the Stripe portal. */
function BillingCard({ profile, theme, card, btn, onChangeSubject }) {
  const t = THEMES[theme]
  const [subs, setSubs] = useState(null)
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(null) // 'portal' | row id
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
  const tiers = plan?.tiers ?? [5, 4, 3]
  const totalAfterRemoving = () => {
    const n = paid.length - 1
    return Array.from({ length: n }, (_, i) => tiers[Math.min(i, tiers.length - 1)]).reduce((a, b) => a + b, 0)
  }

  const openPortal = async () => {
    setBusy('portal'); setError('')
    try { window.location.assign(await openBillingPortal()) }
    catch (e) { setError(e.message || 'Could not open billing.'); setBusy(null) }
  }

  const remove = async (sub) => {
    const label = formatSubjectLabel({ name: sub.subject_name, stage: sub.stage })
    const msg = paid.length === 1
      ? `Remove ${label}? It's your only paid subject, so your plan ends on ${shortDate(sub.current_period_end)} and you keep access until then.`
      : `Remove ${label} now? Your plan drops to $${totalAfterRemoving()}/week and unused time is credited to your next bill.`
    if (!window.confirm(msg)) return
    setBusy(sub.id); setError('')
    try { await removePaidSubject(sub.id); await load() }
    catch (e) { setError(e.message || 'Could not update your plan.') }
    setBusy(null)
  }

  const toneColour = { success: t.success, danger: t.danger, muted: t.textMuted }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Subjects & billing</div>
        {plan?.hasPlan && (
          <span style={{ fontSize: 12.5, color: t.textMuted }}>
            <strong style={{ color: t.text }}>${plan.weeklyTotal}/week</strong>
            {plan.endsAtPeriodEnd ? ` · ends ${shortDate(plan.renewsAt)}` : plan.renewsAt ? ` · next bill ${shortDate(plan.renewsAt)}` : ''}
          </span>
        )}
      </div>
      {subs === null ? (
        <div style={{ fontSize: 13, color: t.textMuted }}>Loading…</div>
      ) : subs.length === 0 ? (
        <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 14 }}>You haven't picked a subject yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 14 }}>
          {subs.map((s, i) => {
            const line = accessLine(s, freeDaily)
            const removable = s.source === 'stripe' && !s.cancel_at_period_end
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? `1px solid ${t.border}` : 'none' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: t.text }}>{formatSubjectLabel({ name: s.subject_name, stage: s.stage })}</span>
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
        {paid.length > 0 && (
          <button type="button" onClick={openPortal} disabled={!!busy} style={btn('secondary', !!busy)}>
            {busy === 'portal' ? 'Opening…' : 'Card & receipts'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: t.textFaint, marginTop: 10, lineHeight: 1.5 }}>
        ${tiers[0]}/week for your first paid subject{tiers.length > 1 ? `, then $${tiers.slice(1).join(', then $')}/week for each extra one` : ''}.
      </div>
      {error && <div style={{ fontSize: 12, color: t.danger, marginTop: 8 }}>{error}</div>}
    </div>
  )
}

export default function AccountScreen({ profile, theme, onSignOut, onChangeSubject, onReplayFeatureTour }) {
  const t = THEMES[theme]
  const { level, pct, next } = getLevelProgress(profile.xp)
  const rank     = RANKS[Math.min(level, RANKS.length - 1)]

  const [displayName, setDisplayName]   = useState(profile.display_name || '')
  const [savingName, setSavingName]     = useState(false)
  const [nameMsg, setNameMsg]           = useState('')

  const [newPw, setNewPw]               = useState('')
  const [savingPw, setSavingPw]         = useState(false)
  const [pwMsg, setPwMsg]               = useState('')
  const [replayTourBusy, setReplayTourBusy] = useState(false)

  const card = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: 16,
    boxShadow: theme === 'light' ? '0 2px 12px rgba(12,16,55,0.07)' : '0 2px 12px rgba(0,0,0,0.25)',
    padding: '20px 24px',
    marginBottom: 16,
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
    border: `1px solid ${t.border}`, background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : t.bg,
    color: t.text, fontSize: 14, fontFamily: FONT_B, outline: 'none',
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

  const handleSaveName = async () => {
    const trimmed = displayName.trim()
    if (!trimmed || trimmed === profile.display_name) return
    setSavingName(true); setNameMsg('')
    try {
      await updateProfile(profile.id, { display_name: trimmed })
      setNameMsg('Saved!')
    } catch {
      setNameMsg('Failed to save.')
    } finally {
      setSavingName(false)
      setTimeout(() => setNameMsg(''), 3000)
    }
  }

  const handleChangePassword = async () => {
    if (newPw.length < 6) { setPwMsg('Password must be at least 6 characters.'); return }
    setSavingPw(true); setPwMsg('')
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) setPwMsg(error.message)
    else { setPwMsg('Password updated!'); setNewPw('') }
    setSavingPw(false)
    setTimeout(() => setPwMsg(''), 4000)
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

  const levelBadges = RANKS.map((r, i) => ({
    rank: r, level: i,
    xpRequired: XP_LEVELS[i] || 0,
    unlocked: profile.xp >= (XP_LEVELS[i] || 0),
    current: i === Math.min(level, RANKS.length - 1),
  }))

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 32px 48px', fontFamily: FONT_B, color: t.text, maxWidth: 680 }}>
      <style>{`@font-face{font-family:'Sifonn Pro';src:url('/SIFONN_PRO.otf') format('opentype');font-display:swap;}`}</style>
      <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Settings</div>
      <h1 style={{ fontSize: 22, fontFamily: FONT_D, fontWeight: 400, letterSpacing: 1.2, marginBottom: 6, color: t.text }}>My Account</h1>
      <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 24 }}>Manage your profile and preferences.</p>

      {/* Tutor application status — surfaced here now that the global RoleSwitcherBar has been removed. */}
      {profile.tutor_application_status === 'pending' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 16, borderRadius: 12, background: 'rgba(241,190,67,0.10)', border: '1px solid rgba(241,190,67,0.28)', color: t.text, fontSize: 13 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD, boxShadow: `0 0 8px ${GOLD}`, flexShrink: 0 }} />
          <span><strong style={{ color: GOLD, fontWeight: 700 }}>Tutor application pending</strong> — an admin will review your application shortly.</span>
        </div>
      )}

      {/* ── Profile card ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#080d28', flexShrink: 0 }}>
            {(profile.display_name || '?')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: t.text }}>{profile.display_name}</div>
            <div style={{ fontSize: 12, color: GOLD, fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><RankIcon level={level} size={13} /> {rank} · Level {level}</div>
          </div>
        </div>

        {/* XP bar */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: t.textMuted }}>Level {level}</span>
            <span style={{ fontSize: 11, color: t.textMuted }}>{profile.xp} / {next} XP</span>
          </div>
          <div style={{ background: t.border, borderRadius: 999, height: 6, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, borderRadius: 999, transition: 'width 0.8s' }} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 6 }}>
          {next - profile.xp} XP to {RANKS[Math.min(level + 1, RANKS.length - 1)]}
        </div>
      </div>

      {!profile.is_tutor && !profile.is_admin && (
        <BillingCard profile={profile} theme={theme} card={card} btn={btn} onChangeSubject={onChangeSubject} />
      )}

      {/* ── Display name ── */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 12 }}>Display Name</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveName()}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={handleSaveName}
            disabled={savingName || !displayName.trim() || displayName.trim() === profile.display_name}
            style={btn('primary', savingName || !displayName.trim() || displayName.trim() === profile.display_name)}
          >
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>
        {nameMsg && <div style={{ fontSize: 12, color: nameMsg === 'Saved!' ? t.success : t.danger, marginTop: 8 }}>{nameMsg}</div>}
      </div>

      {/* ── Password ── */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 12 }}>Change Password</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="password"
            placeholder="New password (min 6 chars)"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={handleChangePassword}
            disabled={savingPw || newPw.length < 6}
            style={btn('primary', savingPw || newPw.length < 6)}
          >
            {savingPw ? 'Saving…' : 'Update'}
          </button>
        </div>
        {pwMsg && <div style={{ fontSize: 12, color: pwMsg === 'Password updated!' ? t.success : t.danger, marginTop: 8 }}>{pwMsg}</div>}
      </div>

      {/* ── Rank progression ── */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Rank Progression</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {levelBadges.map(b => (
            <div key={b.rank} style={{
              padding: '10px 12px', borderRadius: 10, border: `1px solid ${b.current ? GOLD : b.unlocked ? t.success + '44' : t.border}`,
              background: b.current ? `${GOLD}12` : b.unlocked ? `${t.success}08` : 'transparent',
              opacity: b.unlocked ? 1 : 0.45,
            }}>
              <div style={{ marginBottom: 4, display: 'flex' }}><RankIcon level={b.level} size={18} color={b.unlocked ? GOLD : t.textMuted} /></div>
              <div style={{ fontSize: 12, fontWeight: 700, color: b.current ? GOLD : t.text }}>{b.rank}</div>
              <div style={{ fontSize: 10, color: t.textFaint, marginTop: 2 }}>{b.xpRequired} XP</div>
              {b.current && <div style={{ fontSize: 9, color: GOLD, fontWeight: 700, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Current</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature tour (replay from Settings) ── */}
      {typeof onReplayFeatureTour === 'function' && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 8 }}>Feature tour</div>
          <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 14, lineHeight: 1.55 }}>
            Replay the guided walkthrough of the sidebar — Question Bank, Learn, History, Study Plan, and more.
          </p>
          <button
            type="button"
            onClick={handleReplayFeatureTour}
            disabled={replayTourBusy}
            style={btn('secondary', replayTourBusy)}
          >
            {replayTourBusy ? 'Preparing…' : 'Replay feature tour'}
          </button>
        </div>
      )}

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={onChangeSubject} style={btn('secondary')}>⇄ Change Subject</button>
        <button onClick={onSignOut} style={btn('danger')}>Sign Out</button>
      </div>
    </div>
  )
}
