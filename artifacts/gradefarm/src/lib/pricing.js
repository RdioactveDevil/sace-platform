// Student pricing, as the app shows it. The prices themselves live in
// platform_settings.pricing (Admin → Settings) and come back from
// /api/billing/config; these defaults only cover the moment before that loads.

/** $/week (AUD) for the 1st, 2nd and every further paid subject. */
export const DEFAULT_STUDENT_TIERS = [7, 6, 5]

/** The tiers from settings or the billing config, or the defaults. */
export function studentTiers(tiers) {
  const clean = Array.isArray(tiers) ? tiers.filter(n => typeof n === 'number' && n > 0) : []
  return clean.length ? clean : DEFAULT_STUDENT_TIERS
}

/** Price of the nth paid subject (1-based); the last tier applies to every further subject. */
export const tierPrice = (tiers, n) => tiers[Math.min(Math.max(n, 1), tiers.length) - 1]

/** Total for `count` paid subjects. */
export const planTotal = (tiers, count) =>
  Array.from({ length: Math.max(count, 0) }, (_, i) => tierPrice(tiers, i + 1)).reduce((a, b) => a + b, 0)

/** "6, then $5" — the prices after the first subject, for "extra subjects $… each". */
export const extraLadder = (tiers) => (tiers.length > 1 ? tiers.slice(1) : tiers).join(', then $')

/** Dollars without a needless ".00": 7 → "7", 19.5 → "19.50". */
export const money = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
