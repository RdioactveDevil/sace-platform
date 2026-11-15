import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterSubjectQuestions, questionSource } from './subjectQuestions.js'

const rows = [
  { id: 'q1', topic: 'Quadratics', subtopic: 'The discriminant', question: 'For what values of k does kx^2 + 4x + 1 = 0 have two solutions?', difficulty: 4, source_kind: 'official', source: '2023 VCAA Exam 2' },
  { id: 'q2', topic: 'Quadratics', subtopic: 'Completing the square', question: 'Express x^2 + 6x + 2 in the form (x + a)^2 + b.', difficulty: 2 },
  { id: 'q3', topic: 'Integration', subtopic: 'Signed area', question: 'Find the signed area under y = x - 2 from 0 to 4.', difficulty: 3, question_type: 'marked' },
]
const ids = r => r.map(q => q.id)

test('where a question came from', () => {
  assert.equal(questionSource(rows[0]), 'paper')
  assert.equal(questionSource(rows[1]), 'ai')
  assert.equal(questionSource({ source_kind: 'textbook', source: 'Cambridge' }), 'other')
})

test('filters combine', () => {
  assert.deepEqual(ids(filterSubjectQuestions(rows, { topic: 'Quadratics' })), ['q1', 'q2'])
  assert.deepEqual(ids(filterSubjectQuestions(rows, { topic: 'Quadratics', difficulty: 2 })), ['q2'])
  assert.deepEqual(ids(filterSubjectQuestions(rows, { type: 'marked' })), ['q3'])
  assert.deepEqual(ids(filterSubjectQuestions(rows, { type: 'mcq' })), ['q1', 'q2'])
  assert.deepEqual(ids(filterSubjectQuestions(rows, { source: 'paper' })), ['q1'])
})

test('search matches every word, or an id', () => {
  assert.deepEqual(ids(filterSubjectQuestions(rows, { text: 'form express' })), ['q2'])
  assert.deepEqual(ids(filterSubjectQuestions(rows, { text: 'Q3' })), ['q3'])
  assert.deepEqual(ids(filterSubjectQuestions(rows, { text: 'nothing like this' })), [])
})

test('reported and hidden', () => {
  const sets = { reported: new Set(['q2']), hidden: new Set(['q1']) }
  assert.deepEqual(ids(filterSubjectQuestions(rows, { flag: 'reported' }, sets)), ['q2'])
  assert.deepEqual(ids(filterSubjectQuestions(rows, { flag: 'hidden' }, sets)), ['q1'])
  assert.deepEqual(ids(filterSubjectQuestions(rows, { flag: 'visible' }, sets)), ['q2', 'q3'])
})
