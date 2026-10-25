import { test } from 'node:test'
import assert from 'node:assert/strict'
import { priorityTopics } from './priorityTopics.js'

test('each topic appears once, ranked by its overall accuracy', () => {
  const ranked = priorityTopics({
    Integration: { correct: 2, wrong: 8 },
    Logarithms: { correct: 5, wrong: 5 },
    Probability: { correct: 1, wrong: 2 },
  })
  assert.deepEqual(ranked.map(r => r.topic), ['Integration', 'Probability', 'Logarithms'])
  assert.equal(ranked[0].accuracy, 0.2)
  assert.equal(ranked[0].answers, 10)
})

test('topics with too few answers or good accuracy are left out', () => {
  const ranked = priorityTopics({
    OneMiss: { correct: 0, wrong: 1 },
    Strong: { correct: 9, wrong: 1 },
    Borderline: { correct: 7, wrong: 3 },
    Weak: { correct: 1, wrong: 3 },
    Untouched: { correct: 0, wrong: 0 },
  })
  assert.deepEqual(ranked.map(r => r.topic), ['Weak'])
})

test('ties go to the topic with more answers, and the list is capped', () => {
  const stats = {}
  for (let i = 0; i < 8; i++) stats[`T${i}`] = { correct: 1, wrong: 3 }
  stats.Big = { correct: 3, wrong: 9 }
  const ranked = priorityTopics(stats)
  assert.equal(ranked.length, 5)
  assert.equal(ranked[0].topic, 'Big')
})

test('copes with missing stats', () => {
  assert.deepEqual(priorityTopics(undefined), [])
  assert.deepEqual(priorityTopics({ A: undefined }), [])
})
