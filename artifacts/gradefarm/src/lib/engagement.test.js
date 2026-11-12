import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  answersToday, breakDue, dailyGoal, daysUntil, expectedScore, gradeAbove, gradeFor, leagueName, longestRun,
  nextBreakAt, pickBreakGame, predictGrade, rankUp, streakWeek, timeLeft, BREAK_EVERY, DEFAULT_DAILY_GOAL,
  PREDICT_MIN_ANSWERS,
} from './engagement.js'

// Wednesday 2026-11-11, 10:00 in Adelaide (ACDT, UTC+10:30).
const now = new Date('2026-11-10T23:30:00Z')

test('daily goal falls back to the default and counts only today', () => {
  assert.equal(dailyGoal({}), DEFAULT_DAILY_GOAL)
  assert.equal(dailyGoal({ daily_goal: 30 }), 30)
  assert.equal(dailyGoal({ daily_goal: 2 }), DEFAULT_DAILY_GOAL)
  assert.equal(answersToday({ day_answers: 9, day_answers_date: '2026-11-11' }, now), 9)
  assert.equal(answersToday({ day_answers: 9, day_answers_date: '2026-11-10' }, now), 0)
  assert.equal(answersToday(null, now), 0)
})

test('a break is due every BREAK_EVERY answers, once each', () => {
  assert.equal(breakDue(BREAK_EVERY - 1, 0), false)
  assert.equal(breakDue(BREAK_EVERY, 0), true)
  assert.equal(breakDue(BREAK_EVERY + 4, 1), false)
  assert.equal(breakDue(BREAK_EVERY * 2, 1), true)
  assert.equal(nextBreakAt(0), BREAK_EVERY)
  assert.equal(nextBreakAt(2), BREAK_EVERY * 3)
})

test('the break game is random but not the last one played', () => {
  const games = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  for (let i = 0; i < 20; i++) assert.notEqual(pickBreakGame(games, 'b').id, 'b')
  assert.equal(pickBreakGame([{ id: 'a' }], 'a').id, 'a')
  assert.equal(pickBreakGame([], null), null)
})

test('rank up only when the rank goes up', () => {
  const base = { recent_correct: 80, recent_answers: 100 }
  assert.equal(rankUp({ ...base, xp: 3900 }, { ...base, xp: 4010 }), 5) // Silver I → Gold
  assert.equal(rankUp({ ...base, xp: 4010 }, { ...base, xp: 4100 }), null)
  // XP is there but accuracy isn't: no rank up.
  assert.equal(rankUp({ recent_correct: 40, recent_answers: 100, xp: 3900 }, { recent_correct: 40, recent_answers: 100, xp: 4100 }), null)
})

test('longest run ignores extra practice', () => {
  const r = (correct, remediation = false) => ({ correct, remediation })
  assert.equal(longestRun([r(true), r(true), r(false, true), r(true), r(false), r(true)]), 3)
  assert.equal(longestRun([]), 0)
})

test('the streak week marks answered, frozen, missed and future days', () => {
  // 4-day streak, last active today; Monday was covered by a freeze.
  const week = streakWeek({ streak: 4, last_active: '2026-11-10T23:00:00Z', freeze_days: ['2026-11-09'] }, now)
  assert.deepEqual(week.map(d => d.state), ['freeze', 'done', 'done', 'future', 'future', 'future', 'future'])
  assert.equal(week[0].date, '2026-11-09')
  // Last active yesterday: today is still to do.
  const pending = streakWeek({ streak: 2, last_active: '2026-11-10T05:00:00Z', freeze_days: [] }, now)
  assert.deepEqual(pending.map(d => d.state).slice(0, 3), ['done', 'done', 'today'])
})

test('days until an exam date, in Adelaide days', () => {
  assert.equal(daysUntil('2026-11-11', now), 0)
  assert.equal(daysUntil('2026-11-20', now), 9)
  assert.equal(daysUntil('2026-11-01', now), -10)
  assert.equal(daysUntil('', now), null)
  assert.equal(daysUntil(undefined, now), null)
})

test('grades and the expected score', () => {
  assert.equal(gradeFor(92), 'A+')
  assert.equal(gradeFor(71), 'B')
  assert.equal(gradeFor(10), 'E')
  assert.ok(gradeAbove('A−', 'B+'))
  assert.ok(!gradeAbove('C', 'B'))
  const perfect = Array.from({ length: 60 }, (_, i) => ({ correct: true, difficulty: (i % 5) + 1 }))
  const half = Array.from({ length: 60 }, (_, i) => ({ correct: i % 2 === 0, difficulty: (i % 5) + 1 }))
  assert.ok(expectedScore(perfect) > 85)
  assert.ok(expectedScore(half) > 35 && expectedScore(half) < 65)
  assert.equal(expectedScore([]), null)
})

test('a predicted grade needs enough answers and names the weakest topic', () => {
  const day = (d) => `2026-11-${String(d).padStart(2, '0')}T01:00:00Z`
  const few = Array.from({ length: PREDICT_MIN_ANSWERS - 1 }, () => ({ correct: true, difficulty: 3, topic: 'A', answered_at: day(10) }))
  assert.equal(predictGrade(few, now), null)
  const rows = [
    ...Array.from({ length: 30 }, () => ({ correct: true, difficulty: 3, topic: 'Stoichiometry', answered_at: day(10) })),
    ...Array.from({ length: 10 }, (_, i) => ({ correct: i < 3, difficulty: 4, topic: 'Equilibrium', answered_at: day(10) })),
  ]
  const p = predictGrade(rows, now)
  assert.ok(p)
  assert.equal(p.weakest.topic, 'Equilibrium')
  assert.equal(p.weakest.pct, 30)
  assert.equal(p.previous, null) // nothing from a week ago
})

test('league names and time left', () => {
  assert.equal(leagueName(0), 'Bronze')
  assert.equal(leagueName(9), 'Diamond')
  assert.equal(timeLeft('2026-11-13T05:30:00Z', new Date('2026-11-11T00:00:00Z')), '2d 5h')
  assert.equal(timeLeft('2026-11-11T03:15:00Z', new Date('2026-11-11T00:00:00Z')), '3h 15m')
  assert.equal(timeLeft('2026-11-10T00:00:00Z', new Date('2026-11-11T00:00:00Z')), 'ending now')
})
