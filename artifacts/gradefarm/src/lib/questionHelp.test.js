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

test('Titan knows every option, the correct one, the student\'s answer and the solution', () => {
  const section = questionHelpSystemSection(buildQuestionHelpContext(mcq, 2, false))
  assert.match(section, /Question: What is the pH of 0\.01 M HCl\?/)
  for (const line of ['A. 1', 'B. 2   ← correct', 'C. 12', 'D. 0.01']) assert.ok(section.includes(line), line)
  assert.match(section, /The student answered: C\. 12 \(incorrect\)/)
  assert.match(section, /Worked solution: pH = -log\(0\.01\) = 2/)
})

test('Titan is told to tutor one step at a time, not hand over the working', () => {
  const section = questionHelpSystemSection(buildQuestionHelpContext(mcq, 2, false))
  assert.match(section, /one step at a time/)
  assert.match(section, /3–4 sentences at most, then wait for their answer/)
  assert.match(section, /Never write out the full working or reveal the correct option up front/)
  assert.match(section, /Start from the answer they chose/)
  // The wrong options come after the student has the right answer, a couple at a time.
  assert.match(section, /Once they've reached the correct answer themselves, go through why the other options are wrong, one or two at a time/)
  assert.match(section, /If they ask outright for the full solution, give it/)
})

test('the opener is short, names a wrong choice and gives nothing away', () => {
  const prompt = questionHelpOpeningPrompt(buildQuestionHelpContext(mcq, 2, false), 'Sam')
  assert.match(prompt, /Sam/)
  assert.match(prompt, /They answered C\. 12, which was incorrect/)
  assert.match(prompt, /acknowledge their answer \(C\. 12\) without saying what the right answer is/)
  assert.match(prompt, /ONE short question/)
  assert.match(prompt, /2–4 sentences\. Don't give the answer or any working yet/)
  assert.doesNotMatch(prompt, /each of the other options/)
})

test('a right answer starts from the student\'s own reasoning', () => {
  const ctx = buildQuestionHelpContext(mcq, 1, true)
  assert.match(questionHelpSystemSection(ctx), /The student answered: B\. 2 \(correct\)/)
  assert.doesNotMatch(questionHelpSystemSection(ctx), /Start from the answer they chose/)
  const prompt = questionHelpOpeningPrompt(ctx, 'Sam')
  assert.match(prompt, /got it right/)
  assert.match(prompt, /explain in a sentence how they got their answer/)
})

test('non-MCQ questions carry the student\'s answer instead of options', () => {
  const numeric = { question: 'Moles in 18 g of water?', question_type: 'numeric', answer: 1, unit: 'mol' }
  const ctx = buildQuestionHelpContext(numeric, '2', false)
  assert.equal(ctx.options, null)
  assert.equal(ctx.correctAnswer, '1 mol')
  assert.equal(ctx.studentAnswer, '2 mol')
  assert.match(questionHelpOpeningPrompt(ctx, 'Sam'), /acknowledge their answer \(2 mol\)/)
  assert.doesNotMatch(questionHelpSystemSection(ctx), /Options:/)
  assert.doesNotMatch(questionHelpSystemSection(ctx), /other options are wrong/)
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
