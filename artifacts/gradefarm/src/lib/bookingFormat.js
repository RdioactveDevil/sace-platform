// Pure helpers for the consultation-booking screens (tutor side).

export const ZONES = [
  { value: 'Australia/Adelaide', label: 'Adelaide' },
  { value: 'Australia/Darwin', label: 'Darwin' },
  { value: 'Australia/Brisbane', label: 'Brisbane' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Australia/Melbourne', label: 'Melbourne' },
  { value: 'Australia/Hobart', label: 'Hobart' },
  { value: 'Australia/Perth', label: 'Perth' },
]

/** Days in the order the settings card shows them; keys match the server's weekly hours. */
export const WEEK_DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

export const emptyWeek = () => Object.fromEntries(WEEK_DAYS.map((d) => [d.key, []]))

export const isValidHHMM = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** 1440 -> "1 day before", 90 -> "1 hour 30 minutes before". */
export function reminderLabel(minutes) {
  let left = Math.max(0, Math.round(minutes))
  const parts = []
  const days = Math.floor(left / 1440); left -= days * 1440
  const hours = Math.floor(left / 60); left -= hours * 60
  if (days) parts.push(plural(days, 'day'))
  if (hours) parts.push(plural(hours, 'hour'))
  if (left || !parts.length) parts.push(plural(left, 'minute'))
  return `${parts.join(' ')} before`
}

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 }

/** A number and a unit as whole minutes; null if it isn't a positive whole number of minutes. */
export function reminderToMinutes(value, unit) {
  const n = Number(value)
  const m = n * (UNIT_MINUTES[unit] ?? NaN)
  return Number.isFinite(m) && m > 0 && Number.isInteger(m) ? m : null
}

/** The largest unit that divides the minutes evenly. */
export function splitReminder(minutes) {
  if (minutes % 1440 === 0) return { value: minutes / 1440, unit: 'days' }
  if (minutes % 60 === 0) return { value: minutes / 60, unit: 'hours' }
  return { value: minutes, unit: 'minutes' }
}

function partsIn(date, timeZone, options) {
  const out = {}
  for (const p of new Intl.DateTimeFormat('en-AU', { timeZone, hourCycle: 'h23', ...options }).formatToParts(date)) out[p.type] = p.value
  return out
}

function clock(date, timeZone) {
  const p = partsIn(date, timeZone, { hour: 'numeric', minute: '2-digit' })
  const h = Number(p.hour) % 24
  return `${h % 12 === 0 ? 12 : h % 12}:${p.minute} ${h < 12 ? 'am' : 'pm'}`
}

/** Open times as day groups ("Tuesday 3 November") of clock labels ("4:30 pm"), in the zone. */
export function groupSlotsByDay(slots, timeZone) {
  const groups = []
  for (const iso of slots) {
    const d = new Date(iso)
    const p = partsIn(d, timeZone, { weekday: 'long', day: 'numeric', month: 'long' })
    const day = `${p.weekday} ${p.day} ${p.month}`
    let g = groups[groups.length - 1]
    if (!g || g.day !== day) { g = { day, times: [] }; groups.push(g) }
    g.times.push({ iso, label: clock(d, timeZone) })
  }
  return groups
}

const zoneName = (timeZone) => ZONES.find((z) => z.value === timeZone)?.label ?? String(timeZone).split('/').pop().replace(/_/g, ' ')

/** "Tue 3 Nov, 4:30 pm (Melbourne)". */
export function formatWhen(iso, timeZone) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = partsIn(d, timeZone, { weekday: 'short', day: 'numeric', month: 'short' })
  return `${p.weekday} ${p.day} ${p.month}, ${clock(d, timeZone)} (${zoneName(timeZone)})`
}

/** The zone's offset from UTC, in ms, at an instant. */
function offsetAt(ms, timeZone) {
  const p = partsIn(new Date(ms), timeZone, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
  return Date.UTC(p.year, p.month - 1, p.day, Number(p.hour) % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

/** A date ("2026-11-03") and 24-hour time ("16:30") on a zone's wall clock, as an ISO instant; null if either is missing. */
export function zonedToIso(date, time, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !isValidHHMM(time)) return null
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  let guess = wall - offsetAt(wall, timeZone)
  guess = wall - offsetAt(guess, timeZone) // settle across a daylight-saving change
  return new Date(guess).toISOString()
}
