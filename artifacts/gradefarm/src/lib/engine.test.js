import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeWeights, selectNextQuestion, nextPassageSibling, seenQuestionChecker, questionContentKey, getQuestionCounts, ASSIGNMENT_DIFFICULTIES, assignmentGoalLabel, assignmentStanding, applyAssignmentAnswer } from './engine.js'

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

test('an assignment difficulty band only serves questions inside it', () => {
  const hard = ASSIGNMENT_DIFFICULTIES.hard
  for (let i = 0; i < 50; i++) {
    const q = selectNextQuestion(bank, {}, [], 'new', [], hard.target, hard)
    assert.ok(q.difficulty >= 4, `served difficulty ${q.difficulty}`)
  }
  const easy = ASSIGNMENT_DIFFICULTIES.easy
  for (let i = 0; i < 50; i++) {
    assert.ok(selectNextQuestion(bank, {}, [], 'new', [], easy.target, easy).difficulty <= 2)
  }
})

test('a difficulty band falls back to the whole pool when none are left in it', () => {
  const hard = ASSIGNMENT_DIFFICULTIES.hard
  assert.equal(selectNextQuestion(bank, {}, ['d4', 'd5'], 'new', [], hard.target, hard)?.difficulty <= 3, true)
})

test('assignment goal label shows capped progress and difficulty', () => {
  assert.equal(assignmentGoalLabel({ question_count: 10, progress_count: 4, difficulty: 'hard' }), '4/10 questions · Hard')
  assert.equal(assignmentGoalLabel({ question_count: 5, progress_count: 9, difficulty: 'adaptive' }), '5/5 questions · Adaptive')
  assert.equal(assignmentGoalLabel({ question_count: null }), null)
})

test('pass mark label is shown only when set', () => {
  assert.equal(assignmentGoalLabel({ question_count: 10, progress_count: 2, difficulty: 'easy', min_accuracy: 80 }), '2/10 questions · Easy · Pass 80%')
})

test('without a pass mark an assignment completes at the question count', () => {
  let a = { question_count: 3, progress_count: 0, recent_results: [] }
  for (const c of [false, false]) a = applyAssignmentAnswer(a, c)
  assert.equal(assignmentStanding(a).complete, false)
  a = applyAssignmentAnswer(a, false)
  assert.equal(assignmentStanding(a).complete, true)
})

test('a pass mark is judged on the most recent question_count answers', () => {
  let a = { question_count: 3, min_accuracy: 67, progress_count: 0, recent_results: [] }
  for (const c of [false, false, true]) a = applyAssignmentAnswer(a, c)
  assert.deepEqual(assignmentStanding(a), { goal: 3, progress: 3, minAccuracy: 67, oneAttempt: false, accuracy: 33, meetsMark: false, complete: false, passed: null })
  a = applyAssignmentAnswer(a, true)            // f t t: 66.7% is under 67%
  assert.equal(assignmentStanding(a).complete, false)
  a = applyAssignmentAnswer(a, true)            // t t t
  assert.deepEqual(a.recent_results, [true, true, true])
  assert.equal(a.progress_count, 3)
  assert.equal(assignmentStanding(a).complete, true)
})

test('a one-attempt pass mark ends at the question count and records pass or fail', () => {
  let a = { question_count: 3, min_accuracy: 60, pass_mode: 'one_attempt', progress_count: 0, recent_results: [] }
  for (const c of [true, false]) a = applyAssignmentAnswer(a, c)
  assert.equal(assignmentStanding(a).complete, false)
  const failed = applyAssignmentAnswer(a, false)
  assert.equal(assignmentStanding(failed).complete, true)
  assert.equal(assignmentStanding(failed).passed, false)
  const passed = applyAssignmentAnswer(a, true)
  assert.equal(assignmentStanding(passed).passed, true)
  assert.equal(assignmentGoalLabel(passed), '3/3 questions · Adaptive · Pass 60% (one attempt)')
})

test('pass_mode is ignored without a pass mark', () => {
  const a = { question_count: 1, pass_mode: 'one_attempt', progress_count: 1, recent_results: [false] }
  assert.equal(assignmentStanding(a).complete, true)
  assert.equal(assignmentStanding(a).passed, null)
})

test('an assignment run without remediation says so in its label', () => {
  assert.equal(assignmentGoalLabel({ question_count: 10, progress_count: 0, difficulty: 'medium', remediation: false }), '0/10 questions · Medium · No remediation')
  assert.equal(assignmentGoalLabel({ question_count: 10, progress_count: 0, difficulty: 'medium', remediation: true }), '0/10 questions · Medium')
})

// ─── Ranks & XP ──────────────────────────────────────────────────────────────
import { RANKS, RANK_TIERS, getLevel, getLevelProgress, rankAccuracy, nextRankHint, calcXP, calcRemediationXP, getRemediationCompletionBonus } from './engine.js'

test('every rank has one tier, and the top rank is Legend', () => {
  assert.equal(RANKS.length, RANK_TIERS.length)
  assert.equal(RANKS.at(-1), 'Legend')
  assert.ok(!RANKS.some(r => /SACE/.test(r)))
})

test('XP alone stops short of the ranks that need accuracy', () => {
  // Plenty of XP at 50% recent accuracy: Silver II (needs 50%) is the ceiling.
  assert.equal(RANKS[getLevel(9912, 0.5)], 'Silver II')
  assert.equal(RANKS[getLevel(9912, 0.49)], 'Bronze I')
  assert.equal(RANKS[getLevel(9912, 0.7)], 'Platinum')
  assert.equal(RANKS[getLevel(60000, 0.9)], 'Legend')
  assert.equal(RANKS[getLevel(60000, 0.84)], 'Grandmaster')
})

test('rankAccuracy reads the decayed counts and handles a new profile', () => {
  assert.equal(rankAccuracy({ recent_correct: 30, recent_answers: 40 }), 0.75)
  assert.equal(rankAccuracy({}), 0)
  assert.equal(rankAccuracy(null), 0)
})

test('progress is capped, full at the top rank, and says when accuracy is the blocker', () => {
  const blocked = getLevelProgress(9912, 0.5)
  assert.equal(blocked.pct, 100)
  assert.equal(blocked.needsAccuracy, 0.55)
  assert.match(nextRankHint(9912, 0.5), /55% recent accuracy for Silver I/)

  const top = getLevelProgress(80000, 0.95)
  assert.equal(top.maxed, true)
  assert.equal(top.pct, 100)
  assert.equal(nextRankHint(80000, 0.95), 'Top rank reached')

  const mid = getLevelProgress(1700, 0.9)
  assert.equal(RANKS[mid.level], 'Silver II')
  assert.equal(mid.pct, 50)
  assert.equal(nextRankHint(1700, 0.9), '500 XP to Silver I')
})

test('a wrong answer costs what a right one earns before the streak bonus', () => {
  for (const d of [1, 3, 5]) assert.equal(calcXP(false, d, 0), -calcXP(true, d, 0))
  assert.equal(calcXP(true, 5, 100), 120) // streak bonus caps at 2x
})

test('a wrong answer plus a full remediation still loses XP', () => {
  const wrong = calcXP(false, 1, 0)
  const remediation = 3 * calcRemediationXP(true) + getRemediationCompletionBonus()
  assert.ok(wrong + remediation < 0)
})
