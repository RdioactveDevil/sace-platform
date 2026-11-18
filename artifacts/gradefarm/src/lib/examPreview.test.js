import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scramble, previewExam, isRedactedBlock } from './examPreview.js'

test('scrambled text keeps its shape but none of its words', () => {
  const text = 'Find the value of $\\frac{x}{2}$ when x = 14.'
  const out = scramble(text, 'q1')
  assert.notEqual(out, text)
  assert.ok(!/Find|value|frac|\$/.test(out))
  assert.equal(out.split(' ').length > 4, true)
  assert.equal(scramble(text, 'q1'), out, 'the same every time')
})

test('the first page of questions keeps its text and the rest is scrambled', () => {
  const B = [1, 2, 3, 4].map(n => ({ id: `b${n}`, exam_section: 'B', question: `Question ${n} about kinetics`, parts: [{ label: 'a', text: 'Explain why.', marks: 4 }] }))
  const { exam, redact } = previewExam({ A: [], B })
  assert.equal(exam.B[0].question, 'Question 1 about kinetics')
  assert.equal(exam.B[1].question, 'Question 2 about kinetics')
  assert.notEqual(exam.B[2].question, 'Question 3 about kinetics')
  assert.deepEqual([...redact], ['b3', 'b4'])
  assert.equal(exam.B[3].parts[0].marks, 4, 'marks stay, so the pages lay out the same')
})

test('multiple-choice questions fill a page five at a time', () => {
  const A = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, exam_section: 'A', question: 'Which is true?', options: ['One', 'Two'] }))
  const { redact } = previewExam({ A, B: [] })
  assert.deepEqual([...redact], ['a5', 'a6', 'a7'])
})

test("a set is kept or scrambled whole, and its shared information's block is found", () => {
  const A = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, exam_section: 'A', question: 'Q' })),
    { id: 'a4', exam_section: 'A', question: 'Q', set_key: 'k' }, { id: 'a5', exam_section: 'A', question: 'Q', set_key: 'k' },
    { id: 'a6', exam_section: 'A', question: 'Q', set_key: 'm' }, { id: 'a7', exam_section: 'A', question: 'Q', set_key: 'm' },
  ]
  const { redact } = previewExam({ A, B: [] })
  assert.ok(!redact.has('a5'), 'kept with the rest of its set')
  assert.ok(redact.has('a6') && redact.has('a7') && redact.has('set:m'))
  assert.equal(isRedactedBlock('A-set-m', redact), true)
  assert.equal(isRedactedBlock('A-set-k', redact), false)
  assert.equal(isRedactedBlock('S-a6-2', redact), true)
  assert.equal(isRedactedBlock('B-a1', redact), false)
})
