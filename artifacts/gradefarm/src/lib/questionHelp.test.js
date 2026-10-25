import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildQuestionHelpContext, describeResponse, questionHelpSystemSection, questionHelpOpeningPrompt } from './questionHelp.js'

const mcq = {
  topic: 'Acids and bases',
  subtopic: 'pH',
  question: 'What is the pH of 0.01 M HCl?',
  options: ['1', '2', '12', '0.01'],
  answer_index: 1,
  solution: 'pH = -log(0.01) = 2',
}

test('an MCQ context carries every option, the correct one and what the student chose', () => {
  const ctx = buildQuestionHelpContext(mcq, 2, false)
  assert.deepEqual(ctx.options, ['1', '2', '12', '0.01'])
  assert.deepEqual(ctx.correctIndices, [1])
  assert.equal(ctx.correctAnswer, '2')
  assert.equal(ctx.studentAnswer, 'C. 12')
  assert.equal(ctx.answeredCorrectly, false)
  assert.equal(ctx.subtopic, 'pH')
})

test('the instructions list every option, mark the correct one and ask why the others are wrong', () => {
  const section = questionHelpSystemSection(buildQuestionHelpContext(mcq, 2, false))
  assert.match(section, /Question: What is the pH of 0\.01 M HCl\?/)
  for (const line of ['A. 1', 'B. 2   ← correct', 'C. 12', 'D. 0.01']) assert.ok(section.includes(line), line)
  assert.match(section, /The student answered: C\. 12 \(incorrect\)/)
  assert.match(section, /Worked solution: pH = -log\(0\.01\) = 2/)
  assert.match(section, /why each of the other options is wrong/)
  assert.match(section, /answer they chose/)
})

test('the opening asks for the correct answer and each other option, and names a wrong choice', () => {
  const ctx = buildQuestionHelpContext(mcq, 2, false)
  const prompt = questionHelpOpeningPrompt(ctx, 'Sam')
  assert.match(prompt, /Sam/)
  assert.match(prompt, /They answered C\. 12, which was incorrect/)
  assert.match(prompt, /each of the other options is wrong/)
})

test('a right answer still gets the full explanation', () => {
  const ctx = buildQuestionHelpContext(mcq, 1, true)
  assert.match(questionHelpSystemSection(ctx), /The student answered: B\. 2 \(correct\)/)
  assert.match(questionHelpOpeningPrompt(ctx, 'Sam'), /got it right/)
})

test('non-MCQ questions carry the student\'s answer instead of options', () => {
  const numeric = { question: 'Moles in 18 g of water?', question_type: 'numeric', answer: 1, unit: 'mol' }
  const ctx = buildQuestionHelpContext(numeric, '2', false)
  assert.equal(ctx.options, null)
  assert.equal(ctx.correctAnswer, '1 mol')
  assert.equal(ctx.studentAnswer, '2 mol')
  assert.match(questionHelpOpeningPrompt(ctx, 'Sam'), /what most likely went wrong/)
  assert.doesNotMatch(questionHelpSystemSection(ctx), /Options:/)
})

test('responses are described per question type', () => {
  assert.equal(describeResponse({ question_type: 'multi_select', options: ['a', 'b', 'c'] }, [0, 2]), 'A. a; C. c')
  assert.equal(describeResponse({ question_type: 'order', items: ['x', 'y'] }, ['y', 'x']), 'y → x')
  assert.equal(describeResponse(mcq, null), '')
})

test('passages, tables and unseen visuals are included', () => {
  const q = {
    ...mcq,
    passage: { title: 'The river', body: 'The river ran dry in summer.' },
    table_data: { headers: ['T', 'pH'], rows: [[25, 7]] },
    graph: { type: 'line' },
  }
  const section = questionHelpSystemSection(buildQuestionHelpContext(q, 0, false))
  assert.match(section, /Reading passage "The river":\nThe river ran dry in summer\./)
  assert.match(section, /T \| pH\n25 \| 7/)
  assert.match(section, /graph or diagram that isn't included/)
})

test('options stored as a JSON string are read', () => {
  const ctx = buildQuestionHelpContext({ ...mcq, options: JSON.stringify(mcq.options) }, 0, false)
  assert.equal(ctx.options.length, 4)
  assert.equal(ctx.studentAnswer, 'A. 1')
  assert.equal(ctx.correctAnswer, '2')
})
