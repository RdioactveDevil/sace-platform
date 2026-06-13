import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getTopicsBySubject,
  refreshManagedTopicsCache,
  getManagedSubjectNames,
  resolveManagedSubjectName,
  getTopicCodeByName,
} from './adminTopics.js'

test('getTopicsBySubject returns empty array for unknown subject when cache is empty', () => {
  const result = getTopicsBySubject('Unknown Subject XYZ')
  assert.deepEqual(result, [])
})

test('refreshManagedTopicsCache + getTopicsBySubject returns cached topics', async () => {
  const fakeFetcher = async () => ({
    'Year 9 Biology': [
      { code: 'T1.1', name: 'Cell membrane structure', topicName: 'Cell Biology' },
      { code: 'T1.2', name: 'Mitosis',                 topicName: 'Cell Biology' },
    ],
  })
  await refreshManagedTopicsCache(fakeFetcher)
  const result = getTopicsBySubject('Year 9 Biology')
  assert.equal(result.length, 2)
  assert.equal(result[0].code, 'T1.1')
  assert.equal(result[0].name, 'Cell membrane structure')
})

test('getManagedSubjectNames returns cached subject names', () => {
  const names = getManagedSubjectNames()
  assert.ok(names.includes('Year 9 Biology'))
})

test('resolveManagedSubjectName matches alias spellings of the curriculum name', async () => {
  await refreshManagedTopicsCache(async () => ({
    'Mathematical Methods Stage 2': [
      { code: 'T1.1', name: 'Exponential Functions', topicName: 'Further Differentiation' },
    ],
  }))
  // Exact key
  assert.equal(resolveManagedSubjectName('Mathematical Methods Stage 2'), 'Mathematical Methods Stage 2')
  // Reordered + SACE-prefixed row spellings
  assert.equal(resolveManagedSubjectName('Stage 2 Mathematical Methods'), 'Mathematical Methods Stage 2')
  assert.equal(resolveManagedSubjectName('SACE Stage 2 Mathematical Methods'), 'Mathematical Methods Stage 2')
  // Legacy trailing-junk spelling
  assert.equal(resolveManagedSubjectName('SACE Stage 2 Mathematical Methods : '), 'Mathematical Methods Stage 2')
  // Unknown subject
  assert.equal(resolveManagedSubjectName('Stage 1 Biology'), null)
})

test('getTopicCodeByName works with alias subject spellings', async () => {
  await refreshManagedTopicsCache(async () => ({
    'Mathematical Methods Stage 2': [
      { code: 'T1.1', name: 'Exponential Functions', topicName: 'Further Differentiation' },
    ],
  }))
  assert.equal(getTopicCodeByName('SACE Stage 2 Mathematical Methods', 'Exponential Functions'), 'T1.1')
  assert.equal(getTopicCodeByName('Stage 2 Mathematical Methods', 'exponential functions'), 'T1.1')
  assert.equal(getTopicCodeByName('Stage 2 Mathematical Methods', 'Nonexistent Subtopic'), null)
})

test('resolveManagedSubjectName bridges a bare title to a stage-named curriculum', async () => {
  await refreshManagedTopicsCache(async () => ({
    'Mathematical Methods Stage 2': [
      { code: 'T1.1', name: 'Exponential Functions', topicName: 'Functions' },
    ],
  }))
  // Questions stored under the bare title (e.g. after a curriculum rename) must
  // still resolve to the stage-named managed curriculum.
  assert.equal(resolveManagedSubjectName('Mathematical Methods'), 'Mathematical Methods Stage 2')
  assert.equal(getTopicCodeByName('Mathematical Methods', 'Exponential Functions'), 'T1.1')
})

test('resolveManagedSubjectName refuses an ambiguous bare title across stages', async () => {
  await refreshManagedTopicsCache(async () => ({
    'Mathematical Methods Stage 1': [{ code: 'T1.1', name: 'Polynomials', topicName: 'Algebra' }],
    'Mathematical Methods Stage 2': [{ code: 'T1.1', name: 'Exponential Functions', topicName: 'Functions' }],
  }))
  // Bare title matches both stages → must not guess.
  assert.equal(resolveManagedSubjectName('Mathematical Methods'), null)
  // But a stage-qualified spelling still resolves precisely.
  assert.equal(resolveManagedSubjectName('Stage 2 Mathematical Methods'), 'Mathematical Methods Stage 2')
})

test('resolveManagedSubjectName uses the tile stage hint to break a tie', async () => {
  await refreshManagedTopicsCache(async () => ({
    'Mathematical Methods Stage 1': [{ code: 'T1.1', name: 'Polynomials', topicName: 'Algebra' }],
    'Mathematical Methods Stage 2': [{ code: 'T1.1', name: 'Exponential Functions', topicName: 'Functions' }],
  }))
  // Bare subject + a stage hint from the selected tile → resolves to that stage.
  assert.equal(resolveManagedSubjectName('Mathematical Methods', 'Stage 1'), 'Mathematical Methods Stage 1')
  assert.equal(resolveManagedSubjectName('Mathematical Methods', 'Stage 2'), 'Mathematical Methods Stage 2')
  // And topic-code lookup routes to the right stage's topics with the hint.
  assert.equal(getTopicCodeByName('Mathematical Methods', 'Polynomials', 'Stage 1'), 'T1.1')
  assert.equal(getTopicCodeByName('Mathematical Methods', 'Exponential Functions', 'Stage 2'), 'T1.1')
  // Wrong-stage subtopic must NOT match.
  assert.equal(getTopicCodeByName('Mathematical Methods', 'Polynomials', 'Stage 2'), null)
})
