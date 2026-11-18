// The upgrade pop-up (components/UpgradeSheet.jsx): what this student would
// pay for the subject they're on, from /api/billing/config.

const DAY = 86400000

/** "Wed 25 Nov", in Adelaide. */
export function shortDay(date) {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Adelaide' }).format(date).replace(',', '')
}

/** "7" for 7, "6.50" for 6.5. */
export const dollars = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2))

/**
 * What the pop-up offers, from the billing config:
 * - 'add': they have a plan; this subject goes on it at `weekly` (`per` its interval)
 * - 'intro': a first plan, `intro` for the first week, then `weekly` from `from`
 * - 'trial': a first plan, `days` free, then `weekly` from `from`
 * - 'plain': `weekly` from today
 * null before the config loads.
 */
export function upgradeQuote(config, today = new Date()) {
  if (!config) return null
  const firstWeek = Number(config.tiers?.[0]) || 7
  if (config.hasPlan) {
    const per = config.interval === 'month' ? 'month' : 'week'
    return { mode: 'add', weekly: Number(config.nextPrice) || firstWeek, per, trialing: !!config.trialing }
  }
  if (Number(config.introPrice) > 0) {
    return { mode: 'intro', intro: Number(config.introPrice), weekly: firstWeek, per: 'week', from: shortDay(new Date(today.getTime() + 7 * DAY)) }
  }
  if (Number(config.trialDays) > 0) {
    return { mode: 'trial', days: Number(config.trialDays), weekly: firstWeek, per: 'week', from: shortDay(new Date(today.getTime() + Number(config.trialDays) * DAY)) }
  }
  return { mode: 'plain', weekly: firstWeek, per: 'week' }
}

/** The pay button's words for a quote. */
export function payLabel(quote) {
  if (!quote) return 'Unlock'
  if (quote.mode === 'intro') return `Pay $${dollars(quote.intro)}`
  if (quote.mode === 'trial') return `Start ${quote.days}-day free trial`
  if (quote.mode === 'add') return `Add for $${dollars(quote.weekly)} a ${quote.per}`
  return `Pay $${dollars(quote.weekly)} a week`
}

/**
 * Free vs paid, for the receipt's lines and the comparison slip. Exam builder
 * and Exam Mode rows only for subjects that have them.
 */
export function compareRows({ freeDaily = 15, examBuilder = true, examMode = true } = {}) {
  return [
    { key: 'practice', done: 'unlimited practice', receipt: 'UNLIMITED PRACTICE', label: 'Practice', free: `${freeDaily} a day`, paid: 'Unlimited' },
    { key: 'titan', done: 'Titan AI', receipt: 'TITAN AI, ANY TIME', label: 'Titan AI', free: 'A few a day', paid: 'Unlimited' },
    { key: 'papers', done: 'past papers with solutions', receipt: 'PAST PAPERS + SOLUTIONS', label: 'Past papers', free: 'First page', paid: 'All, with solutions' },
    ...(examBuilder ? [{ key: 'builder', done: 'the exam builder', receipt: 'EXAM BUILDER', label: 'Exam builder', free: 'Preview', paid: 'Download, sit, mark' }] : []),
    ...(examMode ? [{ key: 'mode', done: 'Exam Mode', receipt: 'EXAM MODE', label: 'Exam Mode', free: 'Locked', paid: 'Included' }] : []),
  ]
}
