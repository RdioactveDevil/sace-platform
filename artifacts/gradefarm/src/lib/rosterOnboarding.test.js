import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseEmailList, gettingStartedStatus } from './rosterOnboarding.js'

test('parseEmailList splits pasted lists and drops duplicates', () => {
  assert.deepEqual(parseEmailList('a@x.com, B@x.com;c@x.com\nd@x.com  a@x.com\n\n'), ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'])
  assert.deepEqual(parseEmailList('  solo@x.com  '), ['solo@x.com'])
  assert.deepEqual(parseEmailList(''), [])
  assert.deepEqual(parseEmailList(undefined), [])
})

test('gettingStartedStatus: a waiting diagnostic comes first, then practice', () => {
  assert.equal(gettingStartedStatus({ diagnostics: [{ status: 'pending' }], xp: 500 }), 'diagnostic')
  assert.equal(gettingStartedStatus({ diagnostics: [{ status: 'waived' }, { status: 'completed' }], xp: 0 }), 'not_started')
  assert.equal(gettingStartedStatus({ diagnostics: [{ status: 'completed' }], xp: 12 }), 'practising')
  assert.equal(gettingStartedStatus({}), 'not_started')
})
