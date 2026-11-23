import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isEnglishOnly, shortAnswerRequests, pickShortAnswers, buildTimedTest, clockFrom, timeLeft, timeUp, inWarning, loadAnswers, saveAnswers, clearAnswers, sittingClock, loadName, saveName, submitRetryDelay, SUBMIT_RETRY_MS, timerAnnouncement } from './timedDiagnostic.js'

const sa = (marks, topic, difficulty = 'moderate', n = Math.random()) => ({ type: 'marked', marks, topic, difficulty, question: `q${n}`, id: 0 })
const sum = qs => qs.reduce((s, q) => s + q.marks, 0)

test('isEnglishOnly matches the server rule', () => {
  assert.equal(isEnglishOnly([{ name: 'English' }]), true)
  assert.equal(isEnglishOnly([{ name: 'Creative Writing' }]), true)
  assert.equal(isEnglishOnly([{ name: 'Mathematics' }]), false)
  assert.equal(isEnglishOnly([{ name: 'English' }, { name: 'Physics' }]), false)
})

test('pickShortAnswers hits the target and covers each topic', () => {
  const marks = [6, 5, 5, 4, 4, 4, 3, 3, 2]
  const topics = ['A', 'A', 'B', 'B', 'C', 'C', 'A', 'B', 'C']
  const c = marks.map((m, i) => sa(m, topics[i], i % 2 ? 'exam' : 'moderate', i))
  const picked = pickShortAnswers(c)
  assert.equal(sum(picked), 30)
  assert.deepEqual([...new Set(picked.map(q => q.topic))].sort(), ['A', 'B', 'C'])
  const firstExam = picked.findIndex(q => q.difficulty === 'exam')
  assert.ok(picked.slice(firstExam).every(q => q.difficulty === 'exam'))
})

test('pickShortAnswers returns null when impossible', () => {
  assert.equal(pickShortAnswers(Array.from({ length: 8 }, (_, i) => sa(4, 'A', 'moderate', i))), null)
})

test('shortAnswerRequests covers all topics', () => {
  const topics = ['T1', 'T2', 'T3'].map(t => ({ topic: t, subtopicIds: [1, 2, 3, 4].map(i => `${t}-s${i}`) }))
  const r = shortAnswerRequests({ curriculumId: 'c', topics }, 5)
  assert.equal(r.length, 5)
  assert.deepEqual([...new Set(r.map(x => x.topic))].sort(), ['T1', 'T2', 'T3'])
  assert.ok(r.every(x => x.count === 3 && x.subtopicId))
})

const mcq = (i, difficulty) => ({ type: 'multiple_choice', marks: 1, difficulty, question: `m${i}`, id: 0 })

test('buildTimedTest survives a failed request and renumbers', async () => {
  let calls = 0
  const progress = []
  const out = await buildTimedTest(
    { yearLevel: 'Year 9', subject: { name: 'Maths', topics: [] }, scopeTopics: ['A', 'B', 'C'] },
    {
      generateMcq: async () => ({ questions: Array.from({ length: 22 }, (_, i) => mcq(i, ['exam', 'easy', 'moderate'][i % 3])) }),
      generateShortAnswers: async ({ topic }) => {
        if (++calls === 2) throw new Error('boom')
        return { questions: [sa(4, topic, 'moderate'), sa(5, topic, 'exam'), sa(3, topic, 'moderate')] }
      },
      onProgress: p => progress.push(p),
    })
  assert.equal(out.length - out.filter(q => q.type === 'marked').length, 20)
  assert.equal(sum(out.filter(q => q.type === 'marked')), 30)
  assert.deepEqual(out.map(q => q.id), out.map((_, i) => i + 1))
  const rank = { easy: 0, moderate: 1, exam: 2 }
  const mc = out.slice(0, 20)
  assert.ok(mc.every((q, i) => i === 0 || rank[mc[i - 1].difficulty] <= rank[q.difficulty]))
  assert.ok(progress.length > 2)
  assert.equal(progress.at(-1).mcq, 'done')
  assert.equal(progress.at(-1).shortDone, progress.at(-1).shortTotal)
})

test('buildTimedTest throws the exact message when 30 marks never appear', async () => {
  await assert.rejects(
    buildTimedTest(
      { yearLevel: 'Year 9', subject: { name: 'Maths' }, scopeTopics: ['A'] },
      {
        generateMcq: async () => ({ questions: Array.from({ length: 20 }, (_, i) => mcq(i, 'easy')) }),
        generateShortAnswers: async () => ({ questions: [sa(4, 'A')] }),
      }),
    { message: "Couldn't put together 30 marks of short answers. Try again." })
})

test('buildTimedTest retries a failed MCQ request once', async () => {
  let mcqCalls = 0
  const out = await buildTimedTest(
    { yearLevel: 'Year 9', subject: { name: 'Maths' }, scopeTopics: ['A', 'B', 'C'] },
    {
      generateMcq: async () => {
        if (++mcqCalls === 1) throw new Error('flaky')
        return { questions: Array.from({ length: 20 }, (_, i) => mcq(i, 'easy')) }
      },
      generateShortAnswers: async ({ topic }) => ({ questions: [sa(4, topic, 'moderate'), sa(5, topic, 'exam'), sa(3, topic, 'moderate')] }),
    })
  assert.equal(mcqCalls, 2)
  assert.equal(out.filter(q => q.type === 'multiple_choice').length, 20)
})

test('buildTimedTest fails when the MCQ request fails twice', async () => {
  let mcqCalls = 0
  await assert.rejects(
    buildTimedTest(
      { yearLevel: 'Year 9', subject: { name: 'Maths' }, scopeTopics: ['A', 'B', 'C'] },
      {
        generateMcq: async () => { mcqCalls++; throw new Error('down') },
        generateShortAnswers: async ({ topic }) => ({ questions: [sa(4, topic, 'moderate'), sa(5, topic, 'exam'), sa(3, topic, 'moderate')] }),
      }),
    { message: 'down' })
  assert.equal(mcqCalls, 2)
})

// ---- Clock and saved answers ----

const MIN = 60000
const at = iso => Date.parse(iso)

test('deadline corrects for the client clock', () => {
  // Server says 10:00, client says 10:10 (client clock 10 min fast). Started 09:55, 50 min.
  const clock = clockFrom(
    { startedAt: '2026-11-23T09:55:00Z', limitMinutes: 50, serverNow: '2026-11-23T10:00:00Z' },
    at('2026-11-23T10:10:00Z'),
  )
  assert.equal(clock.deadline, at('2026-11-23T10:55:00Z'))
})

test('timeLeft is 0 and timeUp true past the deadline', () => {
  const clock = { deadline: at('2026-11-23T10:55:00Z') }
  assert.equal(timeLeft(clock, at('2026-11-23T10:55:00Z') + 3 * MIN), 0)
  assert.equal(timeUp(clock, at('2026-11-23T10:55:00Z') + 3 * MIN), true)
  assert.equal(timeLeft(clock, at('2026-11-23T10:54:00Z')), MIN)
  assert.equal(timeUp(clock, at('2026-11-23T10:54:00Z')), false)
})

test('inWarning is true from 5 minutes down to just above 0', () => {
  const clock = { deadline: at('2026-11-23T10:55:00Z') }
  assert.equal(inWarning(clock, at('2026-11-23T10:55:00Z') - 4 * MIN - 59000), true)
  assert.equal(inWarning(clock, at('2026-11-23T10:55:00Z') - 5 * MIN - 1000), false)
  assert.equal(inWarning(clock, at('2026-11-23T10:55:00Z')), false)
  assert.equal(inWarning(clock, at('2026-11-23T10:56:00Z')), false)
})

function stubStorage(impl) {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: impl })
  return () => {
    if (prev) Object.defineProperty(globalThis, 'localStorage', prev)
    else delete globalThis.localStorage
  }
}

test('answers round-trip through localStorage under the token key', () => {
  const data = new Map()
  const restore = stubStorage(() => ({
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k),
  }))
  try {
    assert.deepEqual(loadAnswers('tok1'), {})
    saveAnswers('tok1', { 1: 'B', 21: 'the answer' })
    assert.ok(data.has('gf-diagnostic-answers:tok1'))
    assert.deepEqual(loadAnswers('tok1'), { 1: 'B', 21: 'the answer' })
    assert.deepEqual(loadAnswers('other'), {})
    clearAnswers('tok1')
    assert.deepEqual(loadAnswers('tok1'), {})
  } finally { restore() }
})

test('loadAnswers returns {} for corrupt JSON and when storage throws', () => {
  const restore = stubStorage(() => ({ getItem: () => '{not json', setItem() {}, removeItem() {} }))
  try { assert.deepEqual(loadAnswers('tok'), {}) } finally { restore() }

  const restore2 = stubStorage(() => { throw new Error('denied') })
  try {
    assert.deepEqual(loadAnswers('tok'), {})
    assert.doesNotThrow(() => saveAnswers('tok', { 1: 'A' }))
    assert.doesNotThrow(() => clearAnswers('tok'))
  } finally { restore2() }
})

test('sittingClock matches clockFrom when both times parse', () => {
  const args = { startedAt: '2026-11-23T09:55:00Z', limitMinutes: 50, serverNow: '2026-11-23T10:00:00Z' }
  assert.deepEqual(sittingClock(args, at('2026-11-23T10:10:00Z')), clockFrom(args, at('2026-11-23T10:10:00Z')))
})

test('sittingClock uses no offset when serverNow does not parse', () => {
  for (const serverNow of [undefined, null, '', 'nonsense']) {
    const clock = sittingClock({ startedAt: '2026-11-23T10:00:00Z', limitMinutes: 50, serverNow }, at('2026-11-23T10:10:00Z'))
    assert.equal(clock.deadline, at('2026-11-23T10:50:00Z'))
  }
})

test('sittingClock starts from the fallback client time when startedAt does not parse', () => {
  for (const startedAt of [undefined, null, '', 'nonsense']) {
    const clock = sittingClock({ startedAt, limitMinutes: 50, serverNow: '2026-11-23T12:00:00Z' }, at('2026-11-23T10:10:00Z'), at('2026-11-23T10:05:00Z'))
    assert.equal(clock.deadline, at('2026-11-23T10:55:00Z'))
  }
  // No fallback given: the client time now.
  const clock = sittingClock({ startedAt: null, limitMinutes: 50, serverNow: null }, at('2026-11-23T10:10:00Z'))
  assert.equal(clock.deadline, at('2026-11-23T11:00:00Z'))
})

test('sittingClock always gives a finite deadline', () => {
  const clock = sittingClock({ startedAt: 'x', limitMinutes: 50, serverNow: 'y' }, at('2026-11-23T10:00:00Z'), NaN)
  assert.equal(clock.deadline, at('2026-11-23T10:50:00Z'))
})

test('the name round-trips and clearAnswers removes it too', () => {
  const data = new Map()
  const restore = stubStorage(() => ({
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k),
  }))
  try {
    assert.equal(loadName('tok1'), '')
    saveName('tok1', 'Sam Lee')
    saveAnswers('tok1', { 1: 'A' })
    assert.equal(loadName('tok1'), 'Sam Lee')
    assert.equal(loadName('tok2'), '')
    clearAnswers('tok1')
    assert.equal(loadName('tok1'), '')
    assert.deepEqual(loadAnswers('tok1'), {})
  } finally { restore() }

  const restore2 = stubStorage(() => { throw new Error('denied') })
  try {
    assert.equal(loadName('tok'), '')
    assert.doesNotThrow(() => saveName('tok', 'Sam'))
  } finally { restore2() }
})

test('a failed submit retries every 15 s once time is up, and not before', () => {
  const clock = { deadline: at('2026-11-23T10:55:00Z') }
  assert.equal(SUBMIT_RETRY_MS, 15000)
  assert.equal(submitRetryDelay({ auto: true, clock, now: at('2026-11-23T10:55:00Z') }), 15000)
  // A manual submit that fails after 0:00 retries too (time ran out while it was in flight).
  assert.equal(submitRetryDelay({ clock, now: at('2026-11-23T10:55:01Z') }), 15000)
  // Before 0:00 the student presses Submit again themselves.
  assert.equal(submitRetryDelay({ clock, now: at('2026-11-23T10:50:00Z') }), null)
  assert.equal(submitRetryDelay({ clock: null }), null)
})

test('the timer announces minutes left in the warning and "Time\'s up" at 0:00', () => {
  assert.equal(timerAnnouncement(5 * MIN), '5 minutes left')
  assert.equal(timerAnnouncement(4 * MIN + 1), '5 minutes left')
  assert.equal(timerAnnouncement(30000), '1 minute left')
  assert.equal(timerAnnouncement(0), "Time's up")
})
