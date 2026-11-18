import { test } from 'node:test'
import assert from 'node:assert/strict'
import { upgradeQuote, payLabel, compareRows, dollars } from './upgrade.js'

const today = new Date('2026-11-18T03:00:00Z') // Wed 18 Nov in Adelaide

test('a first plan gets $2 for its first week, then the weekly price', () => {
  const q = upgradeQuote({ tiers: [7, 6, 5], introPrice: 2, trialDays: 7, hasPlan: false }, today)
  assert.deepEqual(q, { mode: 'intro', intro: 2, weekly: 7, per: 'week', from: 'Wed 25 Nov' })
  assert.equal(payLabel(q), 'Pay $2')
})

test('without the intro price a first plan gets the free trial, or pays from today', () => {
  assert.equal(upgradeQuote({ tiers: [7], introPrice: 0, trialDays: 7 }, today).mode, 'trial')
  assert.equal(payLabel(upgradeQuote({ tiers: [7], introPrice: 0, trialDays: 7 }, today)), 'Start 7-day free trial')
  assert.equal(payLabel(upgradeQuote({ tiers: [7], introPrice: 0, trialDays: 0 }, today)), 'Pay $7 a week')
})

test('with a plan the subject is added at its next price', () => {
  const q = upgradeQuote({ tiers: [7, 6, 5], hasPlan: true, nextPrice: 6, interval: 'month', trialing: true }, today)
  assert.deepEqual(q, { mode: 'add', weekly: 6, per: 'month', trialing: true })
  assert.equal(payLabel(q), 'Add for $6 a month')
})

test('the comparison leaves out features the subject has not got', () => {
  assert.equal(compareRows({ freeDaily: 15 }).length, 5)
  assert.deepEqual(compareRows({ examBuilder: false, examMode: false }).map(r => r.key), ['practice', 'titan', 'papers'])
  assert.equal(compareRows({ freeDaily: 20 })[0].free, '20 a day')
  assert.equal(dollars(6.5), '6.50')
})
