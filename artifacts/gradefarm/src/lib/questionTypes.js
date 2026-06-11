// Multi-format question engine.
//
// Every question carries an optional `question_type`. When it is absent or
// 'mcq' the question behaves exactly like the legacy 4-option multiple choice,
// so the entire existing bank keeps working untouched. New types add their own
// answer fields alongside the legacy ones.
//
// Supported types and the fields they read:
//   mcq          → options: string[], answer_index: number
//   multi_select → options: string[], answer_indices: number[]
//   numeric      → answer: number, tolerance?: number, unit?: string
//   short_text   → accept: string[], case_sensitive?: boolean
//   order        → items: string[]  (already in CORRECT order)
//
// A "response" is whatever the renderer collects from the student:
//   mcq          → number (chosen index)
//   multi_select → number[] (chosen indices)
//   numeric      → string | number
//   short_text   → string
//   order        → string[] (items in the student's order)

export const QUESTION_TYPES = {
  mcq:          { label: 'Multiple choice',  needsCheckButton: false },
  multi_select: { label: 'Multiple select',  needsCheckButton: true },
  numeric:      { label: 'Numeric answer',   needsCheckButton: true },
  short_text:   { label: 'Short answer',     needsCheckButton: true },
  order:        { label: 'Put in order',     needsCheckButton: true },
  hotspot:      { label: 'Click the region', needsCheckButton: true },
  image_label:  { label: 'Label the diagram', needsCheckButton: true },
}

export function getQuestionType(question) {
  const t = question?.question_type
  return t && QUESTION_TYPES[t] ? t : 'mcq'
}

export function needsCheckButton(question) {
  return QUESTION_TYPES[getQuestionType(question)].needsCheckButton
}

function normalizeText(s, caseSensitive) {
  let v = String(s ?? '').trim().replace(/\s+/g, ' ')
  if (!caseSensitive) v = v.toLowerCase()
  return v
}

function arraysEqualAsSets(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size !== sb.size) return false
  for (const x of sa) if (!sb.has(x)) return false
  return true
}

function arraysEqualOrdered(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  return a.every((x, i) => x === b[i])
}

/**
 * Returns true when a response is "filled in enough" to be graded — used to
 * enable the Check button. For mcq, selecting any option is enough.
 */
export function responseIsComplete(question, response) {
  switch (getQuestionType(question)) {
    case 'mcq':
      return Number.isInteger(response) && response >= 0
    case 'multi_select':
      return Array.isArray(response) && response.length > 0
    case 'numeric': {
      if (response === '' || response == null) return false
      return !Number.isNaN(parseFloat(response))
    }
    case 'short_text':
      return typeof response === 'string' && response.trim().length > 0
    case 'order':
      return Array.isArray(response) && response.length === (question.items?.length || 0)
    case 'hotspot':
      return Number.isInteger(response) && response >= 0
    case 'image_label': {
      const markers = question.markers || []
      return Array.isArray(response)
        && response.length === markers.length
        && response.every((x) => x != null && x !== '')
    }
    default:
      return false
  }
}

/**
 * Grade a response. Pure — no side effects. Returns a boolean correctness.
 */
export function gradeResponse(question, response) {
  switch (getQuestionType(question)) {
    case 'mcq':
      return response === question.answer_index

    case 'multi_select':
      return arraysEqualAsSets(response, question.answer_indices || [])

    case 'numeric': {
      const val = parseFloat(response)
      const target = parseFloat(question.answer)
      if (Number.isNaN(val) || Number.isNaN(target)) return false
      const tol = Math.abs(parseFloat(question.tolerance) || 0)
      return Math.abs(val - target) <= tol + 1e-9
    }

    case 'short_text': {
      const cs = !!question.case_sensitive
      const got = normalizeText(response, cs)
      const accept = Array.isArray(question.accept) ? question.accept : []
      return accept.some((a) => normalizeText(a, cs) === got)
    }

    case 'order':
      return arraysEqualOrdered(response, question.items || [])

    case 'hotspot': {
      const hs = question.hotspots || []
      return Number.isInteger(response) && response >= 0 && response < hs.length && !!hs[response].correct
    }

    case 'image_label': {
      const markers = question.markers || []
      if (!Array.isArray(response) || response.length !== markers.length) return false
      return markers.every((m, i) => response[i] === m.answer)
    }

    default:
      return false
  }
}

/**
 * Human-readable correct answer, for the post-answer explanation panel.
 * May contain LaTeX/chem and should be rendered through MathText.
 */
export function describeCorrectAnswer(question) {
  switch (getQuestionType(question)) {
    case 'mcq':
      return question.options?.[question.answer_index] ?? ''

    case 'multi_select':
      return (question.answer_indices || [])
        .map((i) => question.options?.[i])
        .filter(Boolean)
        .join(', ')

    case 'numeric':
      return `${question.answer}${question.unit ? ' ' + question.unit : ''}`

    case 'short_text':
      return (question.accept || [])[0] ?? ''

    case 'order':
      return (question.items || []).join(' → ')

    case 'hotspot':
      return (question.hotspots || []).find((h) => h.correct)?.label ?? ''

    case 'image_label':
      return (question.markers || []).map((m, i) => `${i + 1} → ${m.answer}`).join(', ')

    default:
      return ''
  }
}

/**
 * An empty/initial response for a freshly-displayed question.
 */
export function emptyResponse(question) {
  switch (getQuestionType(question)) {
    case 'multi_select': return []
    case 'numeric':      return ''
    case 'short_text':   return ''
    case 'order':        return []
    case 'image_label':  return (question.markers || []).map(() => null)
    case 'hotspot':
    case 'mcq':
    default:             return null
  }
}
