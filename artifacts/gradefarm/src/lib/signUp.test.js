import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signUpDefaults, signUpChip } from './signUp.js'

const row = { prospect_email: 'sam@example.com', parent_email: 'pat@example.com', student_name: 'Sam Rowe', submitted_by_name: 'Samantha Rowe', curriculum_id: 'c1' }

test('defaults: prospect email and the source subject when it can be included', () => {
  assert.deepEqual(signUpDefaults(row, { canInclude: true, includableIds: ['c1', 'c2'] }), {
    email: 'sam@example.com', curriculumIds: ['c1'], parentEmail: 'pat@example.com', childName: 'Samantha',
  })
})

test('defaults: no subject when the tutor cannot include subjects or it is not includable', () => {
  assert.deepEqual(signUpDefaults(row, { canInclude: false, includableIds: ['c1'] }).curriculumIds, [])
  assert.deepEqual(signUpDefaults(row, { canInclude: true, includableIds: ['c2'] }).curriculumIds, [])
  assert.deepEqual(signUpDefaults(row, { canInclude: true }).curriculumIds, [])
})

test('defaults: missing details become empty or null; name falls back to student_name', () => {
  assert.deepEqual(signUpDefaults({ student_name: '  Alex  Moss ' }, { canInclude: false }), {
    email: '', curriculumIds: [], parentEmail: null, childName: 'Alex',
  })
  assert.deepEqual(signUpDefaults({}, {}), { email: '', curriculumIds: [], parentEmail: null, childName: '' })
})

test('chip: nothing when there is no sign-up', () => {
  assert.equal(signUpChip(null), null)
  assert.equal(signUpChip(undefined), null)
})

test('chip: invited is gold, signed up is success and names the student', () => {
  assert.deepEqual(signUpChip({ status: 'invited' }), { label: 'Invited', tone: 'gold' })
  assert.deepEqual(signUpChip({ status: 'signed_up', studentName: 'Sam Rowe' }), { label: 'Signed up · Sam Rowe', tone: 'success' })
  assert.deepEqual(signUpChip({ status: 'signed_up' }), { label: 'Signed up', tone: 'success' })
})
