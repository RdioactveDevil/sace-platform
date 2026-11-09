import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCards, stepOfCard, upgradeLesson, lessonScore, runEndingAt, lessonProgressLabel, parseLessonJson, answerAt, withAnswer } from './lessonCards.js'

const q = (n) => ({ question: `Q${n}`, options: ['a', 'b', 'c', 'd'], answer_index: 1, explanation: 'why' })
const v2 = {
  v: 2, title: 'Logs',
  ideas: [{ title: 'A', text: 'a', check: q(1) }, { title: 'B', text: 'b', check: q(2) }, { title: 'C', text: 'c' }],
  example: { problem: 'p', steps: [{ work: 'w' }] },
  checks: [q(3), q(4)],
  summary: ['s'],
}
const old = {
  title: 'Logs',
  ideas: [{ title: 'A', text: 'a' }, { title: 'B', text: 'b' }],
  example: { problem: 'p', steps: [{ work: 'w' }] },
  checks: [q(1), q(2), q(3)],
  summary: [],
}

test('cards: intro, each idea then its question, example, final questions, wrap-up', () => {
  const cards = buildCards(v2)
  assert.deepEqual(cards.map(c => c.type), ['intro', 'idea', 'check', 'idea', 'check', 'idea', 'example', 'check', 'check', 'wrap'])
  assert.deepEqual(cards.filter(c => c.type === 'check').map(c => c.slot), [0, 1, 2, 3])
  assert.deepEqual(cards.filter(c => c.type === 'check').map(c => c.quick), [true, true, false, false])
})

test('each card maps onto one of the four stored steps', () => {
  const cards = buildCards(v2)
  assert.deepEqual(cards.map((_, i) => stepOfCard(cards, i)), [0, 0, 0, 0, 0, 0, 1, 2, 2, 3])
})

test('older lessons open where the student left off', () => {
  const cards = buildCards({ ...old, v: 2 })
  const at = (lesson) => cards[upgradeLesson(lesson).card]
  assert.equal(at({ data: old, step: 0 }).type, 'idea')
  assert.equal(at({ data: old, step: 1 }).type, 'example')
  const c = at({ data: old, step: 2, checkIndex: 1 })
  assert.equal(c.type, 'check')
  assert.equal(c.slot, 1)
  assert.equal(at({ data: old, step: 3, finishedAt: 1 }).type, 'wrap')
  assert.equal(upgradeLesson({ data: old, step: 0 }).data.v, 2)
  const already = { data: v2, card: 4 }
  assert.equal(upgradeLesson(already), already)
})

test('score, streak runs and progress labels', () => {
  assert.deepEqual(lessonScore({ data: v2, answers: [true, false, true] }), { right: 2, total: 4 })
  assert.equal(runEndingAt([true, true, false, true, true, true], 5), 3)
  assert.equal(runEndingAt([true, false], 1), 0)
  assert.equal(lessonProgressLabel({ data: v2, card: 3 }), 'Step 4 of 10')
  assert.equal(lessonProgressLabel({ data: old, step: 1 }), 'Step 4 of 8')
  assert.equal(lessonProgressLabel({ data: v2, finishedAt: 1 }), 'Done')
})

test('parsing the model reply keeps good questions and drops bad ones', () => {
  const raw = 'Here you go:\n' + JSON.stringify({
    title: 'Logs', hook: 'Why logs?',
    ideas: [
      { title: 'A', text: 'a', watch_out: 'w', check: q(1) },
      { title: 'B', text: 'b', check: { question: 'bad', options: ['x'], answer_index: 0 } },
      { title: '', text: 'no title' },
    ],
    example: { problem: 'p', steps: [{ work: 'w' }, { note: 'no work' }] },
    checks: [q(2), { question: 'bad', options: ['a', 'b'], answer_index: 5 }],
    summary: ['s', ''],
  })
  const d = parseLessonJson(raw)
  assert.equal(d.v, 2)
  assert.equal(d.hook, 'Why logs?')
  assert.equal(d.ideas.length, 2)
  assert.equal(d.ideas[0].watch_out, 'w')
  assert.ok(d.ideas[0].check)
  assert.equal(d.ideas[1].check, undefined)
  assert.equal(d.example.steps.length, 1)
  assert.equal(d.checks.length, 1)
  assert.deepEqual(d.summary, ['s'])
  assert.equal(parseLessonJson('not json'), null)
  assert.equal(parseLessonJson(JSON.stringify({ ideas: [{ title: 'A', text: 'a' }], example: { steps: [{ work: 'w' }] }, checks: [] })), null)
})

test('answers keep the pick, and old true/false answers still count', () => {
  const a = withAnswer([], 2, true, 3)
  assert.deepEqual(a, [null, null, { ok: true, picked: 3 }])
  assert.deepEqual(answerAt(a, 2), { ok: true, picked: 3 })
  assert.equal(answerAt(a, 0), null)
  assert.deepEqual(answerAt([false], 0), { ok: false, picked: null })
  assert.deepEqual(lessonScore({ data: v2, answers: [{ ok: true, picked: 1 }, true, { ok: false, picked: 0 }] }), { right: 2, total: 4 })
  assert.equal(runEndingAt([true, { ok: true, picked: 1 }], 1), 2)
})

test('Titan is told exactly which card is on screen', async () => {
  const { describeLessonCard, cardLabel } = await import('./lessonCards.js')
  const cards = buildCards(v2)
  assert.equal(cardLabel(cards, 1), 'Step 2 of 10 · Key idea 1 of 3: A')
  assert.equal(cardLabel(cards, 7), 'Step 8 of 10 · Final challenge 1 of 2')

  const idea = describeLessonCard({ topic: 'Logs', data: { ...v2, ideas: [{ ...v2.ideas[0], example: 'ex', watch_out: 'careful' }, ...v2.ideas.slice(1)] }, card: 1 })
  assert.match(idea, /CARD ON SCREEN NOW: Step 2 of 10 · Key idea 1 of 3: A/)
  assert.match(idea, /Example shown: ex/)
  assert.match(idea, /"Watch out" note shown: careful/)
  assert.match(idea, /→ Step 2 of 10/)

  const unanswered = describeLessonCard({ data: v2, card: 2, picked: 2, answers: [] })
  assert.match(unanswered, /Question: Q1/)
  assert.match(unanswered, /C\. c/)
  assert.match(unanswered, /NOT answered/)
  assert.match(unanswered, /selected C/)

  const answered = describeLessonCard({ data: v2, card: 2, answers: [{ ok: false, picked: 0 }] })
  assert.match(answered, /answered A and was wrong/)

  const example = describeLessonCard({ data: { ...v2, example: { problem: 'p', steps: [{ work: 'w1', note: 'n1' }, { work: 'w2' }] } }, card: 6, revealed: 1 })
  assert.match(example, /revealed lines 1 to 1 of 2/)
  assert.match(example, /Line 1: w1 \(why: n1\)/)
  assert.match(example, /Line 2 \(not revealed yet\): w2/)
})
