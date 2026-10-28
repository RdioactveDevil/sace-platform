// Recurring assignments (tutor portal → Assignments → Repeat). The server sets
// the work on each chosen day (api-server/src/lib/recurring-assignments.ts);
// these helpers only describe a schedule and pick sensible defaults.

/** Monday-first, as tutors read a week. `id` is the JS weekday (0 = Sunday). */
export const WEEKDAYS = [
  { id: 1, short: 'Mon', letter: 'M' },
  { id: 2, short: 'Tue', letter: 'T' },
  { id: 3, short: 'Wed', letter: 'W' },
  { id: 4, short: 'Thu', letter: 'T' },
  { id: 5, short: 'Fri', letter: 'F' },
  { id: 6, short: 'Sat', letter: 'S' },
  { id: 0, short: 'Sun', letter: 'S' },
]

const order = (d) => (d + 6) % 7 // Monday = 0 … Sunday = 6

/** Today (or `date`) as YYYY-MM-DD in the browser's time zone. */
export function localYmd(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Days to allow for each assignment by default: up to the day before the next
 * one is set, so they don't pile up. Daily → same day, weekly on Monday → 6.
 */
export function defaultDueDays(days, everyWeeks = 1) {
  const sorted = [...new Set(days)].map(order).sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const period = 7 * (everyWeeks || 1)
  let gap = period - sorted[sorted.length - 1] + sorted[0]
  for (let i = 1; i < sorted.length; i++) gap = Math.min(gap, sorted[i] - sorted[i - 1])
  return Math.min(13, Math.max(0, gap - 1))
}

function listDays(days) {
  const names = WEEKDAYS.filter(w => days.includes(w.id)).map(w => w.short)
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** "Every day", "Every weekday", "Every Mon and Thu", "Every other Mon". */
export function describeRepeat({ days_of_week: days = [], every_weeks: everyWeeks = 1 }) {
  const set = new Set(days)
  if (everyWeeks === 1 && set.size === 7) return 'Every day'
  if (everyWeeks === 1 && set.size === 5 && [1, 2, 3, 4, 5].every(d => set.has(d))) return 'Every weekday'
  return `${everyWeeks === 2 ? 'Every other' : 'Every'} ${listDays([...set])}`
}

/** "due the same day", "due the next day", "due 6 days later". */
export function describeDue(dueDays) {
  if (!dueDays) return 'due the same day'
  if (dueDays === 1) return 'due the next day'
  return `due ${dueDays} days later`
}
