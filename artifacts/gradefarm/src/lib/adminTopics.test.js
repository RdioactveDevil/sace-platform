import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getTopicsBySubject, refreshManagedTopicsCache, getManagedSubjectNames } from './adminTopics.js'

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
