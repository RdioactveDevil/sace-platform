import { useState } from 'react'
import { THEMES } from '../lib/theme'
import { getLevelProgress, RANKS, RANK_ICONS, XP_LEVELS } from '../lib/engine'
import { updateProfile } from '../lib/db'
import { supabase } from '../lib/supabase'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function AccountScreen({ profile, theme, onSignOut, onChangeSubject }) {
  const t = THEMES[theme]
  const { level, pct, next } = getLevelProgress(profile.xp)
  const rank     = RANKS[Math.min(level, RANKS.length - 1)]
  const icon     = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]

  const [displayName, setDisplayName]   = useState(profile.display_name || '')
  const [savingName, setSavingName]     = useState(false)
  const [nameMsg, setNameMsg]           = useState('')

  const [newPw, setNewPw]               = useState('')
  const [savingPw, setSavingPw]         = useState(false)
  const [pwMsg, setPwMsg]               = useState('')

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
    border: `1px solid ${t.border}`, background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : t.bgPage,
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

  const levelBadges = RANKS.map((r, i) => ({
    rank: r, icon: RANK_ICONS[i],
    xpRequired: XP_LEVELS[i] || 0,
    unlocked: profile.xp >= (XP_LEVELS[i] || 0),
    current: i === Math.min(level, RANKS.length - 1),
  }))

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 32px 48px', fontFamily: FONT_B, color: t.text, maxWidth: 680 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: t.text }}>My Account</h1>
      <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 24 }}>Manage your profile and preferences.</p>

      {/* ── Profile card ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#080d28', flexShrink: 0 }}>
            {(profile.display_name || '?')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: t.text }}>{profile.display_name}</div>
            <div style={{ fontSize: 12, color: GOLD, fontWeight: 600, marginTop: 2 }}>{icon} {rank} · Level {level}</div>
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
              <div style={{ fontSize: 18, marginBottom: 4 }}>{b.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: b.current ? GOLD : t.text }}>{b.rank}</div>
              <div style={{ fontSize: 10, color: t.textFaint, marginTop: 2 }}>{b.xpRequired} XP</div>
              {b.current && <div style={{ fontSize: 9, color: GOLD, fontWeight: 700, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Current</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={onChangeSubject} style={btn('secondary')}>⇄ Change Subject</button>
        <button onClick={onSignOut} style={btn('danger')}>Sign Out</button>
      </div>
    </div>
  )
}
