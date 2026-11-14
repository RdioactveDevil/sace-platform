// A plan picked on the pricing page (one or more paid subjects, weekly or
// monthly) by someone who wasn't signed in. The pricing page remembers it
// before sending them to sign up; once they're signed in (straight away, or
// after confirming their email), the app takes them on to Stripe Checkout for
// it (startCheckout).

import { addPaidSubjects, getBillingConfig } from './db'
import { normalizePlan } from './checkoutPlan'

export { normalizePlan }

const KEY = 'gf-pending-checkout'
// Long enough to find the confirmation email; not so long that a sign-in
// next week lands on a checkout they've forgotten about.
const MAX_AGE_MS = 24 * 60 * 60 * 1000

/** @param {{ subjects: { curriculumId: string, name: string, level?: string }[], interval?: 'week' | 'month' }} plan */
export function rememberPendingCheckout(plan) {
  const saved = normalizePlan(plan)
  if (!saved) return
  try { localStorage.setItem(KEY, JSON.stringify({ ...saved, at: Date.now() })) } catch {}
}

/** The remembered plan, or null; forgets it either way so it's only acted on once. */
export function takePendingCheckout() {
  try {
    const raw = localStorage.getItem(KEY)
    localStorage.removeItem(KEY)
    const saved = raw ? JSON.parse(raw) : null
    return saved && Date.now() - saved.at < MAX_AGE_MS ? normalizePlan(saved) : null
  } catch {
    return null
  }
}

/**
 * Pay for a plan (or a single subject). With no plan yet, sends the browser
 * to Stripe Checkout and resolves to { redirected: true }. With a plan
 * already, resolves to { hasPlan: true } without charging: adding a subject
 * to a plan costs a different price, so the caller shows Get Access to
 * confirm it.
 */
export async function startCheckout(planOrSubject) {
  const plan = normalizePlan(planOrSubject)
  if (!plan) throw new Error('Choose a subject first.')
  const billing = await getBillingConfig().catch(() => null)
  if (billing?.hasPlan) return { hasPlan: true }
  const result = await addPaidSubjects(plan.subjects.map(s => s.curriculumId), plan.interval)
  if (!result?.url) throw new Error("Couldn't open checkout. Please try again.")
  window.location.assign(result.url)
  return { redirected: true }
}

/** A subject as Get Access expects it (a subject tile). */
export const subjectTileFor = (subject) => ({ id: subject.curriculumId, name: subject.name, stage: subject.level || '' })

// A plan whose checkout couldn't open once they were signed in (payments
// down, a network blip): kept for this tab, with why, so Get Access offers it
// again after onboarding instead of them landing on the free plan by default.
const RETRY_KEY = 'gf-checkout-retry'

export function rememberCheckoutRetry(plan, error) {
  const saved = normalizePlan(plan)
  if (!saved) return
  try { sessionStorage.setItem(RETRY_KEY, JSON.stringify({ ...saved, error: String(error || '') })) } catch {}
}

/** The plan to offer again ({ subjects, interval, error }), or null. Reading it doesn't forget it. */
export function checkoutRetry() {
  try {
    const raw = sessionStorage.getItem(RETRY_KEY)
    const saved = raw ? JSON.parse(raw) : null
    const plan = normalizePlan(saved)
    return plan ? { ...plan, error: saved.error || '' } : null
  } catch {
    return null
  }
}

export function clearCheckoutRetry() {
  try { sessionStorage.removeItem(RETRY_KEY) } catch {}
}
