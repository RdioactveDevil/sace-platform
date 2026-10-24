import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentStreak } from './streak.js'

// 2026-10-24 10:00 in Adelaide (ACDT, UTC+10:30).
const now = new Date('2026-10-23T23:30:00Z')

test('a streak active today or yesterday (Adelaide days) still counts', () => {
  assert.equal(currentStreak(4, '2026-10-23T22:00:00Z', now), 4) // today, 8:30am
  assert.equal(currentStreak(4, '2026-10-23T05:00:00Z', now), 4) // yesterday
  // 13:00Z on the 22nd is 11:30pm on the 22nd in Adelaide, two days ago.
  assert.equal(currentStreak(4, '2026-10-22T13:00:00Z', now), 0)
})

test('an Adelaide day is not a UTC day', () => {
  // 14:00Z on the 22nd is already the 23rd (yesterday) in Adelaide.
  assert.equal(currentStreak(2, '2026-10-22T14:00:00Z', now), 2)
})

test('no streak, no activity or a bad date shows 0', () => {
  assert.equal(currentStreak(0, '2026-10-23T22:00:00Z', now), 0)
  assert.equal(currentStreak(3, null, now), 0)
  assert.equal(currentStreak(3, 'not a date', now), 0)
})
