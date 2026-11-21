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

const LIMITS = { items: 60, label: 300, help: 500, options: 20, optionLabel: 200, intro: 2000 }

/** The first problem the server would reject, as a message; null when the draft is fine. */
export function validateDraft(q) {
  const items = q?.items || []
  if (String(q?.intro ?? '').length > LIMITS.intro) return `The introduction can be at most ${LIMITS.intro} characters.`
  if (items.length > LIMITS.items) return `A questionnaire can have at most ${LIMITS.items} items.`
  let n = 0
  for (const it of items) {
    const isSection = it.type === 'section'
    if (!isSection) n++
    const where = isSection ? 'A section heading' : `Question ${n}`
    const label = String(it.label ?? '').trim()
    if (!label) return `${where} needs some text.`
    if (label.length > LIMITS.label) return `${where} is too long (up to ${LIMITS.label} characters).`
    if (String(it.help ?? '').trim().length > LIMITS.help) return `The hint on question ${n} is too long (up to ${LIMITS.help} characters).`
    if (hasOptions(it.type)) {
      const opts = it.options || []
      if (opts.length === 0) return `${where} needs at least one choice.`
      if (opts.length > LIMITS.options) return `${where} can have at most ${LIMITS.options} choices.`
      for (const o of opts) {
        const ol = String(o.label ?? '').trim()
        if (!ol) return `${where} has a blank choice. Fill it in or remove it.`
        if (ol.length > LIMITS.optionLabel) return `A choice on question ${n} is too long (up to ${LIMITS.optionLabel} characters).`
      }
    }
  }
  if (n === 0) return 'Add at least one question.'
  return null
}

/** A deep copy, so editing it never touches the original. */
export function cloneQuestionnaire(q) {
  return JSON.parse(JSON.stringify({ intro: q.intro ?? '', items: q.items ?? [] }))
}
