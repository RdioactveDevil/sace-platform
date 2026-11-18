import { test } from 'node:test'
import assert from 'node:assert/strict'
import { minutesUntilReset, formatWait } from './freeLimit.js'

test('the allowance resets at midnight in Adelaide', () => {
  // 18 Nov 2026, 17:20 in Adelaide (UTC+10:30) is 06:50 UTC: 6 h 40 min to go.
  assert.equal(minutesUntilReset(new Date('2026-11-18T06:50:00Z')), 400)
  // A minute before midnight in Adelaide.
  assert.equal(minutesUntilReset(new Date('2026-11-18T13:29:00Z')), 1)
  // Winter (UTC+9:30): 3 July, 09:00 in Adelaide is 23:30 UTC on the 2nd: 15 h.
  assert.equal(minutesUntilReset(new Date('2026-07-02T23:30:00Z')), 900)
})

test('waits read naturally', () => {
  assert.equal(formatWait(400), '6 h 40 min')
  assert.equal(formatWait(45), '45 min')
  assert.equal(formatWait(120), '2 h')
})

import { dayStart, markedSheet } from './freeLimit.js'

test("today starts at Adelaide's midnight", () => {
  assert.equal(dayStart(new Date('2026-11-18T06:50:00Z')).toISOString(), '2026-11-17T13:30:00.000Z')
})

test("today's answers become a marked sheet with the misses to retry", () => {
  const byId = new Map([
    ['q1', { id: 'q1', subtopic: 'Chain rule', options: ['a', 'b', 'c', 'd'] }],
    ['q2', { id: 'q2', subtopic: 'Stationary points', options: ['a', 'b'] }],
    ['q3', { id: 'q3', topic: 'Exponentials' }],
  ])
  const sheet = markedSheet([
    { question_id: 'q2', correct: false, selected: 3, answered_at: '2026-11-18T01:02:00Z' },
    { question_id: 'q1', correct: true, selected: 0, answered_at: '2026-11-18T01:01:00Z' },
    { question_id: 'q3', correct: false, selected: null, answered_at: '2026-11-18T01:03:00Z' },
    { question_id: 'other-subject', correct: true, answered_at: '2026-11-18T01:04:00Z' },
  ], byId)
  assert.deepEqual(sheet.items.map(i => [i.n, i.label, i.correct]), [[1, 'Chain rule', true], [2, 'Stationary points', false], [3, 'Exponentials', false]])
  assert.equal(sheet.right, 1)
  assert.deepEqual(sheet.misses.map(m => [m.n, m.label, m.note]), [[2, 'Stationary points', 'you picked D'], [3, 'Exponentials', 'not quite']])
  assert.equal(sheet.note, 'Keep at it. Have another go at stationary points.')
})

test('a question got right on a second try is not a miss', () => {
  const byId = new Map([['q1', { id: 'q1', subtopic: 'Logs' }]])
  const sheet = markedSheet([
    { question_id: 'q1', correct: false, answered_at: '1' },
    { question_id: 'q1', correct: true, answered_at: '2' },
  ], byId)
  assert.equal(sheet.misses.length, 0)
  assert.equal(sheet.items.length, 2)
})

test("this session's results work when today's log can't be read", () => {
  const byId = new Map([['q1', { id: 'q1', subtopic: 'Logs' }]])
  assert.equal(markedSheet([{ id: 'q1', correct: true }], byId).note, 'Full marks. See you tomorrow.')
})

import { sheetCopy } from './freeLimit.js'

test('the headline fits how many got away', () => {
  assert.deepEqual(sheetCopy([], 'Chain rule').title, ['Clean sheet.', 'Keep the run going?'])
  assert.equal(sheetCopy([], 'Chain rule').cta, 'Keep going')
  assert.equal(sheetCopy([{}]).cta, 'Retry it now')
  assert.equal(sheetCopy([{}, {}, {}]).title[0], '3 got away.')
  assert.equal(sheetCopy(Array(8).fill({})).title[1], 'Go back over the 8 you missed.')
})
