import { test } from 'node:test'
import assert from 'node:assert/strict'
import { topicCounts, emptySubtopics, subjectNeeds, THIN_TOPIC } from './subjectHealth.js'

const topics = [
  { name: 'Quadratics', subtopics: [{ id: 's1', name: 'Factorising' }, { id: 's2', name: 'The discriminant' }] },
  { name: 'Integration', subtopics: [{ id: 's3', name: 'Signed area' }] },
]
const rows = [
  ...Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, topic: 'Quadratics', subtopic: 'Factorising', subtopic_id: 's1' })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, topic: 'Integration', subtopic: 'Signed area', subtopic_id: 's3' })),
]

test('questions by topic, most first, with thin ones marked', () => {
  assert.deepEqual(topicCounts(topics, rows), [
    { name: 'Quadratics', count: 30, thin: false },
    { name: 'Integration', count: 4, thin: true },
  ])
  assert.equal(THIN_TOPIC, 25)
})

test('subtopics with no questions', () => {
  assert.deepEqual(emptySubtopics(topics, rows), [{ topic: 'Quadratics', name: 'The discriminant' }])
})

test('needs you: most urgent first, only what applies', () => {
  const keys = (n) => n.map(x => x.key)
  assert.deepEqual(keys(subjectNeeds({ topics, rows, openReports: 3, drafts: 2 })), ['reports', 'review', 'empty', 'thin', 'papers', 'exam', 'written'])
  const tidy = subjectNeeds({
    topics: [topics[0]], rows: [...rows, { id: 'c', topic: 'Quadratics', subtopic_id: 's2', source_kind: 'official' }],
    features: { written_answers: true }, examContext: 'Exam 2: CAS',
  })
  assert.deepEqual(keys(tidy), [])
  assert.equal(subjectNeeds({ topics, rows, openReports: 1 })[0].text, '1 question reported as wrong')
})
