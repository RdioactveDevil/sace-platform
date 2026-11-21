// The pre-call questionnaire's form state, drafts and payload (the page is
// components/QuestionnaireScreen.jsx; the server's rules are in the api-server's
// lib/questionnaire.ts validateAnswers).
//
// Form state, by question id:
//   short / long: string
//   one:  { choice: option id | 'other' | '', other: string }
//   many: { picked: option ids, otherOn: boolean, other: string }

export const draftKey = token => `gf-questionnaire-draft-${token}`

const defaultStorage = () => { try { return globalThis.localStorage } catch { return undefined } }

/** The saved draft, or {} (no draft, bad data, or storage blocked). */
export function loadDraft(token, storage = defaultStorage()) {
  try {
    const parsed = JSON.parse(storage.getItem(draftKey(token)))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}

/** Save the draft; never throws. Saving an empty draft removes it. */
export function saveDraft(token, answers, storage = defaultStorage()) {
  try {
    if (!answers || Object.keys(answers).length === 0) storage.removeItem(draftKey(token))
    else storage.setItem(draftKey(token), JSON.stringify(answers))
  } catch { /* private mode or blocked storage: the form still works */ }
}

export function clearDraft(token, storage = defaultStorage()) {
  try { storage.removeItem(draftKey(token)) } catch { /* ignore */ }
}

const text = v => (typeof v === 'string' ? v.trim() : '')
const answerable = item => item.type !== 'section'

// The answer for one question as the server takes it, or undefined when blank.
function answerFor(item, v) {
  if (item.type === 'short' || item.type === 'long') return text(v) || undefined
  const options = new Set((item.options || []).map(o => o.id))
  if (item.type === 'one') {
    const choice = v?.choice
    if (choice === 'other') {
      const other = item.other ? text(v.other) : ''
      return other ? { choice: 'other', other } : undefined
    }
    return typeof choice === 'string' && options.has(choice) ? choice : undefined
  }
  const picked = Array.isArray(v?.picked) ? v.picked.filter(id => options.has(id)) : []
  const other = item.other && v?.otherOn ? text(v.other) : ''
  if (picked.length === 0 && !other) return undefined
  return other ? [...picked, { other }] : picked
}

/** Ids of required questions with no answer yet. */
export function missingRequired(questionnaire, state) {
  return questionnaire.items
    .filter(item => answerable(item) && item.required && answerFor(item, state?.[item.id]) === undefined)
    .map(item => item.id)
}

/** The answers to send: blanks left out. */
export function toPayload(questionnaire, state) {
  const out = {}
  for (const item of questionnaire.items) {
    if (!answerable(item)) continue
    const a = answerFor(item, state?.[item.id])
    if (a !== undefined) out[item.id] = a
  }
  return out
}
