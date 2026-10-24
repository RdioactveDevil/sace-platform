import { test } from 'node:test'
import assert from 'node:assert/strict'
import { subjectAccess, subscriptionCoversSubject } from './subjects.js'

const chem = { name: 'Chemistry', stage: 'Stage 2' }
const row = (source, extra = {}) => ({ subject_name: 'Chemistry', stage: 'Stage 2', active: true, source, ...extra })

test('tutors and admins can use every subject', () => {
  assert.equal(subjectAccess([], chem, true), 'full')
})

test('no row means no access', () => {
  assert.equal(subjectAccess([], chem), 'none')
  assert.equal(subjectAccess([{ ...row('stripe'), subject_name: 'Physics' }], chem), 'none')
})

test('paid, granted and beta rows give full access', () => {
  for (const source of ['stripe', 'admin', 'beta', 'tutor']) assert.equal(subjectAccess([row(source)], chem), 'full')
})

test('the free subject is limited, unless something else covers it too', () => {
  assert.equal(subjectAccess([row('free')], chem), 'free')
  assert.equal(subjectAccess([row('free'), row('admin')], chem), 'full')
})

test('a row without a stage covers every stage of the subject', () => {
  assert.ok(subscriptionCoversSubject({ subject_name: 'Chemistry', stage: '' }, chem))
  assert.ok(!subscriptionCoversSubject({ subject_name: 'Chemistry', stage: 'Stage 1' }, chem))
})
