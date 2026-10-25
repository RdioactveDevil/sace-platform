// What Titan AI is told about a quiz question the student asks for help with.
//
// The quiz's "Get Titan's Help" button sends buildQuestionHelpContext(); Titan
// keeps questionHelpSystemSection() in its instructions for the whole chat, so
// follow-up questions ("why is B wrong?") still know the question, its options
// and what the student answered.

import { getQuestionType, describeCorrectAnswer } from './questionTypes.js'

const LETTERS = 'ABCDEFGH'

const letter = (i) => LETTERS[i] ?? String(i + 1)

function optionsOf(q) {
  if (Array.isArray(q?.options)) return q.options
  if (typeof q?.options === 'string') {
    try { const parsed = JSON.parse(q.options); return Array.isArray(parsed) ? parsed : null } catch { return null }
  }
  return null
}

/** The student's response in words, e.g. "B. 2" or "3.5 mol". Empty if there's none. */
export function describeResponse(q, response) {
  if (response == null || response === '') return ''
  const options = optionsOf(q) || []
  switch (getQuestionType(q)) {
    case 'mcq':
      return Number.isInteger(response) ? `${letter(response)}. ${options[response] ?? ''}`.trim() : ''
    case 'multi_select':
      return Array.isArray(response) ? response.map(i => `${letter(i)}. ${options[i] ?? ''}`.trim()).join('; ') : ''
    case 'numeric':
      return `${response}${q.unit ? ` ${q.unit}` : ''}`
    case 'short_text':
      return String(response)
    case 'order':
      return Array.isArray(response) ? response.join(' → ') : ''
    case 'hotspot':
      return Number.isInteger(response) ? (q.hotspots?.[response]?.label ?? `region ${response + 1}`) : ''
    case 'image_label':
      return Array.isArray(response) ? response.map((a, i) => `${i + 1} → ${a ?? '(blank)'}`).join(', ') : ''
    default:
      return ''
  }
}

/**
 * Everything Titan needs about a question: the full question, every option,
 * the correct answer, what the student answered and whether it was right, the
 * worked solution and any reading passage or table it refers to.
 */
export function buildQuestionHelpContext(q, response = null, answeredCorrectly = null) {
  const type = getQuestionType(q)
  const options = type === 'mcq' || type === 'multi_select' ? optionsOf(q) : null
  const table = q?.table_data
  return {
    topic: q?.topic || '',
    subtopic: q?.subtopic || '',
    question: q?.question || '',
    questionType: type,
    options,
    correctIndices: type === 'mcq' ? [q.answer_index] : type === 'multi_select' ? (q.answer_indices || []) : [],
    correctAnswer: describeCorrectAnswer(options ? { ...q, options } : q),
    studentAnswer: describeResponse(q, response),
    answeredCorrectly,
    solution: q?.solution || '',
    passage: q?.passage?.body ? { title: q.passage.title || '', body: q.passage.body } : null,
    table: table && (table.headers?.length || table.rows?.length)
      ? [table.caption, (table.headers || []).join(' | '), ...(table.rows || []).map(r => r.join(' | '))].filter(Boolean).join('\n')
      : '',
    hasVisual: !!(q?.graph || q?.diagram || q?.image_url),
  }
}

/** The question, as a block of Titan's instructions for the whole chat. */
export function questionHelpSystemSection(ctx) {
  if (!ctx?.question) return ''
  const lines = ['QUESTION THE STUDENT IS ASKING ABOUT (from their quiz):']
  if (ctx.passage) lines.push(`Reading passage${ctx.passage.title ? ` "${ctx.passage.title}"` : ''}:`, ctx.passage.body, '')
  lines.push(`Question: ${ctx.question}`)
  if (ctx.table) lines.push('Table shown with the question:', ctx.table)
  if (ctx.hasVisual) lines.push('(The question also shows a graph or diagram that isn\'t included here. Don\'t describe details of it you can\'t see.)')
  if (ctx.options?.length) {
    lines.push('Options:')
    ctx.options.forEach((o, i) => lines.push(`${letter(i)}. ${o}${ctx.correctIndices.includes(i) ? '   ← correct' : ''}`))
  }
  lines.push(`Correct answer: ${ctx.correctAnswer || '(not recorded)'}`)
  if (ctx.studentAnswer) {
    const verdict = ctx.answeredCorrectly === true ? ' (correct)' : ctx.answeredCorrectly === false ? ' (incorrect)' : ''
    lines.push(`The student answered: ${ctx.studentAnswer}${verdict}`)
  }
  if (ctx.solution) lines.push(`Worked solution: ${ctx.solution}`)
  const choseWrong = ctx.answeredCorrectly === false && ctx.studentAnswer
  lines.push(
    '',
    'HOW TO HELP WITH THIS QUESTION (tutor it; don\'t solve it for them):',
    '- Guide them one step at a time. Each reply covers ONE step: a short hint or question that gets them to do the next bit themselves. 3–4 sentences at most, then wait for their answer.',
    '- Never write out the full working or reveal the correct option up front. Check each answer they give before moving on; if they\'re stuck after a nudge, give a slightly bigger hint.',
    ...(choseWrong ? ['- Start from the answer they chose: say what makes it tempting, then guide them to where that thinking goes wrong.'] : []),
    ...(ctx.options?.length > 1
      ? ['- Once they\'ve reached the correct answer themselves, go through why the other options are wrong, one or two at a time, asking them to spot the slip behind each (e.g. "What mistake would give that answer?").']
      : []),
    '- If they ask outright for the full solution, give it clearly and concisely, then check they follow it.',
  )
  return lines.join('\n')
}

/**
 * The hidden first message that starts the chat from a quiz question: a short
 * opener that starts guiding, not the worked answer (see "How to help with
 * this question" in the instructions).
 */
export function questionHelpOpeningPrompt(ctx, firstName) {
  const choseWrong = ctx?.answeredCorrectly === false && ctx?.studentAnswer
  const gotItRight = ctx?.answeredCorrectly === true
  return [
    `${firstName || 'The student'} just answered the quiz question in your instructions and asked for help with it.` +
      (choseWrong ? ` They answered ${ctx.studentAnswer}, which was incorrect.` : gotItRight ? ' They got it right, but want to understand it properly.' : ''),
    'Greet them warmly by first name and start tutoring it, following "How to help with this question":',
    choseWrong
      ? `- In one sentence, acknowledge their answer (${ctx.studentAnswer}) without saying what the right answer is.`
      : gotItRight
        ? '- Ask them to explain in a sentence how they got their answer, so you can build on their thinking.'
        : '- Say in one sentence what the question is really asking.',
    '- Then ask ONE short question that gets them thinking about the first step.',
    'Keep this reply to 2–4 sentences. Don\'t give the answer or any working yet.',
  ].join('\n')
}
