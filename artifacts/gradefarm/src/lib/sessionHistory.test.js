import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupAnswersIntoSessions, SESSION_GAP_MS } from './sessionHistory.js'

const at = (min) => new Date(Date.UTC(2026, 9, 30, 14, 0) + min * 60000).toISOString()
const ans = (question_id, correct, min, session_id = null) => ({ question_id, correct, answered_at: at(min), session_id })

test('unlinked answers split where the student stopped for a while', () => {
  // 2:20 to 2:40 is one session, though it crosses the half hour.
  const sessions = groupAnswersIntoSessions([
    ans('a', true, 20), ans('b', false, 28), ans('c', true, 35), ans('d', true, 40),
    ans('e', false, 40 + SESSION_GAP_MS / 60000 + 1),
  ])
  assert.equal(sessions.length, 2)
  assert.deepEqual(sessions[0].allIds, ['e'])
  assert.deepEqual(sessions[1].allIds, ['a', 'b', 'c', 'd'])
  assert.equal(sessions[1].date, at(20))
})

test('a session id groups its answers exactly', () => {
  const sessions = groupAnswersIntoSessions([
    ans('a', true, 0, 's1'), ans('b', true, 2, 's2'), ans('c', false, 3, 's1'),
  ])
  assert.deepEqual(sessions.map(s => s.allIds), [['b'], ['a', 'c']])
})

test('wrong ids are the distinct questions missed, in order', () => {
  const [s] = groupAnswersIntoSessions([
    ans('a', false, 0), ans('b', true, 1), ans('a', true, 2), ans('c', false, 3),
  ])
  assert.deepEqual(s.allIds, ['a', 'b', 'c'])
  assert.deepEqual(s.wrongIds, ['a', 'c'])
  assert.equal(s.correct, 2)
  assert.equal(s.total, 4)
})
