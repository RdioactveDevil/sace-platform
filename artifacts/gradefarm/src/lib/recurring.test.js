import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultDueDays, describeDue, describeRepeat } from './recurring.js'

test('defaultDueDays leaves each assignment until the day before the next', () => {
  assert.equal(defaultDueDays([0, 1, 2, 3, 4, 5, 6]), 0)
  assert.equal(defaultDueDays([1]), 6)
  assert.equal(defaultDueDays([1], 2), 13)
  assert.equal(defaultDueDays([1, 4]), 2)     // Mon → Thu is 3 days
  assert.equal(defaultDueDays([0, 1]), 0)     // Sun → Mon is 1 day
  assert.equal(defaultDueDays([1, 3], 2), 1)  // Mon → Wed, then a 12-day gap
  assert.equal(defaultDueDays([]), 0)
})

test('describeRepeat reads naturally', () => {
  assert.equal(describeRepeat({ days_of_week: [0, 1, 2, 3, 4, 5, 6], every_weeks: 1 }), 'Every day')
  assert.equal(describeRepeat({ days_of_week: [5, 1, 2, 3, 4], every_weeks: 1 }), 'Every weekday')
  assert.equal(describeRepeat({ days_of_week: [4, 1], every_weeks: 1 }), 'Every Mon and Thu')
  assert.equal(describeRepeat({ days_of_week: [0, 1, 3], every_weeks: 1 }), 'Every Mon, Wed and Sun')
  assert.equal(describeRepeat({ days_of_week: [1], every_weeks: 2 }), 'Every other Mon')
})

test('describeDue', () => {
  assert.equal(describeDue(0), 'due the same day')
  assert.equal(describeDue(1), 'due the next day')
  assert.equal(describeDue(6), 'due 6 days later')
})
