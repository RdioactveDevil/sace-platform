// Helpers for editing a pre-call questionnaire and showing its answers.
// The shapes match the server's (api-server/src/lib/questionnaire.ts).

export const QUESTION_TYPES = [
  { value: 'short', label: 'Short answer' },
  { value: 'long', label: 'Long answer' },
  { value: 'one', label: 'Pick one' },
  { value: 'many', label: 'Pick several' },
  { value: 'section', label: 'Section heading' },
]

const RESERVED = ['__proto__', 'constructor', 'prototype']
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** A random id of 8 url-safe characters. */
export function newId() {
  for (;;) {
    const bytes = new Uint8Array(8)
    globalThis.crypto.getRandomValues(bytes)
    const id = Array.from(bytes, b => ALPHABET[b & 63]).join('')
    if (!RESERVED.includes(id)) return id
  }
}

export const hasOptions = type => type === 'one' || type === 'many'

export function newOption() {
  return { id: newId(), label: '' }
}

export function newItem(type) {
  const item = { id: newId(), type, label: '' }
  if (hasOptions(type)) item.options = [newOption(), newOption()]
  return item
}

/** A copy of items with the one at `index` moved by `delta`; stays put at the ends. */
export function moveItem(items, index, delta) {
  const to = index + delta
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return items.slice()
  const out = items.slice()
  const [it] = out.splice(index, 1)
  out.splice(to, 0, it)
  return out
}

/** The item as another type: label and help kept, options added or dropped as the type needs. */
export function changeType(item, type) {
  const { options, other, required, help, ...rest } = item
  const next = { ...rest, type }
  if (type !== 'section') {
    if (required !== undefined) next.required = required
    if (help !== undefined) next.help = help
  }
  if (hasOptions(type)) {
    next.options = options && options.length ? options : [newOption(), newOption()]
    if (other !== undefined) next.other = other
  }
  return next
}

const optionLabel = (item, id) => (item.options || []).find(o => o.id === id)?.label

/** An answer as the text to show the tutor. */
export function answerText(item, answer) {
  if (answer === undefined || answer === null) return ''
  if (item.type === 'one') {
    if (typeof answer === 'object') return `Other: ${answer.other ?? ''}`
    return optionLabel(item, answer) ?? ''
  }
  if (item.type === 'many') {
    if (!Array.isArray(answer)) return ''
    return answer
      .map(a => (typeof a === 'object' && a ? `Other: ${a.other ?? ''}` : optionLabel(item, a)))
      .filter(Boolean)
      .join(', ')
  }
  return typeof answer === 'string' ? answer : ''
}

/** Whether the answer picked an option the tutor marked as a red flag. */
export function isFlagged(item, answer) {
  if (!hasOptions(item.type) || answer === undefined || answer === null) return false
  const ids = Array.isArray(answer) ? answer : [answer]
  return ids.some(id => typeof id === 'string' && (item.options || []).some(o => o.id === id && o.flag))
}

/** The number of questions in a questionnaire (section headings don't count). */
export function questionCount(q) {
  return (q?.items || []).filter(i => i.type !== 'section').length
}

/**
 * A new tutor's questionnaire until they edit it. Mirrors DEFAULT_QUESTIONNAIRE in
 * api-server/src/lib/questionnaire.ts (keep the two in step); "Reset to the basic set" loads it.
 */
export const BASIC_QUESTIONNAIRE = {
  intro: 'Thanks for booking a call. A few quick questions so we can make the most of our time together.',
  items: [
    { id: 'school', type: 'short', label: 'What school do you attend?', required: true },
    { id: 'results', type: 'short', label: 'What are your current results in this subject?' },
    { id: 'why', type: 'long', label: 'Why are you looking for a tutor?', required: true },
    { id: 'goal', type: 'short', label: 'What is your goal for this subject?' },
    { id: 'other', type: 'long', label: 'Is there anything else we should know before the call?' },
  ],
}

/** A deep copy, so editing it never touches the original. */
export function cloneQuestionnaire(q) {
  return JSON.parse(JSON.stringify({ intro: q.intro ?? '', items: q.items ?? [] }))
}
