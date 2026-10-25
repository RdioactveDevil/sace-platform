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
  lines.push(
    '',
    'When the student asks about this question, explain why the correct answer is right, and why each of the other options is wrong (what misconception or slip would lead someone to pick it).' +
      (ctx.answeredCorrectly === false && ctx.studentAnswer ? ' Pay most attention to the answer they chose and the thinking that likely led to it.' : ''),
  )
  return lines.join('\n')
}

/** The hidden first message that starts the chat from a quiz question. */
export function questionHelpOpeningPrompt(ctx, firstName) {
  const hasOptions = ctx?.options?.length > 1
  const chose = ctx?.answeredCorrectly === false && ctx?.studentAnswer
    ? `They answered ${ctx.studentAnswer}, which was incorrect.`
    : ctx?.answeredCorrectly === true
      ? 'They got it right, but want to understand it properly.'
      : ''
  return [
    `${firstName || 'The student'} just answered the quiz question in your instructions and asked for help with it. ${chose}`,
    'Greet them warmly by first name, then explain:',
    '1. Why the correct answer is right, working it through step by step.',
    hasOptions
      ? '2. Why each of the other options is wrong, one short line per option naming the mistake or misconception behind it.'
      : '2. If their answer was wrong, what most likely went wrong in their working.',
    'This first reply can be longer than your usual 3–4 sentences so it covers every option, but stay concise.',
    'Finish by asking one short question that checks they understood the key idea.',
  ].join('\n')
}
