import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testPool, pickTestQuestions, paperTotals, questionMarks, sourceLabel, sourceYears, answerLines, isPrintable, seededRandom } from './testMaker.js'

const mk = (id, extra = {}) => ({ id, question: `Q ${id}`, options: ['a', 'b', 'c', 'd'], answer_index: 0, topic: 'T1', subtopic: 'S1', difficulty: 3, ...extra })

test('only printable questions, without passages or duplicates', () => {
  const qs = [
    mk('1'),
    mk('2', { question_type: 'hotspot' }),
    mk('3', { question_type: 'image_label' }),
    mk('4', { passage_id: 'p1' }),
    mk('5', { question: 'Q 1' }),
    mk('6', { question_type: 'numeric', answer: 4 }),
    mk('7', { question_type: 'marked', total_marks: 3 }),
  ]
  assert.deepEqual(testPool(qs).map(q => q.id), ['1', '6', '7'])
  assert.equal(isPrintable(mk('8', { question_type: 'order', items: ['x', 'y'] })), true)
})

test('pool filters: subtopics, difficulty, past exams and years', () => {
  const qs = [
    mk('a', { subtopic: 'S1', difficulty: 1 }),
    mk('b', { subtopic: 'S2', difficulty: 5, source: 'VCAA 2024 Exam 1', source_year: 2024, source_question: '5' }),
    mk('c', { subtopic: 'S2', difficulty: 3, source: 'VCAA 2023 Exam 2', source_year: 2023 }),
  ]
  assert.deepEqual(testPool(qs, { subtopics: ['S2'] }).map(q => q.id), ['b', 'c'])
  assert.deepEqual(testPool(qs, { difficulty: 'easier' }).map(q => q.id), ['a'])
  assert.deepEqual(testPool(qs, { difficulty: 'harder' }).map(q => q.id), ['b'])
  assert.deepEqual(testPool(qs, { pastOnly: true }).map(q => q.id), ['b', 'c'])
  assert.deepEqual(testPool(qs, { years: [2023] }).map(q => q.id), ['c'])
  assert.deepEqual(sourceYears(qs), [2024, 2023])
  assert.equal(sourceLabel(qs[1]), 'VCAA 2024 Exam 1, Q5')
  assert.equal(sourceLabel(qs[2]), 'VCAA 2023 Exam 2')
  assert.equal(sourceLabel(qs[0]), '')
})

test('questions are spread across topics, in course order, easier first', () => {
  const pool = [
    ...Array.from({ length: 10 }, (_, i) => mk(`x${i}`, { topic: 'Big', difficulty: (i % 5) + 1 })),
    mk('y1', { topic: 'Small' }), mk('y2', { topic: 'Small' }),
  ]
  const picked = pickTestQuestions(pool, { count: 6, seed: 7 })
  assert.equal(picked.length, 6)
  assert.equal(picked.filter(q => q.topic === 'Small').length, 2)
  assert.deepEqual([...new Set(picked.map(q => q.topic))], ['Big', 'Small'])
  const bigDiffs = picked.filter(q => q.topic === 'Big').map(q => q.difficulty)
  assert.deepEqual(bigDiffs, [...bigDiffs].sort((a, b) => a - b))
})

test('same seed, same paper; new seed, new paper; never more than the pool', () => {
  const pool = Array.from({ length: 30 }, (_, i) => mk(`q${i}`, { topic: `T${i % 3}` }))
  const ids = (seed) => pickTestQuestions(pool, { count: 10, seed }).map(q => q.id).join()
  assert.equal(ids(3), ids(3))
  assert.notEqual(ids(3), ids(4))
  assert.equal(pickTestQuestions(pool.slice(0, 4), { count: 10 }).length, 4)
})

test('unseen questions are picked first when asked', () => {
  const pool = Array.from({ length: 6 }, (_, i) => mk(`q${i}`))
  const picked = pickTestQuestions(pool, { count: 2, seed: 1, unseenFirst: q => q.id === 'q4' || q.id === 'q5' })
  assert.deepEqual(picked.map(q => q.id).sort(), ['q4', 'q5'])
})

test('marks, time and working space', () => {
  const qs = [mk('1'), mk('2', { question_type: 'marked', total_marks: 4 }), mk('3', { question_type: 'numeric' })]
  assert.equal(questionMarks(qs[1]), 4)
  assert.deepEqual(paperTotals(qs), { marks: 6, minutes: 10 })
  assert.deepEqual(paperTotals([]), { marks: 0, minutes: 0 })
  assert.equal(answerLines(qs[0]), 0)
  assert.equal(answerLines(qs[1]), 12)
  assert.equal(answerLines(qs[2]), 2)
})

test('seeded random is stable and in range', () => {
  const r = seededRandom(42)
  const xs = Array.from({ length: 5 }, r)
  assert.deepEqual(xs, Array.from({ length: 5 }, seededRandom(42)))
  assert.ok(xs.every(x => x >= 0 && x < 1))
})
