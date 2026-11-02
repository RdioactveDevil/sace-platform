import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileBorrowedQuestions } from './sharedQuestions.js'

const targets = [
  { id: 's1', name: 'Quadratic functions', topic: 'Functions' },
  { id: 's2', name: 'Graphs of quadratics', topic: 'Functions' },
]

test('a borrowed question is filed under the borrowing subtopic, keeping its id', () => {
  const rows = [{ id: 'q1', subject: 'VCE Methods', topic: 'Quadratics', subtopic: 'Factorising', subtopic_id: 'v1', question: 'Solve' }]
  const out = fileBorrowedQuestions(rows, [{ subtopic_id: 's1', source_subtopic_id: 'v1' }], targets, { subject: 'SACE Methods' })
  assert.deepEqual(out, [{ ...rows[0], topic: 'Functions', subtopic: 'Quadratic functions', subject: 'SACE Methods', shared_from: 'VCE Methods' }])
})

test('questions the subject already has, unlinked ones and repeats are left out', () => {
  const rows = [
    { id: 'q1', subtopic_id: 'v1' }, { id: 'q1', subtopic_id: 'v1' },
    { id: 'q2', subtopic_id: 'v1' }, { id: 'q3', subtopic_id: 'other' },
  ]
  const out = fileBorrowedQuestions(rows, [{ subtopic_id: 's1', source_subtopic_id: 'v1' }], targets, { subject: 'S', ownIds: ['q2'] })
  assert.deepEqual(out.map(q => q.id), ['q1'])
})

test('a source shared by two subtopics goes under the first one', () => {
  const links = [{ subtopic_id: 's2', source_subtopic_id: 'v1' }, { subtopic_id: 's1', source_subtopic_id: 'v1' }]
  const out = fileBorrowedQuestions([{ id: 'q1', subtopic_id: 'v1' }], links, targets, { subject: 'S' })
  assert.equal(out[0].subtopic, 'Quadratic functions')
})
