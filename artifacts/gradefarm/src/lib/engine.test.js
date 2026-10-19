import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeWeights, selectNextQuestion, nextPassageSibling, seenQuestionChecker, questionContentKey, getQuestionCounts } from './engine.js'

// A spread of unseen questions across the full difficulty range.
const bank = [
  { id: 'd1', difficulty: 1, subtopic: 'x' },
  { id: 'd2', difficulty: 2, subtopic: 'x' },
  { id: 'd3', difficulty: 3, subtopic: 'x' },
  { id: 'd4', difficulty: 4, subtopic: 'x' },
  { id: 'd5', difficulty: 5, subtopic: 'x' },
]

const weightOf = (weights, id) => weights.find(w => w.id === id).weight

test('an on-target unseen question clearly outranks an off-target one', () => {
  const weights = computeWeights(bank, {}, 4)
  // Difficulty 4 (on target) must beat difficulty 1 (two bands away) decisively,
  // even accounting for the small unseen jitter.
  assert.ok(weightOf(weights, 'd4') > weightOf(weights, 'd1') + 0.3)
  // And it should beat its immediate neighbour difficulty 2 as well.
  assert.ok(weightOf(weights, 'd4') > weightOf(weights, 'd2'))
})

test('questions more than two bands from target get no difficulty bonus', () => {
  const withTarget = computeWeights(bank, {}, 5)
  const noTarget = computeWeights(bank, {}, null)
  // Difficulty 1 is four bands from target 5 → proximity clamps to 0, so its
  // weight matches the no-target baseline (within jitter).
  assert.ok(Math.abs(weightOf(withTarget, 'd1') - weightOf(noTarget, 'd1')) < 0.06)
})

test('selection lands on a near-target question across many draws', () => {
  // A realistic bank holds several questions per difficulty level. The selector
  // keeps the top 5 by weight, so with a strong bias those are dominated by
  // near-target questions and a far-off one almost never gets drawn.
  const bigBank = []
  for (let d = 1; d <= 5; d++) {
    for (let i = 0; i < 4; i++) bigBank.push({ id: `d${d}_${i}`, difficulty: d, subtopic: 'x' })
  }
  let nearTarget = 0
  const trials = 300
  for (let i = 0; i < trials; i++) {
    const q = selectNextQuestion(bigBank, {}, [], 'new', [], 4)
    if (Math.abs(q.difficulty - 4) <= 1) nearTarget++
  }
  assert.ok(nearTarget / trials > 0.95, `only ${nearTarget}/${trials} near target`)
})

test('a genuinely struggled question still outranks an on-target unseen one', () => {
  // Preserves the original prioritisation: high error rate beats difficulty bias.
  const struggleMap = {
    d2: { attempts: 4, wrong: 4, last_seen: new Date().toISOString() },
  }
  const weights = computeWeights(bank, struggleMap, 4)
  assert.ok(weightOf(weights, 'd2') > weightOf(weights, 'd4'))
})

test('continues the current reading passage before picking elsewhere', () => {
  const qs = [
    { id: 'a', difficulty: 3, subtopic: 'r', passage_id: 'P' },
    { id: 'b', difficulty: 3, subtopic: 'r', passage_id: 'P' },
    { id: 'c', difficulty: 3, subtopic: 'r' },
  ]
  for (let i = 0; i < 20; i++) {
    assert.equal(selectNextQuestion(qs, {}, ['a'], 'all')?.id, 'b')
  }
  assert.equal(nextPassageSibling(qs, [qs[2]], ['a', 'b']), null)
  assert.equal(nextPassageSibling(qs, qs, ['c']), null)
})

const seen = { attempts: 1, wrong: 0, last_seen: new Date().toISOString() }

test('new mode never serves a question the student already answered, even under another id', () => {
  const qs = [
    { id: 'a', question: 'What is $2 + 2$?', options: ['3', '4'], difficulty: 2, subtopic: 'x' },
    // Word-for-word duplicate of "a" stored under a different id.
    { id: 'a-copy', question: 'What is 2 + 2?', options: ['3', '4'], difficulty: 2, subtopic: 'x' },
    { id: 'b', question: 'What is 3 + 3?', options: ['5', '6'], difficulty: 2, subtopic: 'x' },
  ]
  for (let i = 0; i < 30; i++) {
    assert.equal(selectNextQuestion(qs, { a: seen }, [], 'new')?.id, 'b')
  }
  // Answered earlier this session (not yet in the struggle map) counts too.
  for (let i = 0; i < 30; i++) {
    assert.equal(selectNextQuestion(qs, {}, ['a'], 'new')?.id, 'b')
  }
  assert.equal(selectNextQuestion(qs, { a: seen, b: seen }, [], 'new'), null)
})

test('same stem with different options or passages is a different question', () => {
  const isSeen = seenQuestionChecker([
    { id: 'p1', question: 'Which statement is true?', options: ['A', 'B'] },
    { id: 'r1', question: 'What is the main idea?', passage_id: 'passage-1' },
  ], { p1: seen, r1: seen })
  assert.equal(isSeen({ id: 'p2', question: 'Which statement is true?', options: ['C', 'D'] }), false)
  assert.equal(isSeen({ id: 'r2', question: 'What is the main idea?', passage_id: 'passage-2' }), false)
  assert.equal(isSeen({ id: 'p3', question: 'Which  statement is TRUE?', options: ['A', 'B'] }), true)
  assert.equal(questionContentKey({ id: 'x' }), null)
})

test('unseen counts ignore answered questions and count duplicates once', () => {
  const qs = [
    { id: 'a', question: 'Q1', options: ['1', '2'], subtopic: 'x' },
    { id: 'a-copy', question: 'Q1', options: ['1', '2'], subtopic: 'x' },
    { id: 'b', question: 'Q2', options: ['1', '2'], subtopic: 'x' },
    { id: 'c', question: 'Q3', options: ['1', '2'], subtopic: 'x' },
  ]
  assert.equal(getQuestionCounts(qs, {}).unseen, 3)
  assert.equal(getQuestionCounts(qs, { b: seen }).unseen, 2)
  assert.equal(getQuestionCounts(qs, { a: seen }).unseen, 2)
})
