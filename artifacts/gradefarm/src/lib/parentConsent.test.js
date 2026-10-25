import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ageOn, awaitingParent, needsParentConsent } from './parentConsent.js'

// 2026-10-25 10:00 in Adelaide (ACDT, UTC+10:30).
const now = new Date('2026-10-24T23:30:00Z')

test('age counts whole years in Adelaide', () => {
  assert.equal(ageOn('2011-10-25', now), 15) // birthday today
  assert.equal(ageOn('2011-10-26', now), 14) // tomorrow
  assert.equal(ageOn('2014-03-02', now), 12)
  assert.equal(ageOn('', now), null)
  assert.equal(ageOn('not a date', now), null)
  assert.equal(ageOn('2030-01-01', now), null)
})

test('under 15 needs a parent; the date of birth wins over the year level', () => {
  assert.equal(needsParentConsent('2014-03-02', 6, now), true)
  assert.equal(needsParentConsent('2011-10-25', 9, now), false) // 15 today
  assert.equal(needsParentConsent('2011-10-26', 11, now), true)
})

test('with no date of birth, Year 9 and below needs a parent', () => {
  assert.equal(needsParentConsent(null, 6, now), true)
  assert.equal(needsParentConsent(null, '9', now), true)
  assert.equal(needsParentConsent(null, 10, now), false)
  assert.equal(needsParentConsent(null, null, now), false)
  assert.equal(needsParentConsent(null, '', now), false)
})

test('only an onboarded young student without consent is waiting', () => {
  const kid = { onboarding_completed: true, dob: '2014-03-02', year_level: 6, parent_consent_at: null }
  assert.equal(awaitingParent(kid, now), true)
  assert.equal(awaitingParent({ ...kid, parent_consent_at: '2026-10-20T00:00:00Z' }, now), false)
  assert.equal(awaitingParent({ ...kid, onboarding_completed: false }, now), false)
  assert.equal(awaitingParent({ ...kid, is_tutor: true }, now), false)
  assert.equal(awaitingParent({ ...kid, dob: '2008-01-01', year_level: 12 }, now), false)
  // Before the migration the column isn't there.
  const { parent_consent_at, ...old } = kid
  assert.equal(awaitingParent(old, now), false)
})
