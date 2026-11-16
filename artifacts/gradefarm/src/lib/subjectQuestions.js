// Filtering a subject's questions on its Questions page in Admin
// (components/AdminSubjectQuestions.jsx).

import { getQuestionType, QUESTION_TYPES } from './questionTypes.js'

export const SOURCE_FILTERS = [
  ['all', 'All sources'],
  ['ai', 'Written by AI'],
  ['paper', 'Past and trial papers'],
  ['other', 'Other sources'],
]

export const FLAG_FILTERS = [
  ['any', 'Any status'],
  ['reported', 'Reported'],
  ['hidden', 'Hidden from this subject'],
  ['visible', 'Not hidden'],
]

export const TYPE_FILTERS = [['all', 'All types'], ...Object.entries(QUESTION_TYPES).map(([id, t]) => [id, t.label]), ['extended', 'Exam question (parts)']]

/** A question's type, including multi-part exam questions (Section B of a loaded paper). */
export const questionKind = (q) => (q?.question_type === 'extended' ? 'extended' : getQuestionType(q))

/** The type's name for a list. */
export const questionKindLabel = (q) => (questionKind(q) === 'extended' ? 'Exam question (parts)' : QUESTION_TYPES[getQuestionType(q)].label)

/** Where a question came from: 'paper' (a past or trial exam), 'ai' (no source recorded) or 'other'. */
export function questionSource(q) {
  if (q?.source_kind === 'official' || q?.source_kind === 'commercial' || q?.exam_section) return 'paper'
  if (!q?.source_kind && !q?.source) return 'ai'
  return 'other'
}

/**
 * The questions that match the filters. `text` matches an id exactly, or
 * every word in the question. `reported` and `hidden` are Sets of ids.
 */
export function filterSubjectQuestions(rows, f = {}, { reported = new Set(), hidden = new Set() } = {}) {
  const words = String(f.text || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const exactId = words.length === 1 ? words[0] : null
  return (rows || []).filter(q => {
    if (f.topic && q.topic !== f.topic) return false
    if (f.subtopic && q.subtopic !== f.subtopic) return false
    if (f.type && f.type !== 'all' && questionKind(q) !== f.type) return false
    if (f.difficulty && Number(q.difficulty) !== Number(f.difficulty)) return false
    if (f.source && f.source !== 'all' && questionSource(q) !== f.source) return false
    if (f.flag === 'reported' && !reported.has(q.id)) return false
    if (f.flag === 'hidden' && !hidden.has(q.id)) return false
    if (f.flag === 'visible' && hidden.has(q.id)) return false
    if (words.length) {
      if (exactId && String(q.id).toLowerCase() === exactId) return true
      const text = String(q.question || '').toLowerCase()
      if (!words.every(w => text.includes(w))) return false
    }
    return true
  })
}
