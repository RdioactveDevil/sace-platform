// The test maker: a printable practice test drawn from the subject's question
// bank (TestMakerScreen.jsx). Pure functions so the choice of questions can be
// tested and repeated: the same settings and seed give the same paper.

import { getQuestionType, totalMarks } from './questionTypes.js'
import { questionContentKey } from './engine.js'

/** Question types that work on paper. Click-the-region and label-the-diagram need a screen. */
export const PRINTABLE_TYPES = new Set(['mcq', 'multi_select', 'numeric', 'short_text', 'order', 'marked'])

export const DIFFICULTIES = {
  mixed: { label: 'Mixed', test: () => true },
  easier: { label: 'Easier', test: (d) => d <= 2 },
  medium: { label: 'Medium', test: (d) => d === 3 },
  harder: { label: 'Harder', test: (d) => d >= 4 },
}

/** Minutes per mark: VCE exams run at about 1.5 minutes a mark. */
export const MINUTES_PER_MARK = 1.5

export const isPrintable = (q) => PRINTABLE_TYPES.has(getQuestionType(q)) && !q.passage_id && !!q.question

/** Marks a question is worth on the paper. */
export function questionMarks(q) {
  if (getQuestionType(q) === 'marked') return totalMarks(q) || 1
  const n = Number(q.total_marks)
  return n > 0 ? n : 1
}

/** "VCAA 2024 Exam 1, Q5" for past-exam questions, else ''. */
export function sourceLabel(q) {
  if (!q?.source) return ''
  return q.source_question ? `${q.source}, Q${String(q.source_question).replace(/^q/i, '')}` : q.source
}

/** Years of past-exam questions in a set of questions, newest first. */
export function sourceYears(questions) {
  return [...new Set((questions || []).filter(q => q.source && Number(q.source_year)).map(q => Number(q.source_year)))].sort((a, b) => b - a)
}

/**
 * The questions a test can be made from: printable, in the chosen subtopics
 * (none = all), at the chosen difficulty, from past exams only if asked (and
 * from the chosen years), with word-for-word duplicates removed.
 */
export function testPool(questions, { subtopics = [], difficulty = 'mixed', pastOnly = false, years = [] } = {}) {
  const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.mixed
  const seen = new Set()
  return (questions || []).filter(q => {
    if (!isPrintable(q)) return false
    if (subtopics.length && !subtopics.includes(q.subtopic)) return false
    if (!diff.test(Number(q.difficulty) || 3)) return false
    if (pastOnly && !q.source) return false
    if (years.length && !years.includes(Number(q.source_year))) return false
    const key = questionContentKey(q) || q.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** A small seeded random number generator (mulberry32), so a paper can be rebuilt. */
export function seededRandom(seed) {
  let a = (Number(seed) >>> 0) || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle(list, rand) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Pick `count` questions from the pool, spread evenly across its topics
 * (taking turns, so one big topic doesn't crowd out the rest), then put them
 * in topic order with easier questions first inside each topic. Questions the
 * student hasn't answered yet go first when `unseenFirst` says so.
 */
export function pickTestQuestions(pool, { count = 20, seed = 1, unseenFirst = null } = {}) {
  const rand = seededRandom(seed)
  const byTopic = new Map()
  for (const q of shuffle(pool, rand)) {
    const key = q.topic || q.subtopic || ''
    if (!byTopic.has(key)) byTopic.set(key, [])
    byTopic.get(key).push(q)
  }
  if (unseenFirst) {
    for (const list of byTopic.values()) list.sort((a, b) => Number(unseenFirst(b)) - Number(unseenFirst(a)))
  }
  const topics = [...byTopic.keys()]
  const picked = []
  for (let round = 0; picked.length < count; round++) {
    let took = false
    for (const tp of topics) {
      const q = byTopic.get(tp)[round]
      if (q && picked.length < count) { picked.push(q); took = true }
    }
    if (!took) break
  }
  // Topics in the order they first appear in the bank, so the paper follows the course.
  const bankOrder = new Map()
  pool.forEach(q => { const k = q.topic || q.subtopic || ''; if (!bankOrder.has(k)) bankOrder.set(k, bankOrder.size) })
  const topicOf = (q) => bankOrder.get(q.topic || q.subtopic || '')
  return picked.sort((a, b) => topicOf(a) - topicOf(b) || (Number(a.difficulty) || 3) - (Number(b.difficulty) || 3))
}

/** Total marks and a suggested time in minutes (rounded up to 5). */
export function paperTotals(questions) {
  const marks = (questions || []).reduce((sum, q) => sum + questionMarks(q), 0)
  const minutes = marks ? Math.max(5, Math.ceil((marks * MINUTES_PER_MARK) / 5) * 5) : 0
  return { marks, minutes }
}

/** Lines of working space for a question on paper. */
export function answerLines(q) {
  const type = getQuestionType(q)
  if (type === 'marked') return Math.min(14, Math.max(3, questionMarks(q) * 3))
  if (type === 'numeric' || type === 'short_text') return 2
  return 0
}
