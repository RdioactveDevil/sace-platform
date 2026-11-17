import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  examTimes, startSitting, sittingState, pauseSitting, resumeSitting, skipReading, endSitting, timeIsUp,
  formatClock, formatSpan, warningCrossed, sectionAPace, sittingSummary, boardOf,
} from './examSitting.js'

const MIN = 60_000
const T0 = 1_700_000_000_000

test('VCE gets 15 minutes reading time, SACE none', () => {
  assert.deepEqual(examTimes('vce', 100), { readingMinutes: 15, writingMinutes: 150 })
  assert.deepEqual(examTimes('sace', 120), { readingMinutes: 0, writingMinutes: 130 })
  assert.equal(boardOf({ name: 'Chemistry Stage 2', stage: 'Stage 2' }), 'sace')
  assert.equal(boardOf({ name: 'VCE Chemistry Units 3 & 4', stage: 'Units 3 & 4' }), 'vce')
})

test('reading time runs first, then writing time straight on', () => {
  const s = startSitting({ readingMinutes: 15, writingMinutes: 150 }, T0)
  let st = sittingState(s, T0 + 5 * MIN)
  assert.equal(st.phase, 'reading')
  assert.equal(st.left, 10 * MIN)
  st = sittingState(s, T0 + 20 * MIN)
  assert.equal(st.phase, 'writing')
  assert.equal(st.left, 145 * MIN)
  st = sittingState(s, T0 + 166 * MIN)
  assert.equal(st.phase, 'done')
  assert.equal(st.used, 165 * MIN)
  assert.ok(timeIsUp(s, T0 + 166 * MIN))
})

test('a SACE sitting starts in writing time', () => {
  const s = startSitting({ readingMinutes: 0, writingMinutes: 130 }, T0)
  assert.equal(sittingState(s, T0 + 1000).phase, 'writing')
})

test('pausing stops the clock and is counted', () => {
  let s = startSitting({ readingMinutes: 0, writingMinutes: 60 }, T0)
  s = pauseSitting(s, T0 + 10 * MIN)
  assert.equal(sittingState(s, T0 + 30 * MIN).paused, true)
  assert.equal(sittingState(s, T0 + 30 * MIN).left, 50 * MIN) // frozen while paused
  assert.equal(pauseSitting(s, T0 + 31 * MIN), s) // already paused
  s = resumeSitting(s, T0 + 30 * MIN)
  const st = sittingState(s, T0 + 40 * MIN)
  assert.equal(st.paused, false)
  assert.equal(st.left, 40 * MIN)
  assert.equal(st.pauseCount, 1)
  assert.equal(st.pausedMs, 20 * MIN)
})

test('skipping reading time starts writing time in full', () => {
  let s = startSitting({ readingMinutes: 15, writingMinutes: 60 }, T0)
  s = skipReading(s, T0 + 4 * MIN)
  const st = sittingState(s, T0 + 4 * MIN)
  assert.equal(st.phase, 'writing')
  assert.equal(st.left, 60 * MIN)
})

test('ending early keeps the time used; running out ends when time ran out', () => {
  let s = startSitting({ readingMinutes: 0, writingMinutes: 60 }, T0)
  s = pauseSitting(s, T0 + 20 * MIN)
  const early = endSitting(s, T0 + 25 * MIN, 'early')
  const st = sittingState(early, T0 + 99 * MIN)
  assert.equal(st.phase, 'done')
  assert.equal(st.ended, 'early')
  assert.equal(st.used, 20 * MIN)
  assert.equal(early.pauses[0].to, T0 + 25 * MIN) // the open pause is closed
  // Came back an hour after time ran out: it ended at 60 minutes, not now.
  const late = endSitting(startSitting({ readingMinutes: 0, writingMinutes: 60 }, T0), T0 + 120 * MIN, 'time')
  assert.equal(late.ended_at, T0 + 60 * MIN)
  assert.equal(sittingState(late).used, 60 * MIN)
})

test('clock, spans, warnings, pace and summary', () => {
  assert.equal(formatClock(6130 * 1000), '1:42:10')
  assert.equal(formatClock(42 * MIN + 10_000), '42:10')
  assert.equal(formatClock(8_200), '0:09')
  assert.equal(formatSpan(132 * MIN), '2 h 12 min')
  assert.equal(formatSpan(47 * MIN), '47 min')
  assert.equal(warningCrossed(31 * MIN, 29.9 * MIN), 30)
  assert.equal(warningCrossed(10 * MIN + 1, 10 * MIN), 10)
  assert.equal(warningCrossed(20 * MIN, 19 * MIN), null)
  const snap = { questions: [{ section: 'A', marks: 1 }, { section: 'A', marks: 1 }, { section: 'B', marks: 8 }] }
  assert.deepEqual(sectionAPace(snap, 100 * MIN), { aMarks: 2, bMarks: 8, ms: 20 * MIN })
  assert.equal(sectionAPace({ questions: [{ section: 'B', marks: 8 }] }, 100 * MIN), null)
  let s = startSitting({ readingMinutes: 15, writingMinutes: 150 }, T0)
  s = pauseSitting(s, T0 + 30 * MIN); s = resumeSitting(s, T0 + 34 * MIN)
  s = endSitting(s, T0 + 136 * MIN, 'early')
  assert.equal(sittingSummary(s), 'Sat under timed conditions: 2 h 12 min of 2 h 45 min, finished early · paused once (4 min)')
  assert.equal(sittingSummary(null), '')
})
