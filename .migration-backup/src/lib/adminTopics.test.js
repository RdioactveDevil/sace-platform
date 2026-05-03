import { S1_TOPICS, S2_TOPICS, getTopicByCode } from './adminTopics'

test('S1_TOPICS has 20 entries', () => {
  expect(S1_TOPICS).toHaveLength(20)
})

test('S2_TOPICS has 22 entries', () => {
  expect(S2_TOPICS).toHaveLength(22)
})

test('every topic has a code and name', () => {
  ;[...S1_TOPICS, ...S2_TOPICS].forEach(t => {
    expect(typeof t.code).toBe('string')
    expect(typeof t.name).toBe('string')
    expect(t.code.length).toBeGreaterThan(0)
    expect(t.name.length).toBeGreaterThan(0)
  })
})

test('getTopicByCode returns correct S1 topic', () => {
  expect(getTopicByCode('s1', '2.2')).toEqual({ code: '2.2', name: 'Bonding between atoms' })
})

test('getTopicByCode returns correct S2 topic', () => {
  expect(getTopicByCode('s2', '2.2')).toEqual({ code: '2.2', name: 'Equilibrium and yield' })
})

test('getTopicByCode returns null for unknown code', () => {
  expect(getTopicByCode('s1', '9.9')).toBeNull()
})
