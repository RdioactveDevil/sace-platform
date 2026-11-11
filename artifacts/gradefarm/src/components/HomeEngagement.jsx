import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, Snowflake, Trophy } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { currentStreak, freezesNeeded } from '../lib/streak'
import { needsParentConsent } from '../lib/parentConsent'
import {
  answersToday, dailyGoal, DAILY_GOAL_OPTIONS, daysUntil, gradeAbove, leagueName, LEAGUE_PROMOTE, LEAGUE_TIERS,
  MAX_FREEZES, FREEZE_EVERY, predictGrade, PREDICT_MIN_ANSWERS, streakWeek, timeLeft,
} from '../lib/engagement'
import { fetchBestWeekXP, fetchMyLeague, fetchRecentAnswers, setDailyGoal } from '../lib/db'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

/**
 * Home's progress cards: the daily goal ring, the streak (with freezes and
 * this week's days), the subject's exam countdown and predicted grade (when
 * the subject has an exam date), this week's league and personal bests.
 */
export default function HomeEngagement({ theme = 'dark', profile, subject, questions, onProfileUpdated }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  const [league, setLeague] = useState(undefined) // undefined loading, null unavailable
  const [bestWeek, setBestWeek] = useState(0)
  const [answers, setAnswers] = useState(null)
  const [goalError, setGoalError] = useState('')
  const examDate = subject?.features?.exam_date || null
  const daysToExam = daysUntil(examDate)
  const young = needsParentConsent(profile.dob, profile.year_level)

  useEffect(() => {
    let cancelled = false
    fetchMyLeague().then(rows => { if (!cancelled) setLeague(rows) })
    fetchBestWeekXP(profile.id).then(v => { if (!cancelled) setBestWeek(v) })
    return () => { cancelled = true }
  }, [profile.id, profile.xp])

  useEffect(() => {
    if (daysToExam == null || daysToExam < 0) return undefined
    let cancelled = false
    fetchRecentAnswers(profile.id).then(rows => { if (!cancelled) setAnswers(rows) })
    return () => { cancelled = true }
  }, [profile.id, daysToExam, profile.day_answers])

  const prediction = useMemo(() => {
    if (!answers) return undefined
    const byId = new Map((questions || []).map(q => [q.id, q]))
    const rows = answers.filter(a => byId.has(a.question_id)).map(a => {
      const q = byId.get(a.question_id)
      return { correct: !!a.correct, answered_at: a.answered_at, difficulty: q.difficulty, topic: q.subtopic || q.topic }
    })
    return { result: predictGrade(rows), count: rows.length }
  }, [answers, questions])

  const goal = dailyGoal(profile)
  const today = answersToday(profile)
  const streak = currentStreak(profile.streak, profile.last_active, new Date(), profile.streak_freezes)
  const freezes = Number(profile.streak_freezes) || 0
  const week = streakWeek({ ...profile, streak }, new Date())
  const pendingFreeze = streak > 0 ? freezesNeeded(profile.last_active) : 0

  const changeGoal = async (g) => {
    setGoalError('')
    const prev = profile.daily_goal
    onProfileUpdated?.({ daily_goal: g })
    try { await setDailyGoal(profile.id, g) } catch (e) {
      onProfileUpdated?.({ daily_goal: prev })
      setGoalError(e?.message || "Couldn't save your goal.")
    }
  }

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }
  const label = { fontSize: 11.5, fontWeight: 800, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }
  const frac = Math.min(1, today / goal)
  const dotStyle = (state) => {
    if (state === 'done') return { background: t.accent, border: `2px solid ${t.accent}` }
    if (state === 'freeze') return { background: t.blueBg, border: `2px solid ${t.blue}` }
    if (state === 'today') return { background: 'transparent', border: `2px dashed ${t.accent}` }
    return { background: 'transparent', border: `2px solid ${t.border}` }
  }
  const dotName = { done: 'answered', freeze: 'covered by a freeze', today: 'today, not yet', missed: 'missed', future: 'to come' }

  // League: three rows around the student.
  const me = Array.isArray(league) ? league.find(r => r.is_me) : null
  const around = me ? league.filter(r => Math.abs(r.position - me.position) <= 1) : []
  const tier = me ? me.tier : profile.league_tier || 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 14, fontFamily: FONT_B, color: t.text }}>
      {/* Daily goal */}
      <section aria-label="Daily goal" style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`${today} of ${goal} questions today`} style={{ flexShrink: 0 }}>
          <circle cx="38" cy="38" r="30" fill="none" stroke={t.bgHover} strokeWidth="10" />
          <circle cx="38" cy="38" r="30" fill="none" stroke={t.success} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${frac * 188.5} 188.5`} transform="rotate(-90 38 38)" />
          <text x="38" y="43" textAnchor="middle" fontFamily={FONT_B} fontSize="15" fontWeight="800" fill={t.text}>{Math.min(today, 999)}/{goal}</text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={label}>Daily goal</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: today >= goal ? t.success : t.text }}>
            {today >= goal ? 'Ring closed for today' : `${goal - today} more to close today's ring`}
          </span>
          <label style={{ fontSize: 12.5, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
            Goal
            <select value={DAILY_GOAL_OPTIONS.includes(goal) ? goal : ''} onChange={e => changeGoal(Number(e.target.value))}
              style={{ fontFamily: FONT_B, fontSize: 12.5, padding: '3px 6px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.bgInput, color: t.text }}>
              {!DAILY_GOAL_OPTIONS.includes(goal) && <option value="">{goal}</option>}
              {DAILY_GOAL_OPTIONS.map(g => <option key={g} value={g}>{g} a day</option>)}
            </select>
          </label>
          {goalError && <span role="alert" style={{ fontSize: 12, color: t.danger }}>{goalError}</span>}
        </div>
      </section>

      {/* Streak */}
      <section aria-label="Streak" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 18, fontWeight: 800, color: t.text }}>
            <Flame size={20} color={t.goldText} aria-hidden="true" /> {streak} day{streak === 1 ? '' : 's'}
          </span>
          <span title={`Earn one for every ${FREEZE_EVERY} right in a row. Hold up to ${MAX_FREEZES}.`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: t.blueBg, color: t.blue, fontSize: 12, fontWeight: 700 }}>
            <Snowflake size={13} aria-hidden="true" /> {freezes} freeze{freezes === 1 ? '' : 's'}
          </span>
        </div>
        <ol aria-label="This week" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
          {week.map(d => (
            <li key={d.date} aria-label={`${d.date}: ${dotName[d.state]}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 999, boxSizing: 'border-box', ...dotStyle(d.state) }} />
              <span aria-hidden="true" style={{ fontSize: 11, color: t.textMuted, fontWeight: 600 }}>{d.label}</span>
            </li>
          ))}
        </ol>
        <span style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5 }}>
          {pendingFreeze > 0
            ? `You missed ${pendingFreeze === 1 ? 'a day' : `${pendingFreeze} days`}. ${pendingFreeze === 1 ? 'A freeze covers it' : 'Freezes cover them'} when you answer today.`
            : week.some(d => d.state === 'freeze')
              ? 'A freeze kept your streak going on the blue day.'
              : `Get ${FREEZE_EVERY} right in a row to earn a streak freeze.`}
        </span>
      </section>

      {/* Exam countdown and predicted grade */}
      {daysToExam != null && daysToExam >= 0 && (
        <section aria-label="Exam countdown" style={card}>
          <span style={label}>{subject?.name ? `${subject.name} exam` : 'Final exam'}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: t.text, lineHeight: 1 }}>{daysToExam}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: t.textSub }}>{daysToExam === 0 ? 'Today. Good luck!' : `day${daysToExam === 1 ? '' : 's'} to go`}</span>
          </div>
          {prediction === undefined ? (
            <span style={{ fontSize: 12.5, color: t.textMuted }}>Working out your predicted grade…</span>
          ) : prediction.result ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: t.bgHover }}>
                <span style={{ fontSize: 13, color: t.textSub }}>Predicted grade</span>
                <span style={{ fontSize: 17, fontWeight: 800 }}>
                  {prediction.result.previous && prediction.result.previous !== prediction.result.grade && (
                    <><span style={{ color: t.textMuted }}>{prediction.result.previous}</span> → </>
                  )}
                  <span style={{ color: prediction.result.previous && gradeAbove(prediction.result.grade, prediction.result.previous) ? t.success : t.text }}>{prediction.result.grade}</span>
                </span>
              </div>
              <span style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5 }}>
                {prediction.result.weakest ? `Weakest area: ${prediction.result.weakest.topic} (${prediction.result.weakest.pct}%). ` : ''}
                A rough estimate from your last {Math.min(prediction.count, 150)} answers, not an official SACE grade.
              </span>
            </>
          ) : (
            <span style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5 }}>
              Answer {Math.max(1, PREDICT_MIN_ANSWERS - prediction.count)} more question{PREDICT_MIN_ANSWERS - prediction.count === 1 ? '' : 's'} in this subject to see a predicted grade.
            </span>
          )}
        </section>
      )}

      {/* League */}
      <section aria-label="Weekly league" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 800, color: t.text }}>
            <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 3, background: LEAGUE_TIERS[tier]?.color, transform: 'rotate(45deg)' }} />
            {leagueName(tier)} league
          </span>
          {me && <span style={{ fontSize: 12, color: t.textMuted }}>Ends in {timeLeft(me.ends_at)}</span>}
        </div>
        {young ? (
          <span style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5 }}>Leagues are for students 15 and over. Your class leaderboard is still there.</span>
        ) : profile.hide_from_leaderboard ? (
          <span style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5 }}>You're hidden from leaderboards, so you're not in a league. Turn it off in Account → Preferences to join.</span>
        ) : league === undefined ? (
          <span style={{ fontSize: 12.5, color: t.textMuted }}>Loading…</span>
        ) : !me ? (
          <span style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5 }}>Answer a question to join this week's league. You'll be grouped with about 20 students at your level.</span>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {around.map(r => (
                <div key={r.position} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 10px', borderRadius: 8, fontSize: 13, background: r.is_me ? t.accentGlow : t.bgHover, border: `1px solid ${r.is_me ? t.borderAccent : 'transparent'}`, fontWeight: r.is_me ? 800 : 600 }}>
                  <span><span style={{ color: r.position <= LEAGUE_PROMOTE ? t.success : t.textMuted, fontWeight: 800 }}>{r.position}</span>&nbsp;&nbsp;{r.is_me ? 'You' : r.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: r.is_me ? t.goldText : t.textSub }}>{r.weekly_xp.toLocaleString('en-AU')}</span>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => navigate('/leaderboard?view=league')}
              style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: 0, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, color: t.text, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: t.accent, textUnderlineOffset: 3 }}>
              Top {LEAGUE_PROMOTE} move up. See the whole league
            </button>
          </>
        )}
      </section>

      {/* Personal bests */}
      <section aria-label="Personal bests" style={card}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 800, color: t.text }}>
          <Trophy size={17} color={t.goldText} aria-hidden="true" /> Personal bests
        </span>
        {[
          ['Right in a row', profile.best_answer_run || 0],
          ['Questions in a day', profile.best_day_answers || 0],
          ['Longest streak', `${profile.best_streak || 0} day${profile.best_streak === 1 ? '' : 's'}`],
          ['XP in a week', bestWeek ? bestWeek.toLocaleString('en-AU') : '—'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, paddingBottom: 6, borderBottom: `1px solid ${t.border}` }}>
            <span style={{ color: t.textSub }}>{k}</span>
            <strong style={{ color: t.text }}>{v || '—'}</strong>
          </div>
        ))}
      </section>
    </div>
  )
}

