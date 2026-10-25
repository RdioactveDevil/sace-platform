import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_STUDENT_TIERS, studentTiers, tierPrice, planTotal, extraLadder, money } from './pricing.js'

test('students pay $7, then $6, then $5 a week by default', () => {
  assert.deepEqual(DEFAULT_STUDENT_TIERS, [7, 6, 5])
  assert.deepEqual(studentTiers(undefined), [7, 6, 5])
  assert.deepEqual(studentTiers([]), [7, 6, 5])
  assert.deepEqual(studentTiers([8, 'x', 0, 6]), [8, 6])
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
