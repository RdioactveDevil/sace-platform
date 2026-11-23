// Building a timed diagnostic in the tutor portal: 20 one-mark multiple-choice
// questions plus bank-format short answers totalling exactly 30 marks.
// Pure helpers; the fetchers are injected so this runs under `node --test`.

export const MCQ_COUNT = 20
export const SHORT_ANSWER_MARKS = 30
const PER_REQUEST = 3
const DIFFICULTY_RANK = { easy: 0, moderate: 1, exam: 2 }
const SHORT_FAIL = "Couldn't put together 30 marks of short answers. Try again."

/** True when every subject is an English or Writing subject (same rule as the server). */
export function isEnglishOnly(subjects) {
  return subjects.every(s => {
    const n = String(s.name || '').toLowerCase()
    return n.includes('english') || n.includes('writing')
  })
}

/**
 * Up to `n` short-answer requests spread across the scope: round-robin by topic,
 * then by subtopic within each topic. Wraps round if there are fewer places than `n`.
 */
export function shortAnswerRequests(scope, n = 5, offset = 0) {
  const topics = (scope.topics || []).map(t => (typeof t === 'string' ? { topic: t } : t))
  const queues = topics.map(t => ({
    topic: t.topic,
    places: t.subtopicIds?.length ? t.subtopicIds.map(id => ({ subtopicId: id, topic: t.topic })) : [{ topic: t.topic }],
    next: 0,
  }))
  const out = []
  if (!queues.length) return out
  for (let i = offset; out.length < n; i++) {
    const q = queues[i % queues.length]
    const place = q.places[q.next % q.places.length]
    q.next++
    out.push({ ...place, count: PER_REQUEST })
  }
  return out
}

/**
 * A subset of `candidates` whose marks add up to exactly `target`, preferring
 * every topic present, then both difficulties; ordered moderate then exam.
 * Null when no subset adds up.
 */
export function pickShortAnswers(candidates, target = SHORT_ANSWER_MARKS) {
  const seen = new Set()
  const pool = []
  for (const q of candidates) {
    const key = String(q.question || '').trim().toLowerCase()
    if (key && seen.has(key)) continue
    seen.add(key)
    pool.push(q)
  }
  const items = pool.slice(0, 20)
  const n = items.length
  let best = null
  let bestScore = -Infinity
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { sum += items[i].marks; if (sum > target) break }
    if (sum !== target) continue
    const chosen = items.filter((_, i) => mask & (1 << i))
    const topics = new Set(chosen.map(q => q.topic)).size
    const both = new Set(chosen.map(q => q.difficulty)).size > 1 ? 1 : 0
    const score = topics * 1000 + both * 100 - Math.abs(chosen.length - 7)
    if (score > bestScore) { bestScore = score; best = chosen }
  }
  if (!best) return null
  return best
    .map((q, i) => ({ q, i }))
    .sort((a, b) => ((a.q.difficulty === 'exam' ? 1 : 0) - (b.q.difficulty === 'exam' ? 1 : 0)) || a.i - b.i)
    .map(x => x.q)
}

/**
 * The finished test: 20 MCQs (easy to exam) then 30 marks of short answers, ids from 1.
 * `scopeTopics`: [{ topic, subtopicIds? }] (or plain topic names for built-in subjects).
 */
export async function buildTimedTest({ yearLevel, subject, scopeTopics }, { generateMcq, generateShortAnswers, onProgress }) {
  const progress = { mcq: 'writing', shortDone: 0, shortTotal: 0 }
  const report = () => { try { onProgress?.({ ...progress }) } catch { /* progress is best-effort */ } }
  const scope = { curriculumId: subject.curriculumId, topics: scopeTopics }
  const candidates = []

  const runRound = async (requests) => {
    progress.shortTotal += requests.length
    report()
    await Promise.all(requests.map(async r => {
      try {
        const json = await generateShortAnswers({
          yearLevel, subject, count: r.count,
          ...(r.subtopicId ? { subtopicId: r.subtopicId } : { topic: r.topic }),
        })
        candidates.push(...(json?.questions || []))
      } catch { /* one failed request is fine: the others may be enough */ }
      progress.shortDone++
      report()
    }))
  }

  report()
  const mcqPromise = (async () => {
    const request = () => generateMcq({ yearLevel, subjects: [subject], format: 'timed' })
    // One retry: a single failed MCQ request shouldn't throw away the short answers being written.
    const json = await request().catch(() => request())
    progress.mcq = 'done'
    report()
    return json?.questions || []
  })()
  const shortPromise = runRound(shortAnswerRequests(scope, 5))
  // Don't leave an unhandled rejection if the MCQ call fails while short answers run.
  mcqPromise.catch(() => {})
  const [mcqs] = await Promise.all([mcqPromise, shortPromise])

  let picked = pickShortAnswers(candidates)
  if (!picked) {
    await runRound(shortAnswerRequests(scope, 5, 1))
    picked = pickShortAnswers(candidates)
  }
  if (!picked) throw new Error(SHORT_FAIL)

  const mc = mcqs
    .map((q, i) => ({ q, i }))
    .sort((a, b) => ((DIFFICULTY_RANK[a.q.difficulty] ?? 1) - (DIFFICULTY_RANK[b.q.difficulty] ?? 1)) || a.i - b.i)
    .map(x => x.q)
    .slice(0, MCQ_COUNT)
  if (mc.length < MCQ_COUNT) throw new Error('Not enough questions came back. Try again.')

  return [...mc.map(q => ({ ...q, marks: 1 })), ...picked].map((q, i) => ({ ...q, id: i + 1 }))
}

// ---- Clock and saved answers (student sitting; pure, no React/db) ----

const FIVE_MIN = 5 * 60000
const answersKey = token => `gf-diagnostic-answers:${token}`
const nameKey = token => `gf-diagnostic-name:${token}`

/**
 * Client-side deadline for a timed sitting. The server's clock and the device's clock can
 * disagree, so the offset (serverNow - clientNow at fetch time) is applied to the server
 * deadline to get the deadline in client time.
 */
export function clockFrom({ startedAt, limitMinutes, serverNow }, clientNow = Date.now()) {
  const serverDeadline = Date.parse(startedAt) + limitMinutes * 60000
  return { deadline: serverDeadline - (Date.parse(serverNow) - clientNow) }
}

/**
 * clockFrom, but never without a working deadline: a `serverNow` that doesn't parse
 * means no offset (the device's clock is used as is), and a `startedAt` that doesn't
 * parse means the sitting started at `fallbackStart` (client time: when Start was
 * pressed, or the page load on a resume).
 */
export function sittingClock({ startedAt, limitMinutes, serverNow }, clientNow = Date.now(), fallbackStart = clientNow) {
  const iso = ms => new Date(ms).toISOString()
  if (!Number.isFinite(Date.parse(startedAt))) {
    const start = Number.isFinite(fallbackStart) ? fallbackStart : clientNow
    return clockFrom({ startedAt: iso(start), limitMinutes, serverNow: iso(clientNow) }, clientNow)
  }
  const now = Number.isFinite(Date.parse(serverNow)) ? serverNow : iso(clientNow)
  return clockFrom({ startedAt, limitMinutes, serverNow: now }, clientNow)
}

/** Milliseconds left on the clock, never below 0. */
export function timeLeft(clock, now = Date.now()) {
  return Math.max(0, clock.deadline - now)
}

/** True once no time is left. */
export function timeUp(clock, now = Date.now()) {
  return timeLeft(clock, now) === 0
}

/** After a failed submit, retry this often while the page is open, once time is up. */
export const SUBMIT_RETRY_MS = 15000

/**
 * Milliseconds until a failed submit is retried, or null for no retry. Once
 * time is up (an auto-submit, or a manual one that fails after 0:00) the
 * student can't be relied on to press Submit again, so it keeps retrying.
 */
export function submitRetryDelay({ auto = false, clock, now = Date.now() }) {
  return auto || (clock && timeUp(clock, now)) ? SUBMIT_RETRY_MS : null
}

/** What the timer tells screen readers: the minutes left in the warning, or "Time's up" at 0:00. */
export function timerAnnouncement(left) {
  if (left <= 0) return "Time's up"
  const minutes = Math.max(1, Math.ceil(left / 60000))
  return `${minutes} minute${minutes === 1 ? '' : 's'} left`
}

/** True when five minutes or less remain and time is not yet up. */
export function inWarning(clock, now = Date.now()) {
  const left = timeLeft(clock, now)
  return left > 0 && left <= FIVE_MIN
}

/** Saved answers for this sitting, or {} when missing, corrupt, or storage is unavailable. */
export function loadAnswers(token) {
  try {
    const raw = globalThis.localStorage.getItem(answersKey(token))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** Save answers for this sitting. Storage errors are ignored: the page works without it. */
export function saveAnswers(token, answers) {
  try {
    globalThis.localStorage.setItem(answersKey(token), JSON.stringify(answers))
  } catch { /* storage unavailable */ }
}

/** Remove saved answers (and the saved name) for this sitting. Storage errors are ignored. */
export function clearAnswers(token) {
  try {
    globalThis.localStorage.removeItem(answersKey(token))
    globalThis.localStorage.removeItem(nameKey(token))
  } catch { /* storage unavailable */ }
}

/** The name typed on the start page, kept so a reload still submits it; '' when missing. */
export function loadName(token) {
  try {
    const raw = globalThis.localStorage.getItem(nameKey(token))
    return typeof raw === 'string' ? raw : ''
  } catch {
    return ''
  }
}

/** Save the name typed on the start page. Storage errors are ignored. */
export function saveName(token, name) {
  try {
    globalThis.localStorage.setItem(nameKey(token), String(name || ''))
  } catch { /* storage unavailable */ }
}
