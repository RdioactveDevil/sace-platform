import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { formatClock, buildPaper, countQuestions, gradePaper } from './examEngine.js'

describe('formatClock', () => {
  test('M:SS under an hour', () => {
    assert.equal(formatClock(0), '0:00')
    assert.equal(formatClock(65), '1:05')
    assert.equal(formatClock(600), '10:00')
  })
  test('H:MM:SS past an hour', () => {
    assert.equal(formatClock(3661), '1:01:01')
  })
  test('clamps negatives', () => {
    assert.equal(formatClock(-5), '0:00')
  })
})

describe('buildPaper', () => {
  const track = {
    title: 'T',
    sections: [
      { id: 'a', name: 'A', durationSec: 60, questions: [{ id: 'q1' }, { id: 'q2' }] },
      { id: 'b', name: 'B', durationSec: 60, pick: { count: 2, filter: (q) => q.subject === 'Chem' } },
    ],
  }
  const pool = [
    { id: 'p1', subject: 'Chem' }, { id: 'p2', subject: 'Chem' },
    { id: 'p3', subject: 'Math' }, { id: 'p4', subject: 'Chem' },
  ]
  test('uses explicit questions and picks from pool by filter', () => {
    const paper = buildPaper(track, pool)
    assert.equal(paper.sections[0].questions.length, 2)
    assert.equal(paper.sections[1].questions.length, 2)
    assert.ok(paper.sections[1].questions.every((q) => q.subject === 'Chem'))
  })
  test('countQuestions sums sections', () => {
    assert.equal(countQuestions(buildPaper(track, pool)), 4)
  })
})

describe('gradePaper', () => {
  const paper = {
    title: 'T',
    sections: [
      {
        id: 's1', name: 'S1', durationSec: 60,
        questions: [
          { id: 'm', question_type: 'mcq', options: ['a', 'b'], answer_index: 1 },
          { id: 'n', question_type: 'numeric', answer: 10, tolerance: 0 },
        ],
      },
    ],
  }
  test('scores answered questions, treats blanks as wrong', () => {
    const r = gradePaper(paper, { m: 1, n: '10' }, { s1: 42 })
    assert.equal(r.totalCorrect, 2)
    assert.equal(r.totalQuestions, 2)
    assert.equal(r.percent, 100)
    assert.equal(r.perSection[0].timeSec, 42)
  })
  test('wrong + unanswered', () => {
    const r = gradePaper(paper, { m: 0 }) // n unanswered, m wrong
    assert.equal(r.totalCorrect, 0)
    assert.equal(r.percent, 0)
  })
  test('partial', () => {
    const r = gradePaper(paper, { m: 1 }) // m right, n blank
    assert.equal(r.totalCorrect, 1)
    assert.equal(r.percent, 50)
  })
})
