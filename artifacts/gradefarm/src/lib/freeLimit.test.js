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
