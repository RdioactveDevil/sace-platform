// A paid subject picked on the pricing page by someone who wasn't signed in.
// The pricing page remembers it before sending them to sign up; once they're
// signed in (straight away, or after confirming their email), the app takes
// them on to Stripe Checkout for it (startCheckout).

import { addPaidSubject, getBillingConfig } from './db'

const KEY = 'gf-pending-checkout'
// Long enough to find the confirmation email; not so long that a sign-in
// next week lands on a checkout they've forgotten about.
const MAX_AGE_MS = 24 * 60 * 60 * 1000

/** @param {{ curriculumId: string, name: string, level?: string }} subject */
export function rememberPendingCheckout(subject) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...subject, at: Date.now() })) } catch {}
}

/** The remembered subject, or null; forgets it either way so it's only acted on once. */
export function takePendingCheckout() {
  try {
    const raw = localStorage.getItem(KEY)
    localStorage.removeItem(KEY)
    const saved = raw ? JSON.parse(raw) : null
    return saved?.curriculumId && Date.now() - saved.at < MAX_AGE_MS ? saved : null
  } catch {
    return null
  }
}

/**
 * Pay for `subject`, billed weekly. With no plan yet, sends the browser to
 * Stripe Checkout and resolves to { redirected: true }. With a plan already,
 * resolves to { hasPlan: true } without charging: adding a subject to a plan
 * costs a different price, so the caller shows Get Access to confirm it.
 */
export async function startCheckout(subject) {
  const billing = await getBillingConfig().catch(() => null)
  if (billing?.hasPlan) return { hasPlan: true }
  const result = await addPaidSubject(subject.curriculumId, 'week')
  if (!result?.url) throw new Error("Couldn't open checkout. Please try again.")
  window.location.assign(result.url)
  return { redirected: true }
}

/** A subject as Get Access expects it (a subject tile). */
export const subjectTileFor = (subject) => ({ id: subject.curriculumId, name: subject.name, stage: subject.level || '' })
