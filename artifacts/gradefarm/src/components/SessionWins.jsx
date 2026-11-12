import { CircleCheck, Flame, Snowflake, Trophy, TrendingUp } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { getLevelProgress, rankAccuracy, RANKS, RANK_TIERS, nextRankHint } from '../lib/engine'
import { answersToday, dailyGoal, longestRun, MAX_FREEZES } from '../lib/engagement'
import { currentStreak } from '../lib/streak'
import RankIcon from './RankIcon'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

/**
 * Per topic: how this session went against the student's record before it
 * (their review history as the session started). Topics with at least 3
 * answers this session and 5 before; improved ones first.
 */
export function topicGains(results, questions, startStruggle) {
  const idsByTopic = new Map()
  for (const q of questions || []) {
    const key = q.subtopic || q.topic
    if (!key) continue
    if (!idsByTopic.has(key)) idsByTopic.set(key, [])
    idsByTopic.get(key).push(q.id)
  }
  const session = new Map()
  for (const r of results || []) {
    if (r.remediation) continue
    const key = r.subtopic || r.topic
    if (!key) continue
    const s = session.get(key) || { right: 0, total: 0 }
    s.total++
    if (r.correct) s.right++
    session.set(key, s)
  }
  const out = []
  for (const [topic, s] of session) {
    if (s.total < 3) continue
    let attempts = 0
    let wrong = 0
    for (const id of idsByTopic.get(topic) || []) {
      const st = startStruggle?.[id]
      if (!st) continue
      attempts += st.attempts || 0
      wrong += st.wrong || 0
    }
    const now = Math.round((s.right / s.total) * 100)
    const before = attempts >= 5 ? Math.round(((attempts - wrong) / attempts) * 100) : null
    out.push({ topic, before, now, total: s.total })
  }
  return out.sort((a, b) => ((b.before == null ? -1 : b.now - b.before) - (a.before == null ? -1 : a.now - a.before)) || b.now - a.now)
}

/** Questions answered right this session that the student had got wrong before. */
export function fixedCount(results, startStruggle) {
  const ids = new Set()
  for (const r of results || []) {
    if (!r.remediation && r.correct && (startStruggle?.[r.id]?.wrong || 0) > 0) ids.add(r.id)
  }
  return ids.size
}

/**
 * The summary's wins: progress to the next rank (this session's share shown
 * in gold), what improved, the daily goal, the streak (and freezes earned)
 * and any new personal best.
 */
export default function SessionWins({ theme = 'dark', profile, startProfile, startStruggle, results, questions, freezesEarned = 0 }) {
  const t = THEMES[theme]
  const acc = rankAccuracy(profile)
  const prog = getLevelProgress(profile.xp, acc)
  const startXP = Math.max(0, Number(startProfile?.xp) || 0)
  const xp = Math.max(0, Number(profile.xp) || 0)
  const span = Math.max(1, prog.next - prog.current)
  const startPct = prog.maxed ? 100 : Math.min(100, Math.max(0, ((startXP - prog.current) / span) * 100))
  const nowPct = prog.maxed ? 100 : prog.pct
  const xpLeft = Math.max(0, prog.next - xp)
  const nextName = RANKS[prog.level + 1]
  const nextNeedsXPOnly = !prog.maxed && prog.needsAccuracy == null && acc >= (RANK_TIERS[prog.level + 1]?.accuracy || 0)

  const gains = topicGains(results, questions, startStruggle)
  const improved = gains.filter(g => g.before != null && g.now > g.before).slice(0, 3)
  const fixed = fixedCount(results, startStruggle)

  const goal = dailyGoal(profile)
  const today = answersToday(profile)
  const streak = currentStreak(profile.streak, profile.last_active, new Date(), profile.streak_freezes)
  const freezes = Number(profile.streak_freezes) || 0

  const run = longestRun(results)
  const bestRunBefore = Number(startProfile?.best_answer_run) || 0
  const bestDayBefore = Number(startProfile?.best_day_answers) || 0
  const best = run >= 3 && run > bestRunBefore
    ? { title: `${run} right in a row`, note: bestRunBefore ? `Previous best ${bestRunBefore}` : 'Your first record' }
    : today >= 10 && today > bestDayBefore && bestDayBefore > 0
      ? { title: `${today} questions in a day`, note: `Previous best ${bestDayBefore}` }
      : null

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 18 }
  const bar = (pct, color) => ({ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 999, background: color })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONT_B }}>
      <section aria-label="Rank progress" style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: t.text }}>
            <RankIcon level={prog.level} size={18} color={t.goldText} />
            {RANKS[prog.level]}{!prog.maxed && <><span style={{ color: t.textMuted, fontWeight: 500 }}>→</span><span style={{ color: t.goldText }}>{nextName}</span></>}
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: t.goldText }}>
            {prog.maxed
              ? 'Top rank'
              : nextNeedsXPOnly
                ? `${xpLeft.toLocaleString('en-AU')} XP to go. About ${Math.max(1, Math.ceil(xpLeft / 36))} right answers at level 3.`
                : nextRankHint(xp, acc)}
          </span>
        </div>
        <div aria-hidden="true" style={{ position: 'relative', height: 12, borderRadius: 999, background: t.bgHover, overflow: 'hidden' }}>
          <div style={bar(nowPct, t.accent)} />
          <div style={bar(Math.min(startPct, nowPct), t.textFaint)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: t.textMuted }}>
          <span>{prog.current.toLocaleString('en-AU')}</span>
          {xp > startXP && nowPct > startPct && <span>The gold part is this session</span>}
          <span>{prog.next.toLocaleString('en-AU')}</span>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: t.text }}>
            <TrendingUp size={17} color={t.success} aria-hidden="true" /> What improved
          </div>
          {improved.length > 0 ? improved.map(g => (
            <div key={g.topic} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5 }}>
                <span style={{ color: t.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.topic}>{g.topic}</span>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}><span style={{ color: t.textMuted }}>{g.before}%</span> → <span style={{ color: t.success }}>{g.now}%</span></span>
              </div>
              <div aria-hidden="true" style={{ position: 'relative', height: 6, borderRadius: 999, background: t.bgHover, overflow: 'hidden' }}>
                <div style={bar(g.now, t.success)} />
                <div style={{ ...bar(g.before, t.bgCard), opacity: 0.5 }} />
              </div>
            </div>
          )) : (
            <p style={{ margin: 0, fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              {gains.length ? `Strongest this session: ${gains.slice().sort((a, b) => b.now - a.now)[0].topic} (${gains.slice().sort((a, b) => b.now - a.now)[0].now}%).` : 'Answer 3 or more in a topic to see how it compares with before.'}
            </p>
          )}
          {fixed > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: t.successBg, fontSize: 13, color: t.text, lineHeight: 1.5 }}>
              <CircleCheck size={16} color={t.success} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              You fixed {fixed} question{fixed === 1 ? '' : 's'} you'd got wrong before.
            </div>
          )}
          {improved.length > 0 && <span style={{ fontSize: 12, color: t.textMuted }}>This session against your record on each topic before it.</span>}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
            <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r="21" fill="none" stroke={t.bgHover} strokeWidth="7" />
              <circle cx="26" cy="26" r="21" fill="none" stroke={t.success} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${Math.min(1, today / goal) * 131.9} 131.9`} transform="rotate(-90 26 26)" />
            </svg>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>{today >= goal ? 'Daily goal closed' : 'Daily goal'}</div>
              <div style={{ fontSize: 13, color: t.textSub }}>{today >= goal ? `${today} of ${goal} questions today` : `${goal - today} more to close today's ring`}</div>
            </div>
          </section>

          <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: t.text }}>
              <Flame size={18} color={t.goldText} aria-hidden="true" /> {streak}-day streak
            </div>
            {freezesEarned > 0 ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: t.blueBg }}>
                <Snowflake size={18} color={t.blue} aria-hidden="true" />
                <div style={{ fontSize: 13, color: t.text, lineHeight: 1.45 }}>
                  <strong style={{ color: t.blue }}>Streak freeze earned{freezesEarned > 1 ? ` ×${freezesEarned}` : ''}</strong><br />
                  For 10 right in a row. You hold {freezes} of {MAX_FREEZES}.
                </div>
              </div>
            ) : (
              <span style={{ fontSize: 13, color: t.textMuted }}>{freezes > 0 ? `${freezes} streak freeze${freezes === 1 ? '' : 's'} held: a missed day won't break it.` : 'Get 10 right in a row to earn a streak freeze.'}</span>
            )}
          </section>

          {best && (
            <section style={{ ...card, borderColor: t.borderAccent, display: 'flex', gap: 12, alignItems: 'center' }}>
              <Trophy size={24} color={t.goldText} aria-hidden="true" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.goldText }}>New personal best</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>{best.title}</div>
                <div style={{ fontSize: 12.5, color: t.textMuted }}>{best.note}</div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
