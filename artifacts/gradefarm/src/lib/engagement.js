// Engagement: daily goal, the streak's week strip, breaks with a mini game,
// rank-ups, personal bests, the predicted grade and leagues. Pure functions;
// the database side is migration 20261111000001_engagement.sql.
import { getLevel, rankAccuracy } from './engine.js'
import { addDays, localDate } from './streak.js'

// ── Daily goal ──────────────────────────────────────────────────────────────
export const DEFAULT_DAILY_GOAL = 15
export const DAILY_GOAL_OPTIONS = [5, 10, 15, 20, 30, 50]

/** The student's daily goal in questions. */
export function dailyGoal(profile) {
  const g = Number(profile?.daily_goal)
  return Number.isFinite(g) && g >= 5 ? Math.round(g) : DEFAULT_DAILY_GOAL
}

/** Questions answered today (Adelaide), from the counts award_xp_for keeps. */
export function answersToday(profile, now = new Date()) {
  if (!profile?.day_answers_date || profile.day_answers_date !== localDate(now)) return 0
  return Math.max(0, Number(profile.day_answers) || 0)
}

// ── Streak week strip ───────────────────────────────────────────────────────
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/**
 * This week (Monday to Sunday) for Home's streak card. Each day is 'done'
 * (answered), 'freeze' (covered by a streak freeze), 'today' (not answered
 * yet today), 'missed' or 'future'. Worked out from the streak: counting back
 * from the last active day, freeze days are skipped (they don't add to the
 * streak) and every other day until the streak runs out was active.
 */
export function streakWeek(profile, now = new Date()) {
  const today = localDate(now)
  const isoDow = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) // 0 = Monday
  const monday = addDays(today, -isoDow)
  const freezeSet = new Set(Array.isArray(profile?.freeze_days) ? profile.freeze_days.map(d => String(d).slice(0, 10)) : [])
  const active = new Set()
  const last = profile?.last_active ? new Date(profile.last_active) : null
  if (last && !Number.isNaN(last.getTime()) && profile?.streak > 0) {
    let remaining = Number(profile.streak) || 0
    let d = localDate(last)
    for (let guard = 0; remaining > 0 && guard < 800; guard++) {
      if (!freezeSet.has(d)) { active.add(d); remaining-- }
      d = addDays(d, -1)
    }
  }
  return DAY_LABELS.map((label, i) => {
    const date = addDays(monday, i)
    let state
    if (date > today) state = 'future'
    else if (active.has(date)) state = 'done'
    else if (freezeSet.has(date)) state = 'freeze'
    else if (date === today) state = 'today'
    else state = 'missed'
    return { date, label, state }
  })
}

/** Right answers in a row that earn a streak freeze, and how many can be held (award_xp_for). */
export const FREEZE_EVERY = 10
export const MAX_FREEZES = 2

// ── Breaks ──────────────────────────────────────────────────────────────────
/** A break with a mini game is offered after every this many answers in a session. */
export const BREAK_EVERY = 30
/** How long a break game runs, in seconds. */
export const BREAK_SECONDS = 120

/** Whether a break is due: another BREAK_EVERY answers since the last one offered. */
export function breakDue(answered, breaksOffered) {
  return Math.floor((Number(answered) || 0) / BREAK_EVERY) > (Number(breaksOffered) || 0)
}

/** The answer count the session bar's break marker sits at. */
export function nextBreakAt(breaksOffered) {
  return ((Number(breaksOffered) || 0) + 1) * BREAK_EVERY
}

/** Pick a game for a break at random, not the one played last time when there's a choice. */
export function pickBreakGame(games, lastId = null, rand = Math.random) {
  if (!games?.length) return null
  const pool = games.length > 1 ? games.filter(g => g.id !== lastId) : games
  return pool[Math.floor(rand() * pool.length) % pool.length]
}

// ── Ranks and bests ─────────────────────────────────────────────────────────
/** The new rank's index when `after` is a higher rank than `before`, else null. */
export function rankUp(before, after) {
  if (!before || !after) return null
  const was = getLevel(before.xp, rankAccuracy(before))
  const now = getLevel(after.xp, rankAccuracy(after))
  return now > was ? now : null
}

/** Longest run of right answers in a row among a session's main (not extra-practice) answers. */
export function longestRun(results) {
  let best = 0
  let run = 0
  for (const r of results || []) {
    if (r.remediation) continue
    run = r.correct ? run + 1 : 0
    if (run > best) best = run
  }
  return best
}

// ── Exam countdown and predicted grade ──────────────────────────────────────
/** Whole days from today (Adelaide) to an exam date (YYYY-MM-DD); null when not set or invalid. */
export function daysUntil(ymd, now = new Date()) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const a = Date.parse(`${localDate(now)}T00:00:00Z`)
  const b = Date.parse(`${ymd}T00:00:00Z`)
  if (Number.isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

// Rough SACE grade bands as a share of exam marks. SACE doesn't publish fixed
// cut-offs, so the card says it's an estimate.
const GRADE_CUTS = [
  [90, 'A+'], [85, 'A'], [80, 'A−'], [75, 'B+'], [70, 'B'], [65, 'B−'],
  [60, 'C+'], [55, 'C'], [50, 'C−'], [45, 'D+'], [40, 'D'], [35, 'D−'], [0, 'E'],
]
// How a final exam's marks are spread across difficulty (1–5 stars).
const EXAM_MIX = { 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.25, 5: 0.15 }
/** Answers needed in a subject before a grade is predicted. */
export const PREDICT_MIN_ANSWERS = 40
const PREDICT_WINDOW = 150

export function gradeFor(score) {
  for (const [cut, grade] of GRADE_CUTS) if (score >= cut) return grade
  return 'E'
}

/**
 * Expected exam score (0–100) from answers ({ difficulty, correct }): the
 * accuracy at each difficulty, weighted by how much of an exam is at that
 * difficulty. A difficulty with few answers leans on the overall accuracy,
 * eased down for harder questions, so a handful of lucky 5★ answers can't
 * make the estimate jump.
 */
export function expectedScore(answers) {
  const rows = (answers || []).filter(a => a && a.correct != null)
  if (!rows.length) return null
  const overall = rows.filter(a => a.correct).length / rows.length
  const avgD = rows.reduce((s, a) => s + clampDiff(a.difficulty), 0) / rows.length
  const K = 6
  let score = 0
  for (const [dStr, weight] of Object.entries(EXAM_MIX)) {
    const d = Number(dStr)
    const atD = rows.filter(a => clampDiff(a.difficulty) === d)
    const prior = Math.min(1, Math.max(0, overall - (d - avgD) * 0.08))
    const right = atD.filter(a => a.correct).length
    score += weight * ((right + K * prior) / (atD.length + K))
  }
  return Math.round(score * 1000) / 10
}

const clampDiff = (d) => Math.min(5, Math.max(1, Math.round(Number(d) || 3)))

/**
 * The predicted grade for Home's exam card, from a subject's answers
 * ({ difficulty, correct, topic, answered_at }, newest first or in any order).
 * → null with too few answers; else { grade, score, previous (the grade a
 * week ago, when there were enough answers then), weakest ({ topic, pct }) }.
 */
export function predictGrade(answers, now = new Date()) {
  const sorted = [...(answers || [])].sort((a, b) => String(b.answered_at).localeCompare(String(a.answered_at)))
  if (sorted.length < PREDICT_MIN_ANSWERS) return null
  const recent = sorted.slice(0, PREDICT_WINDOW)
  const score = expectedScore(recent)
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
  const earlier = sorted.filter(a => String(a.answered_at) < weekAgo).slice(0, PREDICT_WINDOW)
  const previous = earlier.length >= PREDICT_MIN_ANSWERS ? gradeFor(expectedScore(earlier)) : null

  const byTopic = new Map()
  for (const a of recent) {
    if (!a.topic) continue
    const t = byTopic.get(a.topic) || { right: 0, total: 0 }
    t.total++
    if (a.correct) t.right++
    byTopic.set(a.topic, t)
  }
  let weakest = null
  for (const [topic, t] of byTopic) {
    if (t.total < 5) continue
    const pct = Math.round((t.right / t.total) * 100)
    if (!weakest || pct < weakest.pct || (pct === weakest.pct && t.total > weakest.total)) weakest = { topic, pct, total: t.total }
  }
  return { grade: gradeFor(score), score, previous, weakest: weakest && { topic: weakest.topic, pct: weakest.pct } }
}

/** Whether grade `a` is better than grade `b` (both from gradeFor). */
export function gradeAbove(a, b) {
  const order = GRADE_CUTS.map(([, g]) => g)
  return order.indexOf(a) !== -1 && order.indexOf(b) !== -1 && order.indexOf(a) < order.indexOf(b)
}

// ── Leagues ─────────────────────────────────────────────────────────────────
export const LEAGUE_TIERS = [
  { name: 'Bronze',   color: '#c08457' },
  { name: 'Silver',   color: '#b8b8c2' },
  { name: 'Gold',     color: '#e2b54c' },
  { name: 'Platinum', color: '#a89ad9' },
  { name: 'Diamond',  color: '#7fa7d9' },
]
/** The top this many of a group (with some XP) move up a league each week. */
export const LEAGUE_PROMOTE = 5

export function leagueName(tier) {
  return LEAGUE_TIERS[Math.min(LEAGUE_TIERS.length - 1, Math.max(0, Number(tier) || 0))].name
}

/** "2d 6h" (or "5h 12m") until a league week ends. */
export function timeLeft(endsAt, now = new Date()) {
  const ms = new Date(endsAt).getTime() - now.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 'ending now'
  const h = Math.floor(ms / 3600000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  return `${h}h ${Math.floor((ms % 3600000) / 60000)}m`
}
