// Day streaks are counted in Adelaide time, the same days award_xp_for() uses.
const TIME_ZONE = 'Australia/Adelaide'

/** YYYY-MM-DD for `date` in Adelaide. */
export function localDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The day streak to show. The stored streak only changes when the user next
 * answers. Missed days are covered by streak freezes at that point, so a
 * streak whose last active day is before yesterday is still alive while the
 * days missed so far (not counting today, which can still be saved) are no
 * more than the freezes held; otherwise it has lapsed: 0.
 */
export function currentStreak(streak, lastActive, now = new Date(), freezes = 0) {
  if (!streak || !lastActive) return 0
  const last = new Date(lastActive)
  if (Number.isNaN(last.getTime())) return 0
  const oldestAlive = addDays(localDate(now), -1 - Math.max(0, Number(freezes) || 0))
  return localDate(last) >= oldestAlive ? streak : 0
}

/** Days missed since the last active day that a freeze will cover when the student next answers. */
export function freezesNeeded(lastActive, now = new Date()) {
  if (!lastActive) return 0
  const last = new Date(lastActive)
  if (Number.isNaN(last.getTime())) return 0
  const lastDay = localDate(last)
  let missed = 0
  for (let d = addDays(lastDay, 1); d < localDate(now); d = addDays(d, 1)) missed++
  return missed
}
