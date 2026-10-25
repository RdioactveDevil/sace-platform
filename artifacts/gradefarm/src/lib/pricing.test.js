import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_STUDENT_TIERS, DEFAULT_MONTHLY_TIERS, studentTiers, tierPrice, planTotal, extraLadder, money, monthlySaving } from './pricing.js'

test('students pay $7, then $6, then $5 a week by default', () => {
  assert.deepEqual(DEFAULT_STUDENT_TIERS, [7, 6, 5])
  assert.deepEqual(studentTiers(undefined), [7, 6, 5])
  assert.deepEqual(studentTiers([]), [7, 6, 5])
  assert.deepEqual(studentTiers([8, 'x', 0, 6]), [8, 6])
})

test('monthly prices default to a little under a month of weekly ones', () => {
  assert.deepEqual(studentTiers(null, 'month'), DEFAULT_MONTHLY_TIERS)
  assert.deepEqual(studentTiers([30], 'month'), [30])
  DEFAULT_MONTHLY_TIERS.forEach((m, i) => assert.ok(m < DEFAULT_STUDENT_TIERS[i] * 52 / 12))
})

test('monthly saving is the whole % off a month of weekly bills', () => {
  assert.equal(monthlySaving(7, 27), 11)
  assert.equal(monthlySaving(5, 19), 12)
  assert.equal(monthlySaving(7, 31), null)
})

test('the last tier covers every further subject', () => {
  const tiers = [7, 6, 5]
  assert.equal(tierPrice(tiers, 1), 7)
  assert.equal(tierPrice(tiers, 2), 6)
  assert.equal(tierPrice(tiers, 3), 5)
  assert.equal(tierPrice(tiers, 6), 5)
})

test('plan totals add up the graduated prices', () => {
  const tiers = [7, 6, 5]
  assert.equal(planTotal(tiers, 0), 0)
  assert.equal(planTotal(tiers, 1), 7)
  assert.equal(planTotal(tiers, 2), 13)
  assert.equal(planTotal(tiers, 5), 28)
})

test('the extra-subject ladder reads naturally', () => {
  assert.equal(extraLadder([7, 6, 5]), '6, then $5')
  assert.equal(extraLadder([7]), '7')
})

test('money drops needless cents', () => {
  assert.equal(money(7), '7')
  assert.equal(money(19.5), '19.50')
})
