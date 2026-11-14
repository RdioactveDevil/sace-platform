import { useEffect, useMemo, useRef, useState } from 'react'
import { Flame } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { currentStreak, freezesNeeded, localDate } from '../lib/streak'
import {
  answersToday, dailyGoal, DAILY_GOAL_OPTIONS, daysUntil, gradeAbove, MAX_FREEZES, FREEZE_EVERY,
  predictGrade, PREDICT_MIN_ANSWERS, streakWeek,
} from '../lib/engagement'
import { fetchRecentAnswers, setDailyGoal } from '../lib/db'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

/**
 * Practice's "today" strip: one slim card with the daily goal ring, the day
 * streak (this week's days and freezes held) and, when the subject has an exam
 * date, the countdown and predicted grade. The weekly league and personal
 * bests live on Progress (ProgressLeagueBests).
 */
export default function HomeEngagement({ theme = 'dark', profile, subject, questions, onProfileUpdated }) {
  const t = THEMES[theme]
  const [answers, setAnswers] = useState(null)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalError, setGoalError] = useState('')
  const examDate = subject?.features?.exam_date || null
  const daysToExam = daysUntil(examDate)
  const showExam = daysToExam != null && daysToExam >= 0

  useEffect(() => {
    if (!showExam) return undefined
    let cancelled = false
    fetchRecentAnswers(profile.id).then(rows => { if (!cancelled) setAnswers(rows) })
    return () => { cancelled = true }
  }, [profile.id, showExam, profile.day_answers])

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
  const todayDate = localDate(new Date())
  const pendingFreeze = streak > 0 ? freezesNeeded(profile.last_active) : 0
  const frac = Math.min(1, today / goal)

  const changeGoal = async (g) => {
    setEditingGoal(false)
    setGoalError('')
    if (!g || g === goal) return
    const prev = profile.daily_goal
    onProfileUpdated?.({ daily_goal: g })
    try { await setDailyGoal(profile.id, g) } catch (e) {
      onProfileUpdated?.({ daily_goal: prev })
      setGoalError(e?.message || "Couldn't save your goal.")
    }
  }

  const segment = { flex: '1 1 200px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }
  const divider = { borderLeft: `1px solid ${t.border}` }
  const sub = { fontSize: 12.5, color: t.textMuted, lineHeight: 1.45 }
  const linkBtn = { border: 'none', background: 'none', padding: 0, fontFamily: FONT_B, fontSize: 12.5, color: t.textMuted, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }
  const dot = (state) => ({
    width: 14, height: 14, borderRadius: 999, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
    ...(state === 'done' ? { background: t.accent }
      : state === 'freeze' ? { background: t.blueBg, border: `1.5px solid ${t.blue}` }
        : state === 'today' ? { border: `1.5px dashed ${t.accent}` }
          : { border: `1.5px solid ${t.borderStrong}` }),
  })
  const dotName = { done: 'answered', freeze: 'covered by a freeze', today: 'today, not yet', missed: 'missed', future: 'to come' }
  const streakNote = pendingFreeze > 0
    ? `${pendingFreeze === 1 ? 'A freeze covers yesterday' : `Freezes cover the ${pendingFreeze} days missed`} when you answer today`
    : freezes > 0 ? `${freezes} of ${MAX_FREEZES} freezes held` : `${FREEZE_EVERY} right in a row earns a freeze`

  return (
    <section aria-label="Today" className="he-today" style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 14, fontFamily: FONT_B, color: t.text }}>
      {/* Stacked on a phone, the dividers run across instead of down the left edge. */}
      <style>{`@media (max-width: 600px) { .he-today .he-divided { border-left: none !important; border-top: 1px solid ${t.border}; } }`}</style>
      {/* Daily goal */}
      <div style={segment}>
        <GoalRing frac={frac} closed={today >= goal} label={`${today} of ${goal} questions today`} t={t} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: today >= goal ? t.success : t.text }}>{Math.min(today, 999)} of {goal} today</span>
          {editingGoal ? (
            <label style={{ ...sub, display: 'flex', alignItems: 'center', gap: 6 }}>
              Daily goal
              <select autoFocus defaultValue={DAILY_GOAL_OPTIONS.includes(goal) ? goal : ''} onChange={e => changeGoal(Number(e.target.value))} onBlur={() => setEditingGoal(false)}
                style={{ fontFamily: FONT_B, fontSize: 12.5, padding: '2px 6px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.bgInput, color: t.text }}>
                {!DAILY_GOAL_OPTIONS.includes(goal) && <option value="">{goal}</option>}
                {DAILY_GOAL_OPTIONS.map(g => <option key={g} value={g}>{g} a day</option>)}
              </select>
            </label>
          ) : (
            <span style={sub}>
              {today >= goal ? 'Ring closed for today' : `${goal - today} more to close the ring`}
              {' · '}
              <button type="button" onClick={() => setEditingGoal(true)} style={linkBtn} aria-label={`Change daily goal (now ${goal} a day)`}>Change</button>
            </span>
          )}
          {goalError && <span role="alert" style={{ fontSize: 12, color: t.danger }}>{goalError}</span>}
        </div>
      </div>

      {/* Streak */}
      <div className="he-divided" style={{ ...segment, ...divider }}>
        <Flame size={22} color={t.goldText} aria-hidden="true" style={{ flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{streak}-day streak</span>
          <ol aria-label="This week" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: 4 }}>
            {week.map(d => (
              <li key={d.date} aria-label={`${d.date}: ${dotName[d.state]}`} title={`${d.label}: ${dotName[d.state]}`} style={dot(d.state)}
                className={d.state === 'done' && d.date === todayDate ? 'gf-pop' : undefined}>
                {d.state === 'done' && (
                  <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2.5 6.4 5 8.8 9.6 3.6" pathLength="1" fill="none" stroke="#171724" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={d.date === todayDate ? 'gf-tick-draw' : undefined} />
                  </svg>
                )}
              </li>
            ))}
          </ol>
          <span style={{ ...sub, fontSize: 12, color: pendingFreeze > 0 || freezes > 0 ? t.blue : t.textMuted }}>{streakNote}</span>
        </div>
      </div>

      {/* Exam countdown and predicted grade (subjects with an exam date) */}
      {showExam && (
        <div className="he-divided" style={{ ...segment, ...divider }}>
          <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, flexShrink: 0 }}>{daysToExam}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{daysToExam === 0 ? 'Exam today. Good luck!' : `day${daysToExam === 1 ? '' : 's'} to the exam`}</span>
            <span style={sub} title="A rough estimate from your recent answers in this subject, not an official SACE grade.">
              {prediction === undefined
                ? 'Working out your predicted grade…'
                : prediction.result
                  ? <>
                      Predicted{' '}
                      {prediction.result.previous && prediction.result.previous !== prediction.result.grade && <>{prediction.result.previous} → </>}
                      <strong style={{ color: prediction.result.previous && gradeAbove(prediction.result.grade, prediction.result.previous) ? t.success : t.text }}>{prediction.result.grade}</strong>
                      {prediction.result.weakest && <> · weakest: {prediction.result.weakest.topic}</>}
                    </>
                  : `Answer ${Math.max(1, PREDICT_MIN_ANSWERS - prediction.count)} more for a predicted grade`}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * The daily goal ring. It fills as questions are answered and, once the goal
 * is met, closes into a solid circle with a tick drawn in. The tick only
 * animates when the goal is met while the ring is on screen; on a later visit
 * it's already there.
 */
function GoalRing({ frac, closed, label, t }) {
  const C = 106.8 // circumference at r = 17
  const [justClosed, setJustClosed] = useState(false)
  const wasClosed = useRef(closed)
  useEffect(() => {
    if (closed && !wasClosed.current) setJustClosed(true)
    wasClosed.current = closed
  }, [closed])
  const ease = 'cubic-bezier(0.3, 0.8, 0.3, 1)'
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" role="img" aria-label={closed ? `${label}, goal met` : label} style={{ flexShrink: 0, overflow: 'visible' }}>
      <circle cx="22" cy="22" r="17" fill="none" stroke={t.bgHover} strokeWidth="6" />
      <circle cx="22" cy="22" r="17" fill="none" stroke={t.success} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${Math.min(1, frac) * C} ${C}`} transform="rotate(-90 22 22)"
        style={{ transition: `stroke-dasharray 0.6s ${ease}` }} />
      {closed && (
        <g key={justClosed ? 'anim' : 'still'} className={justClosed ? 'gf-pop' : undefined}>
          <circle cx="22" cy="22" r="20" fill={t.success} />
          <path d="M14.5 22.5 19.5 27.5 29.5 16.5" pathLength="1" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"
            className={justClosed ? 'gf-tick-draw' : undefined} />
        </g>
      )}
    </svg>
  )
}
