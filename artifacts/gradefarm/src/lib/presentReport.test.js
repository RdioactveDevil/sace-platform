import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presentModel } from './presentReport.js'

const assessment = {
  student_name: 'Sam Example',
  submitted_by_name: null,
  subjects: [{ name: 'Mathematics' }],
  questions: [
    { id: 1, question: 'Solve $x+1=3$', type: 'multiple_choice', options: ['A. x = 1', 'B. x = 2', 'C. x = 3', 'D. x = 4'], correct_answer: 'B' },
    { id: 2, question: 'Differentiate x^2', type: 'short_answer', correct_answer: '2x', solution_notes: 'SECRET' },
    { id: 3, question: 'Unmarked one', type: 'short_answer', correct_answer: '7' },
  ],
}
const report = {
  percentage: 70, performance_band: 'Satisfactory',
  topic_breakdown: [
    { topic: 'Algebra', percentage: 75 },
    { topic: 'Calculus', percentage: 59 },
    { topic: 'Statistics', percentage: 60 },
    { topic: 'Geometry', percentage: 90 },
  ],
  subtopic_breakdown: [
    { topic: 'Algebra', subtopic: 'Linear', percentage: 100 },
    { topic: 'Algebra', subtopic: 'Quadratics', percentage: 50 },
    { topic: 'Calculus', subtopic: 'Limits', percentage: 40 },
  ],
  easy_score: 4, easy_max: 5, moderate_score: 3, moderate_max: 6, exam_score: 0, exam_max: 0,
  question_results: [
    { id: 1, student_answer: 'A', correct_answer: 'B', marks_awarded: 0, marks_possible: 1 },
    { id: 2, student_answer: '2x', correct_answer: '2x', marks_awarded: 2, marks_possible: 2 },
  ],
}

test('header fields', () => {
  const m = presentModel(assessment, report)
  assert.equal(m.name, 'Sam Example')
  assert.equal(m.subject, 'Mathematics')
  assert.equal(m.percentage, 70)
  assert.equal(m.band, 'Satisfactory')
})

test('thresholds: 75 is strong, 60 is not to-work-on, 59 is', () => {
  const m = presentModel(assessment, report)
  assert.deepEqual(m.strong, ['Geometry', 'Algebra'])
  assert.deepEqual(m.workOn, ['Calculus'])
})

test('subtopics sit under their topic; topic order kept; none -> []', () => {
  const m = presentModel(assessment, report)
  assert.deepEqual(m.topics.map(t => t.topic), ['Algebra', 'Calculus', 'Statistics', 'Geometry'])
  assert.deepEqual(m.topics[0].subtopics, [{ subtopic: 'Linear', percentage: 100 }, { subtopic: 'Quadratics', percentage: 50 }])
  assert.deepEqual(m.topics[3].subtopics, [])
  assert.equal(m.topics[1].percentage, 59)
})

test('difficulty labels, max 0 dropped', () => {
  const m = presentModel(assessment, report)
  assert.deepEqual(m.difficulty, [
    { label: 'Easy', score: 4, max: 5 },
    { label: 'Core', score: 3, max: 6 },
  ])
})

test('questions joined by id; MC answers as option text; missing result', () => {
  const m = presentModel(assessment, report)
  assert.equal(m.questions.length, 3)
  assert.equal(m.questions[0].studentAnswer, 'A. x = 1')
  assert.equal(m.questions[0].correctAnswer, 'B. x = 2')
  assert.equal(m.questions[0].correct, false)
  assert.equal(m.questions[1].correct, true)
  assert.equal(m.questions[1].marks, 2)
  assert.equal(m.questions[1].marksPossible, 2)
  assert.equal(m.questions[2].studentAnswer, '')
  assert.equal(m.questions[2].correct, false)
  assert.equal('solution_notes' in m.questions[1], false)
  assert.equal(JSON.stringify(m).includes('SECRET'), false)
})

test('MC options without a letter prefix get one', () => {
  const a = { ...assessment, questions: [{ id: 1, question: 'q', type: 'multiple_choice', options: ['one', 'two'], correct_answer: 'B' }] }
  const m = presentModel(a, { ...report, question_results: [{ id: 1, student_answer: 'a', marks_awarded: 0, marks_possible: 1 }] })
  assert.equal(m.questions[0].studentAnswer, 'A. one')
  assert.equal(m.questions[0].correctAnswer, 'B. two')
})
