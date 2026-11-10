import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snapshotOf, partRows, tally, byQuestion, byTopic, summary, cleanMark, skippedParts, questionsToRedo, seenQuestionIds, previousPercent, shortTitle, SKIP } from './examMarking.js'
import { pickExam, examPool, swapCandidate } from './examBuilder.js'

const mc = (id, topic = 'T1') => ({ id, question: `MC ${id}`, options: ['a', 'b', 'c', 'd'], answer_index: 0, question_type: 'mcq', topic })
const ext = (id, parts, topic = 'T1', extra = {}) => ({ id, question: `Stem of ${id}. More text.`, question_type: 'extended', topic, parts, ...extra })
const P = (label, marks, level = 1, text = `part ${label}`) => ({ label, text, marks, level })

const gallium = ext('g', [P('a', 0), P('i', 1, 2), P('iv', 0, 2), P('1', 1, 3), P('2', 2, 3), P('b', 3)], 'Redox', { source: 'SACE Board 2024 Exam', source_question: '6' })
const brandy = ext('b', [P('a', 2), P('b', 3)], 'Organic')

test('a snapshot labels parts as the solutions book does and leaves out parts with no marks', () => {
  const s = snapshotOf({ A: [], B: [gallium, brandy] }, { title: 'Exam 1', subject: 'Chem', board: 'sace' })
  assert.equal(s.title, 'Exam 1')
  assert.deepEqual(s.questions.map(q => [q.number, q.marks, q.topic]), [['1', 7, 'Redox'], ['2', 5, 'Organic']])
  assert.deepEqual(s.questions[0].parts.map(p => [p.key, p.label, p.marks]), [['g#1', '(a)(i)', 1], ['g#3', '(a)(iv)(1)', 1], ['g#4', '(a)(iv)(2)', 2], ['g#5', '(b)', 3]])
  assert.equal(s.questions[0].source, 'SACE Board 2024 Exam, Q6')
  assert.equal(s.questions[0].title, 'Stem of g.')
  assert.equal(partRows(s).length, 6)
})

test('numbers: SACE counts on through both sections, VCE starts again in Section B', () => {
  const exam = { A: [mc('m1'), mc('m2')], B: [brandy] }
  assert.deepEqual(snapshotOf(exam, { board: 'sace' }).questions.map(q => q.number), ['1', '2', '3'])
  assert.deepEqual(snapshotOf(exam, { board: 'vce' }).questions.map(q => q.number), ['A1', 'A2', 'B1'])
  assert.deepEqual(snapshotOf({ A: [], B: [brandy, gallium] }, { board: 'vce' }).questions.map(q => q.number), ['1', '2'])
  assert.deepEqual(snapshotOf(exam, { board: 'sace' }).questions[0].parts, [{ key: 'm1#0', label: '', marks: 1, text: '' }])
})

test('marks are whole numbers from 0 to the part total, or skipped', () => {
  assert.equal(cleanMark(2, 2), 2)
  assert.equal(cleanMark('1', 2), 1)
  assert.equal(cleanMark(0, 2), 0)
  assert.equal(cleanMark(SKIP, 2), SKIP)
  assert.equal(cleanMark(3, 2), undefined)
  assert.equal(cleanMark(1.5, 2), undefined)
  assert.equal(cleanMark(-1, 2), undefined)
  assert.equal(cleanMark(null, 2), undefined)
  assert.equal(cleanMark(undefined, 2), undefined)
})

test('a tally keeps skipped marks apart from marks lost on an answer', () => {
  const s = snapshotOf({ A: [], B: [gallium, brandy] })
  const marks = { 'g#1': 1, 'g#3': 0, 'g#4': SKIP, 'g#5': 2, 'b#0': 2, 'b#1': 9 }
  const t = tally(s, marks)
  assert.deepEqual(
    { scored: t.scored, lost: t.lost, skipped: t.skipped, available: t.available, entered: t.entered, parts: t.parts, complete: t.complete },
    { scored: 5, lost: 2, skipped: 2, available: 12, entered: 5, parts: 6, complete: false },
  )
  assert.equal(t.percent, 42)
  assert.equal(t.answeredPercent, 71)
  assert.equal(tally(s, { ...marks, 'b#1': 3 }).complete, true)
  assert.deepEqual(byQuestion(s, marks).map(q => [q.number, q.scored, q.skipped, q.max, q.entered]), [['1', 3, 2, 7, 4], ['2', 2, 0, 5, 1]])
  assert.deepEqual(skippedParts(s, marks), ['(a)(iv)(2) in Question 1'])
  assert.deepEqual(questionsToRedo(s, marks, 'lost'), ['g'])
  assert.deepEqual(questionsToRedo(s, marks, 'skipped'), ['g'])
  assert.deepEqual(questionsToRedo(s, { 'b#0': 1 }, 'lost'), ['b'])
})

test('dashboard figures come from marked attempts only, oldest first', () => {
  const s = snapshotOf({ A: [], B: [gallium, brandy] })
  const a1 = { id: 'a1', status: 'marked', marked_at: '2026-10-01', scored: 6, available: 12, skipped: 0, snapshot: s, marks: { 'g#1': 1, 'g#3': 1, 'g#4': 0, 'g#5': 0, 'b#0': 2, 'b#1': 2 }, question_ids: ['g', 'b'] }
  const a2 = { id: 'a2', status: 'marked', marked_at: '2026-10-08', scored: 9, available: 12, skipped: 3, snapshot: s, marks: { 'g#1': 1, 'g#3': 1, 'g#4': 2, 'g#5': 3, 'b#0': 2, 'b#1': SKIP }, question_ids: ['g', 'b'] }
  const a3 = { id: 'a3', status: 'not_marked', scored: 0, available: 12, skipped: 0, snapshot: s, marks: {}, question_ids: ['x'] }
  const sum = summary([a3, a2, a1])
  assert.equal(sum.marked, 2)
  assert.equal(sum.waiting, 1)
  assert.equal(sum.average, 63)
  assert.equal(sum.latest.id, 'a2')
  assert.equal(sum.latest.percent, 75)
  assert.equal(sum.change, 25)
  assert.equal(sum.skippedPercent, 13)
  assert.deepEqual(sum.trend.map(x => [x.id, x.percent, x.skippedPercent]), [['a1', 50, 0], ['a2', 75, 25]])
  assert.deepEqual(summary([a3]), { marked: 0, waiting: 1, average: null, latest: null, change: null, skippedPercent: null, trend: [] })
  assert.equal(previousPercent([a1, a2], a2), 50)
  assert.equal(previousPercent([a1, a2], a1), null)
  // Topics: skipped parts count as marks not earned.
  assert.deepEqual(byTopic([a1, a2, a3]).map(r => [r.topic, r.scored, r.max, r.percent]), [['Organic', 6, 10, 60], ['Redox', 9, 14, 64]])
  assert.deepEqual([...seenQuestionIds([a1, a3])].sort(), ['b', 'g', 'x'])
})

test('a short title is the first sentence without maths', () => {
  assert.equal(shortTitle('Gallium, the element with atomic number 31, is a soft metal. More.'), 'Gallium, the element with atomic number 31, is a soft metal.')
  assert.equal(shortTitle('Find $x$ when $\\frac{1}{2}$ is used.'), 'Find when is used.')
  assert.equal(shortTitle('a'.repeat(80), 20), `${'a'.repeat(19)}…`)
})

test('new exams and swaps use questions the student has not seen first', () => {
  const qs = ['1', '2', '3', '4', '5', '6'].map(id => ext(id, [P('a', 2)], `T${id}`))
  const pool = examPool(qs)
  const seen = new Set(['1', '2', '3'])
  for (let seed = 1; seed < 20; seed++) {
    const picked = pickExam(pool, { mcCount: 0, bMarks: 6, seed, seen })
    assert.deepEqual([...picked.B].sort(), ['4', '5', '6'])
  }
  // Without enough fresh questions, seen ones fill the rest.
  const more = pickExam(pool, { mcCount: 0, bMarks: 10, seed: 3, seen })
  assert.equal(more.B.length, 5)
  assert.ok(['4', '5', '6'].every(id => more.B.includes(id)))
  // Nothing seen: same as before.
  assert.deepEqual(pickExam(pool, { mcCount: 0, bMarks: 6, seed: 7 }), pickExam(pool, { mcCount: 0, bMarks: 6, seed: 7, seen: new Set() }))
  const swap = swapCandidate(pool, qs[3], ['4', '5'], 1, seen)
  assert.equal(swap.id, '6')
  assert.ok(['1', '2', '3'].includes(swapCandidate(pool, qs[3], ['4', '5', '6'], 1, seen).id))
})
