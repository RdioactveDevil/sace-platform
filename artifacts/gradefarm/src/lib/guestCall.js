/** How the public call page (/call/:guestToken) reads errors from its two requests. */

const NOT_VALID = "This call link isn't valid."
const COULD_NOT_LOAD = "We couldn't load your call. Check your connection and try again."

/**
 * Loading the call failed. Only a 404 means the link is wrong; anything else
 * (offline, a server error) is worth trying again.
 */
export function guestLoadError(err) {
  return err?.status === 404 ? { invalid: true, message: NOT_VALID } : { invalid: false, message: COULD_NOT_LOAD }
}

/**
 * Joining failed. A 403 with a canJoinFrom still ahead on this device: wait
 * (the countdown shows). One already passed here (this device's clock is
 * ahead of ours): say what the server said. A 410: the call is over.
 */
export function guestJoinOutcome(err, nowMs) {
  if (err?.status === 403 && err.body?.canJoinFrom) {
    const opens = Date.parse(err.body.canJoinFrom)
    if (Number.isFinite(opens) && opens > nowMs) return { kind: 'wait', canJoinFrom: err.body.canJoinFrom }
  }
  if (err?.status === 410) return { kind: 'finished' }
  return { kind: 'error', message: err?.message || 'Could not join the call.' }
}
