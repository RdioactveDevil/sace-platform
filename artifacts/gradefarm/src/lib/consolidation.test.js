import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveConsolidation, consolidationRound, CONSOLIDATION_STREAK, CONSOLIDATION_MAX_QUESTIONS } from './consolidation.js'

const bank = [
  { id: 1, topic: 'Acids and bases', subtopic: 'pH' },
  { id: 2, topic: 'Acids and bases', subtopic: 'Buffers' },
  { id: 3, topic: 'Acids and bases', subtopic: 'pH' },
  { id: 4, topic: 'Stoichiometry', subtopic: 'Limiting reagents' },
]

test('a subtopic practises just that subtopic', () => {
  assert.deepEqual(resolveConsolidation(bank, 'pH'), { label: 'pH', subtopics: ['pH'] })
})

test('matching ignores case and surrounding spaces, and uses the bank\'s spelling', () => {
  assert.deepEqual(resolveConsolidation(bank, '  buffers '), { label: 'Buffers', subtopics: ['Buffers'] })
})

test('a whole topic practises all of its subtopics', () => {
  const r = resolveConsolidation(bank, 'acids and bases')
  assert.equal(r.label, 'Acids and bases')
  assert.deepEqual(r.subtopics.sort(), ['Buffers', 'pH'])
})

test('a typed topic the bank has nothing for gives nothing to practise', () => {
  assert.equal(resolveConsolidation(bank, 'stoichiometry of gases'), null)
  assert.equal(resolveConsolidation(bank, ''), null)
  assert.equal(resolveConsolidation([], 'pH'), null)
})

const r = (correct, remediation = false) => ({ correct, remediation })

test('the round ends at three right in a row', () => {
  assert.equal(CONSOLIDATION_STREAK, 3)
  assert.equal(consolidationRound([r(true), r(true)]).done, false)
  const done = consolidationRound([r(false), r(true), r(true), r(true)])
  assert.equal(done.done, true)
  assert.equal(done.byStreak, true)
  assert.equal(done.inARow, 3)
})

test('a wrong answer restarts the run', () => {
  assert.equal(consolidationRound([r(true), r(true), r(false), r(true)]).inARow, 1)
})

test('the round ends after eight questions even without a run of three', () => {
  assert.equal(CONSOLIDATION_MAX_QUESTIONS, 8)
  const results = [r(true), r(false), r(true), r(false), r(true), r(false), r(true), r(false)]
  const st = consolidationRound(results)
  assert.equal(st.answered, 8)
  assert.equal(st.done, true)
  assert.equal(st.byStreak, false)
  assert.equal(consolidationRound(results.slice(0, 7)).done, false)
})

test('remediation answers neither count as questions nor break the run', () => {
  const st = consolidationRound([r(true), r(false, true), r(true, true), r(true)])
  assert.equal(st.answered, 2)
  assert.equal(st.inARow, 2)
})
