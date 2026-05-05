import { test } from 'node:test'
import assert from 'node:assert/strict'
import { S1_TOPICS, S2_TOPICS, getTopicByCode, getTopicsBySubject, refreshManagedTopicsCache, getManagedSubjectNames } from './adminTopics.js'

test('S1_TOPICS has 20 entries', () => {
  assert.equal(S1_TOPICS.length, 20)
})

test('S2_TOPICS has 22 entries', () => {
  assert.equal(S2_TOPICS.length, 22)
})

test('every topic has a code and name', () => {
  for (const t of [...S1_TOPICS, ...S2_TOPICS]) {
    assert.equal(typeof t.code, 'string')
    assert.equal(typeof t.name, 'string')
    assert.ok(t.code.length > 0)
    assert.ok(t.name.length > 0)
  }
})

test('getTopicByCode returns correct S1 topic', () => {
  assert.deepEqual(getTopicByCode('s1', '2.2'), { code: '2.2', name: 'Bonding between atoms' })
})

test('getTopicByCode returns correct S2 topic', () => {
  assert.deepEqual(getTopicByCode('s2', '2.2'), { code: '2.2', name: 'Equilibrium and yield' })
})

test('getTopicByCode returns null for unknown code', () => {
  assert.equal(getTopicByCode('s1', '9.9'), null)
})

test('getTopicsBySubject returns S1_TOPICS for unknown subject when cache is empty', () => {
  const result = getTopicsBySubject('Unknown Subject XYZ')
  assert.strictEqual(result, S1_TOPICS)
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
