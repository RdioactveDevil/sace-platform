import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signUpDefaults, signUpChip, carryState, carryMessage, needsOwnDiagnostic } from './signUp.js'

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

const inc = { canInclude: true, includableIds: ['c1', 'c2'] }

test('carryState: carries when the source subject is ticked and includable', () => {
  assert.equal(carryState({ sourceId: 'c1', ticked: ['c1'], ...inc }), 'carries')
})
test('carryState: not-ticked when it can be included but is not ticked', () => {
  assert.equal(carryState({ sourceId: 'c1', ticked: ['c2'], ...inc }), 'not-ticked')
  assert.equal(carryState({ sourceId: 'c1', ticked: [], ...inc }), 'not-ticked')
})
test('carryState: cannot-include when the tutor cannot include subjects, or the subject is not includable', () => {
  assert.equal(carryState({ sourceId: 'c1', ticked: [], canInclude: false, includableIds: ['c1'] }), 'cannot-include')
  assert.equal(carryState({ sourceId: 'c9', ticked: [], ...inc }), 'cannot-include')
})
test('carryState: no-subject for a built-in diagnostic', () => {
  assert.equal(carryState({ sourceId: null, ticked: ['c1'], ...inc }), 'no-subject')
  assert.equal(carryState({ ticked: [], ...inc }), 'no-subject')
})
test('carryMessage: one message per state, nothing for carries and no-subject', () => {
  assert.equal(carryMessage('not-ticked'), "Their consultation diagnostic won't carry across without this subject.")
  assert.equal(carryMessage('cannot-include'), "Their consultation diagnostic won't carry across, because this subject can't be included from your account.")
  assert.equal(carryMessage('carries'), null)
  assert.equal(carryMessage('no-subject'), null)
})
test('needsOwnDiagnostic: only when a ticked subject is not the carried one', () => {
  assert.equal(needsOwnDiagnostic(['c1'], 'c1'), false)
  assert.equal(needsOwnDiagnostic(['c1', 'c2'], 'c1'), true)
  assert.equal(needsOwnDiagnostic(['c2'], null), true)
  assert.equal(needsOwnDiagnostic([], 'c1'), false)
})

// A row shaped exactly like GET /tutor/diagnostic/list returns (shared with the server's column test).
import { readFileSync } from 'node:fs'
test('a real list row pre-ticks its subject and carries the diagnostic', () => {
  const row = JSON.parse(readFileSync(new URL('./fixtures/diagnosticListRow.json', import.meta.url), 'utf8'))
  const opts = { canInclude: true, includableIds: ['cur-chem'] }
  const d = signUpDefaults(row, opts)
  assert.deepEqual(d.curriculumIds, ['cur-chem'])
  assert.equal(d.email, 'jamie@example.com')
  assert.equal(d.parentEmail, 'parent@example.com')
  assert.equal(d.childName, 'Jamie')
  assert.equal(carryState({ sourceId: row.curriculum_id, ticked: d.curriculumIds, ...opts }), 'carries')
})
