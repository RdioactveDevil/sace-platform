// Day streaks are counted in Adelaide time, the same days award_xp() uses.
const TIME_ZONE = 'Australia/Adelaide'

/** YYYY-MM-DD for `date` in Adelaide. */
function localDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The day streak to show. The stored streak only changes when the user next
 * answers, so one whose last active day is before yesterday has lapsed: 0.
 */
export function currentStreak(streak, lastActive, now = new Date()) {
  if (!streak || !lastActive) return 0
  const last = new Date(lastActive)
  if (Number.isNaN(last.getTime())) return 0
  const today = localDate(now)
  const lastDay = localDate(last)
  return lastDay === today || lastDay === addDays(today, -1) ? streak : 0
}
