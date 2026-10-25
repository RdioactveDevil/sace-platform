// Parents on a student's own account. A student under 15 needs a parent or
// guardian to confirm their account before the AI features work (the API
// enforces it: api-server/src/lib/parent-consent.ts). Under 15 follows the
// OAIC's guide for when someone can consent for themselves; with no date of
// birth, Year 9 and below counts. Same rule as public.needs_parent_consent().

const CONSENT_AGE = 15
const CONSENT_MAX_YEAR = 9

/** YYYY-MM-DD for `date` in Adelaide. */
function adelaideDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Adelaide', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** Whole years old on `now` (Adelaide), or null without a usable date of birth. */
export function ageOn(dob, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob || '')
  if (!m) return null
  const [y, mo, d] = adelaideDate(now).split('-').map(Number)
  const age = y - Number(m[1]) - (mo < Number(m[2]) || (mo === Number(m[2]) && d < Number(m[3])) ? 1 : 0)
  return age >= 0 ? age : null
}

export function needsParentConsent(dob, yearLevel, now = new Date()) {
  const age = ageOn(dob, now)
  if (age !== null) return age < CONSENT_AGE
  const year = Number(yearLevel)
  return yearLevel !== null && yearLevel !== '' && Number.isFinite(year) && year <= CONSENT_MAX_YEAR
}

/** A student whose AI features are waiting on their parent or guardian to confirm. */
export function awaitingParent(profile, now = new Date()) {
  if (!profile || profile.is_tutor || profile.is_admin || !profile.onboarding_completed) return false
  // Before the parent-consent migration the column doesn't exist and nothing waits.
  if (!('parent_consent_at' in profile)) return false
  return !profile.parent_consent_at && needsParentConsent(profile.dob, profile.year_level, now)
}
