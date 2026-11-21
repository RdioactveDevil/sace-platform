import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guestLoadError, guestJoinOutcome } from './guestCall.js'

const httpError = (status, body = {}, message = body.error) => Object.assign(new Error(message || 'x'), { status, body })

test('a 404 on the call link means the link is not valid', () => {
  assert.deepEqual(guestLoadError(httpError(404, { error: "This call link isn't valid." })), {
    invalid: true, message: "This call link isn't valid.",
  })
})

test('any other load failure is a connection problem the guest can retry', () => {
  for (const err of [new TypeError('Failed to fetch'), httpError(500, { error: 'Something went wrong. Please try again.' }), httpError(503)]) {
    assert.deepEqual(guestLoadError(err), {
      invalid: false, message: "We couldn't load your call. Check your connection and try again.",
    })
  }
})

test('join 403 with a future canJoinFrom: wait for it', () => {
  const now = Date.parse('2027-03-01T10:00:00Z')
  const err = httpError(403, { error: 'The call opens 10 minutes before it starts.', canJoinFrom: '2027-03-01T10:05:00.000Z' })
  assert.deepEqual(guestJoinOutcome(err, now), { kind: 'wait', canJoinFrom: '2027-03-01T10:05:00.000Z' })
})

test("join 403 whose canJoinFrom has already passed on this device: show the server's message", () => {
  const now = Date.parse('2027-03-01T10:06:00Z')
  const err = httpError(403, { error: 'The call opens 10 minutes before it starts.', canJoinFrom: '2027-03-01T10:05:00.000Z' })
  assert.deepEqual(guestJoinOutcome(err, now), { kind: 'error', message: 'The call opens 10 minutes before it starts.' })
})

test('join 410 means the call is over; anything else shows its message', () => {
  assert.deepEqual(guestJoinOutcome(httpError(410, { error: 'This call has ended.' }), 0), { kind: 'finished' })
  assert.deepEqual(guestJoinOutcome(httpError(503, { error: "Video calling isn't set up yet." }), 0), { kind: 'error', message: "Video calling isn't set up yet." })
  assert.deepEqual(guestJoinOutcome(new TypeError(''), 0), { kind: 'error', message: 'Could not join the call.' })
})
