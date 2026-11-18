// The free subject's daily question allowance resets at midnight in Adelaide
// (free_questions_today(), migration 20261020000000_student_billing.sql).

/** Minutes from `now` until the next midnight in Adelaide. */
export function minutesUntilReset(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Adelaide', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]))
  const secondsIn = parts.hour * 3600 + parts.minute * 60 + parts.second
  return Math.max(1, Math.ceil((86400 - secondsIn) / 60))
}

/** "6 h 40 min", "45 min", "under a minute". */
export function formatWait(minutes) {
  if (minutes < 1) return 'under a minute'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}
