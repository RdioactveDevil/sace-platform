import { useEffect, useState } from 'react'
import { THEMES } from '../lib/theme'
import { needsParentConsent } from '../lib/parentConsent'
import { leagueName, LEAGUE_PROMOTE, LEAGUE_TIERS, timeLeft } from '../lib/engagement'
import { fetchMyLeague } from '../lib/db'
import { SkeletonRow } from './Skeleton'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

/**
 * This week's league: the student's group of about 20 at a similar level,
 * ranked by XP earned this week. The top LEAGUE_PROMOTE (with some XP) move
 * up a league next week; nobody moves down.
 */
export default function LeagueView({ theme = 'dark', profile }) {
  const t = THEMES[theme]
  const [rows, setRows] = useState(undefined)
  const young = needsParentConsent(profile.dob, profile.year_level)

  useEffect(() => {
    if (young || profile.hide_from_leaderboard) return undefined
    let cancelled = false
    fetchMyLeague().then(r => { if (!cancelled) setRows(r) })
    return () => { cancelled = true }
  }, [young, profile.hide_from_leaderboard, profile.xp])

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12 }
  const me = Array.isArray(rows) ? rows.find(r => r.is_me) : null
  const tier = me ? me.tier : profile.league_tier || 0
  const note = (text) => <div style={{ ...card, padding: '24px 20px', textAlign: 'center', fontSize: 13.5, color: t.textMuted, lineHeight: 1.6 }}>{text}</div>

  let body
  if (young) body = note('Leagues are for students 15 and over: they show your first name to students you don\'t know. Your class leaderboard is still there.')
  else if (profile.hide_from_leaderboard) body = note("You're hidden from leaderboards, so you're not in a league. Turn it off in Account → Preferences to join next time you answer.")
  else if (rows === undefined) body = <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} theme={theme} />)}</div>
  else if (rows === null) body = note("Leagues aren't available just now.")
  else if (!me) body = note(`Answer a question to join this week's ${leagueName(tier)} league. You'll be grouped with about 20 students at a similar level.`)
  else {
    body = (
      <div style={{ ...card, padding: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px 6px', fontSize: 11.5, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          <span>Student</span><span>XP this week</span>
        </div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {rows.map(r => (
            <li key={r.position} aria-current={r.is_me ? 'true' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44, padding: '0 10px', borderRadius: 9, background: r.is_me ? t.accentGlow : t.bgSubtle, border: `1px solid ${r.is_me ? t.borderAccent : 'transparent'}` }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span style={{ width: 22, textAlign: 'right', fontWeight: 800, color: r.position <= LEAGUE_PROMOTE && r.weekly_xp > 0 ? t.success : t.textMuted }}>{r.position}</span>
                  <span style={{ fontSize: 14, fontWeight: r.is_me ? 800 : 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.is_me ? 'You' : r.name}</span>
                </span>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: r.is_me ? t.goldText : t.textSub }}>{r.weekly_xp.toLocaleString('en-AU')}</span>
              </div>
              {r.position === LEAGUE_PROMOTE && rows.length > LEAGUE_PROMOTE && tier < LEAGUE_TIERS.length - 1 && (
                <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 10px' }}>
                  <span style={{ flex: 1, borderTop: `2px dashed ${t.success}` }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: t.success }}>Top {LEAGUE_PROMOTE} move up to {leagueName(tier + 1)}</span>
                  <span style={{ flex: 1, borderTop: `2px dashed ${t.success}` }} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', fontFamily: FONT_B }}>
      <div style={{ flex: '999 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: t.text }}>{leagueName(tier)} league</h2>
          {me && <span style={{ fontSize: 13, color: t.textMuted }}>Ends in <strong style={{ color: t.text, fontFamily: MONO }}>{timeLeft(me.ends_at)}</strong></span>}
        </div>
        {body}
      </div>
      <aside style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <section style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: t.text }}>Leagues</h3>
          {[...LEAGUE_TIERS].map((l, i) => ({ ...l, i })).reverse().map(l => (
            <div key={l.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 34, padding: '0 10px', borderRadius: 8, background: l.i === tier ? t.bgHover : 'transparent' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13.5, fontWeight: 700, color: t.text }}>
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: l.color, transform: 'rotate(45deg)' }} />{l.name}
              </span>
              <span style={{ fontSize: 12, color: t.textMuted }}>{l.i === tier ? 'You are here' : l.i === tier + 1 ? 'Next' : ''}</span>
            </div>
          ))}
        </section>
        <section style={{ ...card, padding: 14 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 800, color: t.text }}>How it works</h3>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: t.textSub }}>
            Each week (Monday to Sunday) you're grouped with about 20 students at a similar level. XP from your answers counts, bonus questions count double, and break games count for nothing. The top {LEAGUE_PROMOTE} move up a league. Nobody drops down.
          </p>
        </section>
      </aside>
    </div>
  )
}
