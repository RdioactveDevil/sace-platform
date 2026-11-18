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

/** When today started in Adelaide, as a Date. */
export function dayStart(now = new Date()) {
  return new Date(now.getTime() + minutesUntilReset(now) * 60000 - 86400000)
}

const LETTERS = 'ABCDEFGH'

/**
 * Today's free questions as a marked sheet. `answers`: answer_log rows today
 * ({ question_id, correct, selected, answered_at }), or this session's results
 * ({ id, correct }) when today's log can't be read. `byId`: the subject's
 * questions. Only this subject's questions count; the last `limit` are shown.
 * → { items: [{ n, label, correct }], right, misses: [{ id, label, note }], note }
 */
export function markedSheet(answers, byId, limit = 15) {
  const rows = (answers || [])
    .map(a => ({ id: a.question_id ?? a.id, correct: !!a.correct, selected: a.selected ?? null, at: a.answered_at || '' }))
    .filter(a => byId.has(a.id))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    .slice(-limit)
  const label = (q) => q.subtopic || q.topic || 'Question'
  const items = rows.map((r, i) => ({ n: i + 1, label: label(byId.get(r.id)), correct: r.correct }))
  const right = rows.filter(r => r.correct).length
  // Each question once, at its latest answer: still wrong means a miss.
  const latest = new Map()
  rows.forEach((r, i) => latest.set(r.id, { ...r, n: i + 1 }))
  const misses = [...latest.values()].filter(r => !r.correct).sort((a, b) => a.n - b.n).map(r => {
    const q = byId.get(r.id)
    const mcq = Array.isArray(q.options) && q.options.length && typeof r.selected === 'number' && r.selected >= 0
    return { id: r.id, n: r.n, label: label(q), note: mcq ? `you picked ${LETTERS[r.selected] || '?'}` : 'not quite' }
  })
  const pct = items.length ? right / items.length : 0
  const opener = pct === 1 ? 'Full marks.' : pct >= 0.8 ? 'Good work.' : pct >= 0.5 ? 'Solid effort.' : 'Keep at it.'
  const note = misses.length ? `${opener} Have another go at ${misses[0].label.toLowerCase()}.` : `${opener} See you tomorrow.`
  return { items, right, misses, note }
}

/** The right-hand side's words for a marked sheet: how many got away decides the tone. */
export function sheetCopy(misses, nextTopic = '', limit = 15) {
  const n = misses.length
  if (!n) return { title: ['Clean sheet.', 'Keep the run going?'], cta: 'Keep going', lead: nextTopic ? `Question ${limit + 1} is waiting: ${nextTopic}.` : '' }
  if (n === 1) return { title: ['1 got away.', 'One more go for a clean sheet.'], cta: 'Retry it now', lead: '' }
  if (n <= 4) return { title: [`${n} got away.`, 'Get them back while they’re fresh.'], cta: `Retry these ${n} now`, lead: '' }
  return { title: ['A tough set today.', `Go back over the ${n} you missed.`], cta: 'Retry them now', lead: '' }
}

/**
 * The last question Titan asked in a chat, to show where it paused: the last
 * sentence ending in "?" of Titan's last message, without markdown or maths
 * markers. '' when there isn't one.
 */
export function lastTitanQuestion(messages) {
  const last = [...(messages || [])].reverse().find(m => m && m.role === 'assistant')
  if (!last) return ''
  const text = typeof last.content === 'string' ? last.content
    : Array.isArray(last.content) ? last.content.filter(b => b && b.type === 'text').map(b => b.text).join(' ') : ''
  const plain = text.replace(/\$\$?([^$]*)\$\$?/g, '$1').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim()
  const questions = plain.split(/(?<=[.?!])\s+/).filter(s => s.endsWith('?'))
  // Drop a lead-in ("Or …", "Next time: …"); the slip already says it's where the chat paused.
  let q = (questions[questions.length - 1] || '').replace(/^(or|and|so|now)\s+/i, '').replace(/^(next time|next up|next)\s*:\s*/i, '')
  q = q.charAt(0).toUpperCase() + q.slice(1)
  return q.length > 160 ? `${q.slice(0, 157).trimEnd()}…` : q
}
