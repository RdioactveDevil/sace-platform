import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { formatClock, buildPaper, buildSubjectExam, countQuestions, gradePaper, DEFAULT_EXAM_QUESTIONS } from './examEngine.js'

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

describe('buildSubjectExam', () => {
  const pool = [
    ...Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, topic: 'Acids' })),
    { id: 'b1', topic: 'Bonding' },
    { id: 'c1', topic: 'Cells' },
  ]

  test('defaults to DEFAULT_EXAM_QUESTIONS at 90 s each', () => {
    const exam = buildSubjectExam({ id: 'curriculum_x', name: 'Chem', features: { exam_mode: true } }, pool)
    assert.equal(countQuestions(exam), DEFAULT_EXAM_QUESTIONS)
    assert.equal(exam.sections[0].durationSec, DEFAULT_EXAM_QUESTIONS * 90)
    assert.equal(exam.id, 'subject-curriculum_x')
  })

  test('uses questions the student has not answered before answered ones', () => {
    const answered = new Set(pool.slice(0, 25).map(q => q.id))
    const qs = buildSubjectExam({ features: { exam_questions: 6 } }, pool, q => answered.has(q.id)).sections[0].questions
    assert.equal(qs.length, 6)
    assert.equal(qs.filter(q => answered.has(q.id)).length, 0)
    // Not enough new questions: answered ones fill the rest.
    const full = buildSubjectExam({ features: { exam_questions: 10 } }, pool, q => answered.has(q.id)).sections[0].questions
    assert.equal(full.length, 10)
    assert.equal(full.filter(q => !answered.has(q.id)).length, 7)
  })

  test('covers every topic before repeating one', () => {
    const exam = buildSubjectExam({ features: { exam_questions: 3 } }, pool)
    const topics = new Set(exam.sections[0].questions.map(q => q.topic))
    assert.deepEqual([...topics].sort(), ['Acids', 'Bonding', 'Cells'])
  })

  test('uses configured size and time, capped by the bank', () => {
    const exam = buildSubjectExam({ features: { exam_questions: 50, exam_minutes: 45 } }, pool)
    assert.equal(countQuestions(exam), pool.length)
    assert.equal(exam.sections[0].durationSec, 45 * 60)
    assert.equal(new Set(exam.sections[0].questions.map(q => q.id)).size, pool.length)
  })

  test('keeps a passage\'s questions together and in one block', () => {
    const withPassage = [
      { id: 'p1', topic: 'Reading', passage_id: 'P' },
      { id: 'p2', topic: 'Reading', passage_id: 'P' },
      { id: 'p3', topic: 'Reading', passage_id: 'P' },
      { id: 'g1', topic: 'Grammar' },
    ]
    const qs = buildSubjectExam({ features: { exam_questions: 4 } }, withPassage).sections[0].questions
    const idx = qs.map(q => q.id)
    const first = idx.indexOf('p1')
    assert.deepEqual(new Set(idx.slice(first, first + 3)), new Set(['p1', 'p2', 'p3']))
    assert.equal(qs.length, 4)
  })

  test('empty bank gives an empty paper', () => {
    assert.equal(countQuestions(buildSubjectExam({ features: {} }, [])), 0)
  })
})
