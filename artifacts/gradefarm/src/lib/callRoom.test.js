import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordingAllowed } from './callRoom.js'

test('the tutor can record lessons but not consultation calls', () => {
  assert.equal(recordingAllowed({ session_type: 'individual' }), true)
  assert.equal(recordingAllowed({ session_type: 'group' }), true)
  assert.equal(recordingAllowed({}), true)
  assert.equal(recordingAllowed(null), true)
  assert.equal(recordingAllowed({ session_type: 'consultation' }), false)
})
