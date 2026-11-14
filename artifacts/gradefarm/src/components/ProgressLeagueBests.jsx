import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { THEMES } from '../lib/theme'
import { needsParentConsent } from '../lib/parentConsent'
import { leagueName, LEAGUE_PROMOTE, LEAGUE_TIERS, timeLeft } from '../lib/engagement'
import { fetchBestWeekXP, fetchMyLeague } from '../lib/db'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

/**
 * Progress's league and personal bests row: this week's league (the student
 * and the places either side, with a link to the whole league) and four
 * personal bests as number tiles.
 */
export default function ProgressLeagueBests({ theme = 'dark', profile }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  const [league, setLeague] = useState(undefined) // undefined loading, null unavailable
  const [bestWeek, setBestWeek] = useState(0)
  const young = needsParentConsent(profile.dob, profile.year_level)

  useEffect(() => {
    let cancelled = false
    fetchMyLeague().then(rows => { if (!cancelled) setLeague(rows) })
    fetchBestWeekXP(profile.id).then(v => { if (!cancelled) setBestWeek(v) })
    return () => { cancelled = true }
  }, [profile.id, profile.xp])

  const me = Array.isArray(league) ? league.find(r => r.is_me) : null
  const around = me ? league.filter(r => Math.abs(r.position - me.position) <= 1) : []
  const tier = me ? me.tier : profile.league_tier || 0
  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }
  const title = { fontSize: 14, fontWeight: 800, color: t.text }
  const note = { fontSize: 13, color: t.textMuted, lineHeight: 1.55, margin: 0 }
  const linkBtn = { alignSelf: 'flex-start', border: 'none', background: 'none', padding: 0, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, color: t.text, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: t.accent, textDecorationThickness: 2, textUnderlineOffset: 3 }
  const bests = [
    [profile.best_answer_run || 0, 'right in a row'],
    [profile.best_day_answers || 0, 'questions in a day'],
    [profile.best_streak ? `${profile.best_streak} day${profile.best_streak === 1 ? '' : 's'}` : 0, 'longest streak'],
    [bestWeek ? bestWeek.toLocaleString('en-AU') : 0, 'XP in a week'],
  ]

  return (
    <div className="po-row" style={{ fontFamily: FONT_B }}>
      <section aria-label="Weekly league" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ ...title, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: LEAGUE_TIERS[tier]?.color, transform: 'rotate(45deg)' }} />
            {leagueName(tier)} league
          </span>
          {me && <span style={{ fontSize: 12.5, color: t.textMuted }}>Ends in <strong style={{ color: t.text, fontFamily: MONO }}>{timeLeft(me.ends_at)}</strong></span>}
        </div>
        {young ? (
          <p style={note}>Leagues are for students 15 and over. Your class leaderboard is still there.</p>
        ) : profile.hide_from_leaderboard ? (
          <p style={note}>You're hidden from leaderboards, so you're not in a league. Turn it off in Account → Preferences to join.</p>
        ) : league === undefined ? (
          <p style={note}>Loading…</p>
        ) : !me ? (
          <p style={note}>Answer a question to join this week's league. You'll be grouped with about 20 students at your level, and the top {LEAGUE_PROMOTE} move up.</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {around.map(r => (
                <div key={r.position} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderRadius: 8, fontSize: 13.5, background: r.is_me ? t.accentGlow : t.bgHover, border: `1px solid ${r.is_me ? t.borderAccent : 'transparent'}`, fontWeight: r.is_me ? 800 : 600, color: t.text }}>
                  <span><span style={{ color: r.position <= LEAGUE_PROMOTE && r.weekly_xp > 0 ? t.success : t.textMuted, fontWeight: 800 }}>{r.position}</span>&nbsp;&nbsp;{r.is_me ? 'You' : r.name}</span>
                  <span style={{ fontFamily: MONO, color: r.is_me ? t.goldText : t.textSub }}>{r.weekly_xp.toLocaleString('en-AU')}</span>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => navigate('/leaderboard?view=league')} style={linkBtn}>
              Top {LEAGUE_PROMOTE} move up{tier < LEAGUE_TIERS.length - 1 ? ` to ${leagueName(tier + 1)}` : ''}. See the whole league
            </button>
          </>
        )}
      </section>

      <section aria-label="Personal bests" style={card}>
        <span style={title}>Personal bests</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {bests.map(([value, label]) => (
            <div key={label} style={{ background: t.bgHover, borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: value ? t.text : t.textMuted, fontVariantNumeric: 'tabular-nums' }}>{value || '—'}</div>
              <div style={{ fontSize: 12.5, color: t.textMuted }}>{label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
