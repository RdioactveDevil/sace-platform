import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evidenceRanges } from './writtenAnswers.js'
import { isAiMarked, markingScheme, totalMarks, responseIsComplete, emptyResponse } from './questionTypes.js'

test('evidenceRanges finds each credited quote once, in reading order', () => {
  const answer = 'n = cV = 0.1 x 0.025. Ratio 1:1. So n = 0.0025 mol'
  const marks = [
    { point: 1, awarded: 1, evidence: 'ratio 1:1' },
    { point: 0, awarded: 1, evidence: 'n = cV' },
    { point: 2, awarded: 0, evidence: 'mol' },
    { point: 3, awarded: 1, evidence: 'not in the answer' },
  ]
  assert.deepEqual(evidenceRanges(answer, marks), [[0, 6, 0], [22, 31, 1]])
})

test('evidenceRanges gives repeated quotes their own place', () => {
  const answer = 'mol ... mol'
  const r = evidenceRanges(answer, [{ point: 0, awarded: 1, evidence: 'mol' }, { point: 1, awarded: 1, evidence: 'mol' }])
  assert.deepEqual(r, [[0, 3, 0], [8, 11, 1]])
})

test('marked questions: type helpers', () => {
  const q = { question_type: 'marked', marking_scheme: [{ marks: 1, point: 'a' }, { marks: 2, point: 'b' }, { marks: 0, point: 'x' }] }
  assert.equal(isAiMarked(q), true)
  assert.equal(isAiMarked({ question_type: 'mcq' }), false)
  assert.equal(markingScheme(q).length, 2)
  assert.equal(totalMarks(q), 3)
  assert.equal(totalMarks({ ...q, total_marks: 4 }), 4)
  assert.equal(markingScheme({ marking_scheme: '[{"marks":1,"point":"p"}]' }).length, 1)
  assert.equal(responseIsComplete(q, '  '), false)
  assert.equal(responseIsComplete(q, 'An answer'), true)
  assert.equal(emptyResponse(q), '')
})
