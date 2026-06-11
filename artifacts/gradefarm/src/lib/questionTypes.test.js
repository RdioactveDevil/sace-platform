import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  getQuestionType,
  needsCheckButton,
  responseIsComplete,
  gradeResponse,
  describeCorrectAnswer,
  emptyResponse,
} from './questionTypes.js'

describe('getQuestionType', () => {
  test('defaults to mcq when missing or unknown', () => {
    assert.equal(getQuestionType({}), 'mcq')
    assert.equal(getQuestionType({ question_type: 'nope' }), 'mcq')
    assert.equal(getQuestionType({ question_type: 'numeric' }), 'numeric')
  })
})

describe('mcq', () => {
  const q = { question_type: 'mcq', options: ['a', 'b', 'c', 'd'], answer_index: 2 }
  test('grades correct/incorrect', () => {
    assert.equal(gradeResponse(q, 2), true)
    assert.equal(gradeResponse(q, 0), false)
  })
  test('no check button, completeness on selection', () => {
    assert.equal(needsCheckButton(q), false)
    assert.equal(responseIsComplete(q, null), false)
    assert.equal(responseIsComplete(q, 0), true)
  })
  test('describes correct answer', () => {
    assert.equal(describeCorrectAnswer(q), 'c')
  })
})

describe('multi_select', () => {
  const q = { question_type: 'multi_select', options: ['a', 'b', 'c', 'd'], answer_indices: [0, 2] }
  test('order-independent set match', () => {
    assert.equal(gradeResponse(q, [2, 0]), true)
    assert.equal(gradeResponse(q, [0, 2]), true)
  })
  test('partial or extra selections are wrong', () => {
    assert.equal(gradeResponse(q, [0]), false)
    assert.equal(gradeResponse(q, [0, 2, 3]), false)
    assert.equal(gradeResponse(q, []), false)
  })
  test('completeness requires at least one', () => {
    assert.equal(responseIsComplete(q, []), false)
    assert.equal(responseIsComplete(q, [1]), true)
  })
  test('describes correct answer as joined options', () => {
    assert.equal(describeCorrectAnswer(q), 'a, c')
  })
})

describe('numeric', () => {
  test('exact match with zero tolerance', () => {
    const q = { question_type: 'numeric', answer: 42 }
    assert.equal(gradeResponse(q, '42'), true)
    assert.equal(gradeResponse(q, 42), true)
    assert.equal(gradeResponse(q, '42.1'), false)
  })
  test('within tolerance', () => {
    const q = { question_type: 'numeric', answer: 9.81, tolerance: 0.05 }
    assert.equal(gradeResponse(q, '9.8'), true)
    assert.equal(gradeResponse(q, '9.78'), true)
    assert.equal(gradeResponse(q, '9.7'), false)
  })
  test('non-numeric is incorrect / incomplete', () => {
    const q = { question_type: 'numeric', answer: 5 }
    assert.equal(gradeResponse(q, 'abc'), false)
    assert.equal(responseIsComplete(q, ''), false)
    assert.equal(responseIsComplete(q, 'abc'), false)
    assert.equal(responseIsComplete(q, '3'), true)
  })
  test('describes answer with unit', () => {
    assert.equal(describeCorrectAnswer({ question_type: 'numeric', answer: 9.81, unit: 'm/s²' }), '9.81 m/s²')
  })
})

describe('short_text', () => {
  const q = { question_type: 'short_text', accept: ['Paris', 'paris city'] }
  test('case-insensitive, whitespace-normalized match by default', () => {
    assert.equal(gradeResponse(q, '  paris '), true)
    assert.equal(gradeResponse(q, 'PARIS'), true)
    assert.equal(gradeResponse(q, 'paris   city'), true)
    assert.equal(gradeResponse(q, 'london'), false)
  })
  test('case-sensitive when flagged', () => {
    const cq = { question_type: 'short_text', accept: ['NaCl'], case_sensitive: true }
    assert.equal(gradeResponse(cq, 'NaCl'), true)
    assert.equal(gradeResponse(cq, 'nacl'), false)
  })
})

describe('order', () => {
  const q = { question_type: 'order', items: ['first', 'second', 'third'] }
  test('correct only when fully in order', () => {
    assert.equal(gradeResponse(q, ['first', 'second', 'third']), true)
    assert.equal(gradeResponse(q, ['second', 'first', 'third']), false)
  })
  test('completeness needs all items placed', () => {
    assert.equal(responseIsComplete(q, ['first', 'second']), false)
    assert.equal(responseIsComplete(q, ['a', 'b', 'c']), true)
  })
})

describe('hotspot', () => {
  const q = {
    question_type: 'hotspot',
    hotspots: [
      { label: 'Nucleus', x: 40, y: 40, w: 20, h: 20, correct: true },
      { label: 'Membrane', x: 0, y: 0, w: 10, h: 10, correct: false },
    ],
  }
  test('correct only when the chosen region is the correct one', () => {
    assert.equal(gradeResponse(q, 0), true)
    assert.equal(gradeResponse(q, 1), false)
  })
  test('out-of-range / missing is incorrect and incomplete', () => {
    assert.equal(gradeResponse(q, 5), false)
    assert.equal(responseIsComplete(q, null), false)
    assert.equal(responseIsComplete(q, 1), true)
  })
  test('describes the correct region label', () => {
    assert.equal(describeCorrectAnswer(q), 'Nucleus')
  })
})

describe('image_label', () => {
  const q = {
    question_type: 'image_label',
    markers: [
      { x: 20, y: 30, answer: 'Anode' },
      { x: 70, y: 30, answer: 'Cathode' },
    ],
    labels: ['Anode', 'Cathode', 'Electrolyte'],
  }
  test('correct only when every marker has its right label', () => {
    assert.equal(gradeResponse(q, ['Anode', 'Cathode']), true)
    assert.equal(gradeResponse(q, ['Cathode', 'Anode']), false)
  })
  test('completeness requires every marker assigned', () => {
    assert.equal(responseIsComplete(q, ['Anode', null]), false)
    assert.equal(responseIsComplete(q, ['Anode', 'Cathode']), true)
  })
  test('empty response is a null slot per marker', () => {
    assert.deepEqual(emptyResponse(q), [null, null])
  })
  test('describes correct labelling', () => {
    assert.equal(describeCorrectAnswer(q), '1 → Anode, 2 → Cathode')
  })
})

describe('emptyResponse', () => {
  test('returns the right empty shape per type', () => {
    assert.deepEqual(emptyResponse({ question_type: 'multi_select' }), [])
    assert.equal(emptyResponse({ question_type: 'numeric' }), '')
    assert.equal(emptyResponse({ question_type: 'short_text' }), '')
    assert.deepEqual(emptyResponse({ question_type: 'order' }), [])
    assert.equal(emptyResponse({ question_type: 'mcq' }), null)
  })
})
