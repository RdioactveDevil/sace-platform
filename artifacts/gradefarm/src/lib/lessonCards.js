// Guided lessons as a run of cards, one on screen at a time: an intro, then
// each key idea followed by a quick question on it, the worked example, a
// final challenge, and the wrap-up. Learn something, try it straight away.
//
// Lesson content (learn_lessons.content) has { v: 2 } for this format. Older
// lessons had all the ideas on one screen and their questions at the end;
// upgradeLesson() turns their progress into card progress so they still open
// where the student left off. Progress is kept in the existing columns:
// check_index is the card, answers holds one entry per question card in order:
// { ok, picked } (older lessons stored just true/false).

export const LESSON_VERSION = 2

/** The cards for a lesson's content. Each question card has a `slot` in `answers`. */
export function buildCards(data) {
  if (!data) return []
  const cards = [{ type: 'intro' }]
  let slot = 0
  const ideas = data.ideas || []
  ideas.forEach((idea, i) => {
    cards.push({ type: 'idea', idea, n: i + 1, of: ideas.length })
    if (idea.check) cards.push({ type: 'check', check: idea.check, slot: slot++, quick: true })
  })
  cards.push({ type: 'example' })
  ;(data.checks || []).forEach((check, i, all) => cards.push({ type: 'check', check, slot: slot++, quick: false, n: i + 1, of: all.length }))
  cards.push({ type: 'wrap' })
  return cards
}

/** Which of the old four steps a card is in (learn_lessons.step allows 0–3). */
export function stepOfCard(cards, card) {
  const c = cards[card]
  if (!c) return 0
  if (c.type === 'wrap') return 3
  if (c.type === 'check' && !c.quick) return 2
  if (c.type === 'example') return 1
  return 0
}

/** Bring an older saved lesson onto cards, keeping where they were. */
export function upgradeLesson(lesson) {
  if (!lesson?.data || lesson.data.v === LESSON_VERSION) return lesson
  const data = { ...lesson.data, v: LESSON_VERSION }
  const cards = buildCards(data)
  const find = (pred) => Math.max(0, cards.findIndex(pred))
  const step = lesson.step ?? 0
  const card = lesson.finishedAt || step >= 3 ? cards.length - 1
    : step === 2 ? find(c => c.type === 'check' && !c.quick && c.slot === (lesson.checkIndex ?? 0))
    : step === 1 ? find(c => c.type === 'example')
    : find(c => c.type === 'idea')
  // Old lessons only had end-of-lesson questions, so their answers already
  // line up with the question cards.
  return { ...lesson, data, card, step: stepOfCard(cards, card) }
}

/** The answer saved for a question slot as { ok, picked }, or null if not answered yet. */
export function answerAt(answers, slot) {
  const a = (answers || [])[slot]
  if (a === true || a === false) return { ok: a, picked: null }
  if (a && typeof a === 'object' && typeof a.ok === 'boolean') return { ok: a.ok, picked: Number.isInteger(a.picked) ? a.picked : null }
  return null
}

/** Answers with this slot set (gaps before it left empty). */
export function withAnswer(answers, slot, ok, picked) {
  const next = [...(answers || [])]
  while (next.length < slot) next.push(null)
  next[slot] = { ok, picked }
  return next
}

/** Right answers and the number of questions in the lesson. */
export function lessonScore(lesson) {
  const total = buildCards(lesson?.data).filter(c => c.type === 'check').length
  const right = (lesson?.answers || []).filter((_, i) => answerAt(lesson.answers, i)?.ok).length
  return { right, total }
}

/** How many right answers in a row end at this slot (for the streak sound). */
export function runEndingAt(answers, slot) {
  let run = 0
  for (let i = slot; i >= 0 && answerAt(answers, i)?.ok; i--) run++
  return run
}

/** "Step 4 of 13" for lesson lists, or "Done". */
export function lessonProgressLabel(lesson) {
  if (lesson?.finishedAt) return 'Done'
  const up = upgradeLesson(lesson)
  const cards = buildCards(up?.data)
  if (!cards.length) return ''
  return `Step ${Math.min((up.card ?? 0) + 1, cards.length)} of ${cards.length}`
}

/** A check question from the model, or null if it isn't usable. */
export function cleanCheck(c) {
  if (!c || !c.question || !Array.isArray(c.options) || c.options.length < 2) return null
  if (!Number.isInteger(c.answer_index) || c.answer_index < 0 || c.answer_index >= c.options.length) return null
  return { question: c.question, options: c.options, answer_index: c.answer_index, explanation: c.explanation || '' }
}

/** Lesson JSON from the model, checked and tidied, or null. */
export function parseLessonJson(raw) {
  const s = String(raw || '')
  const start = s.indexOf('{'), end = s.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let d
  try { d = JSON.parse(s.slice(start, end + 1)) } catch { return null }
  const ideas = (d.ideas || []).filter(i => i && i.title && i.text).map(i => ({
    title: i.title, text: i.text,
    ...(i.example && { example: i.example }),
    ...(i.watch_out && { watch_out: i.watch_out }),
    ...(cleanCheck(i.check) && { check: cleanCheck(i.check) }),
  }))
  const steps = (d.example?.steps || []).filter(st => st && st.work)
  const checks = (d.checks || []).map(cleanCheck).filter(Boolean)
  if (!ideas.length || !steps.length) return null
  if (!checks.length && !ideas.some(i => i.check)) return null
  return {
    v: LESSON_VERSION,
    title: d.title || '',
    ...(d.hook && { hook: d.hook }),
    ideas,
    example: { problem: d.example.problem || '', steps },
    checks,
    summary: (d.summary || []).filter(Boolean),
  }
}
