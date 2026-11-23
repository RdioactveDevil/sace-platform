import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markedResult, partScores, timeTakenMinutes } from './timedReport.js'
import { presentModel } from './presentReport.js'

const points = [{ point: 0, awarded: 1, of: 1, evidence: 'x', found: true, comment: 'Good' }, { point: 1, awarded: 0, of: 2, evidence: '', found: false, comment: 'Missing' }]

test('markedResult adapts a stored entry for the mark-point components', () => {
  assert.deepEqual(markedResult({ points, marks_awarded: 1, marks_possible: 3, feedback: 'Tip' }), { marks: points, awarded: 1, total: 3, summary: 'Tip' })
  assert.equal(markedResult({ marks_awarded: 1, marks_possible: 3 }), null)
  assert.equal(markedResult({ points: [] }), null)
  assert.equal(markedResult(null), null)
})

test('partScores splits multiple choice from short answer', () => {
  const qs = [{ id: 1, type: 'multiple_choice' }, { id: 2, type: 'multiple_choice' }, { id: 3, type: 'marked' }]
  const res = [
    { id: 1, marks_awarded: 1, marks_possible: 1 },
    { id: 2, marks_awarded: 0, marks_possible: 1 },
    { id: 3, marks_awarded: 2, marks_possible: 4 },
  ]
  assert.deepEqual(partScores(qs, res), { part1: 1, part1Max: 2, part2: 2, part2Max: 4 })
})

test('timeTakenMinutes rounds and guards bad input', () => {
  assert.equal(timeTakenMinutes('2026-11-23T10:00:00Z', '2026-11-23T10:42:20Z'), 42)
  assert.equal(timeTakenMinutes('2026-11-23T10:00:00Z', '2026-11-23T10:00:05Z'), 1)
  assert.equal(timeTakenMinutes(null, '2026-11-23T10:00:00Z'), null)
  assert.equal(timeTakenMinutes('2026-11-23T11:00:00Z', '2026-11-23T10:00:00Z'), null)
})

test('the call presentation handles a marked question without marking detail', () => {
  const a = { subjects: [{ name: 'Maths' }], questions: [{ id: 1, type: 'marked', question: 'Q', marking_scheme: [{ point: 'SECRET', marks: 2 }], solution: 'SECRET2' }] }
  const r = { question_results: [{ id: 1, student_answer: 'ans', marks_awarded: 1, marks_possible: 2, points, feedback: 'SECRET3' }] }
  const m = presentModel(a, r)
  assert.equal(m.questions[0].marks, 1)
  assert.equal(m.questions[0].marksPossible, 2)
  assert.equal(m.questions[0].correctAnswer, '')
  assert.ok(!JSON.stringify(m).includes('SECRET'))
})
