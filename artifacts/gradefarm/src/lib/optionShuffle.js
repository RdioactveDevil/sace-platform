// Practice shows each multiple-choice question's options in a shuffled order.
//
// The bank's AI-written questions put the right answer first far more often
// than last, so in stored order the answer was A about 40% of the time and D
// under 10%. Practice shows each question's options in an order of its own
// (the same order every time that student sees that question), so the answer
// lands on each letter about equally often. The bank and the server keep the
// stored order: the screen translates at its edges only.
//
//   order[displayIndex] = originalIndex   (null: shown as stored)
//
// Kept as stored: anything that isn't a multiple-choice question, real past
// and trial paper questions (their letters are the paper's), and questions
// whose options refer to each other ("All of the above", "Both A and B").

import { getQuestionType } from './questionTypes.js'

const LETTERS = 'ABCDEFGH'

/** A 32-bit hash of a string (FNV-1a, then mixed), to seed the shuffle. */
function hashKey(key) {
  const s = String(key)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** A small seeded random number generator (mulberry32). */
function seededRandom(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// "All of the above", "None of these", "Both of them"…
const REFERS_TO_ALL = /\b(?:all|none|both|neither|any|either|each)\s+(?:of\s+)?(?:the\s+)?(?:above|below|these|those|them|preceding|previous|options|answers|choices)\b/i
// An option that is just "Both", "Neither", "None" or "All".
const BARE_REFERENCE = /^\s*(?:all|none|both|neither)\s*[.!]?\s*$/i
// "All are correct", "Neither is correct", "All three", "All four of these".
const VERDICT_ON_OTHERS = /\b(?:all|none|both|neither)\s+(?:is|are)\s+(?:correct|incorrect|true|false|right|wrong)\b|\ball\s+(?:two|three|four|five|2|3|4|5)\b/i

/** "A and B", "B or C", "(A) & (D)", "A, C": two of this question's letters joined. */
function refersToLetters(text, count) {
  const L = `[${LETTERS.slice(0, count)}]`
  return new RegExp(`(?:^|[^\\w])\\(?${L}\\)?\\s*(?:,|and|or|&|/)\\s*\\(?${L}\\)?(?!\\w)`).test(text)
}

/** "A. 2", "B) 3", "(C) 4": options that carry their own letters. */
const OWN_LABEL = (i) => new RegExp(`^\\s*\\(?${LETTERS[i]}[.)]\\s`)

function isPastPaper(q) {
  if (q.source_kind === 'official' || q.source_kind === 'commercial' || q.exam_section) return true
  // Practice variants carry `source` as where remediation found them ('bank',
  // 'prebuilt', 'ai_generated', 'concept_builder'), not a paper.
  return !q.is_variant && !!q.source
}

/**
 * The order to show a question's options in (order[displayIndex] =
 * originalIndex), the same every time for the same `seedKey`; or null when
 * the question is shown as stored.
 */
export function optionOrder(question, seedKey) {
  const q = question
  if (!q || getQuestionType(q) !== 'mcq') return null
  const options = q.options
  if (!Array.isArray(options) || options.length < 2 || options.length > LETTERS.length) return null
  if (isPastPaper(q)) return null
  const texts = options.map(o => String(o ?? ''))
  if (texts.some(t => REFERS_TO_ALL.test(t) || BARE_REFERENCE.test(t) || VERDICT_ON_OTHERS.test(t) || refersToLetters(t, texts.length))) return null
  if (texts.every((t, i) => OWN_LABEL(i).test(t))) return null

  const rand = seededRandom(hashKey(seedKey))
  const order = texts.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

/** The stored index of the option shown at `displayIndex`. */
export function toOriginal(order, displayIndex) {
  if (!Array.isArray(order) || !Number.isInteger(displayIndex) || displayIndex < 0 || displayIndex >= order.length) return displayIndex
  return order[displayIndex]
}

/** Where the option stored at `originalIndex` is shown. */
export function toDisplay(order, originalIndex) {
  if (!Array.isArray(order) || !Number.isInteger(originalIndex)) return originalIndex
  const d = order.indexOf(originalIndex)
  return d >= 0 ? d : originalIndex
}

// Option references in solution and tip text. Only patterns clearly about an
// option change, and when in doubt a letter is left alone (a missed relabel is
// better than changing "Carbon (C)" or "A cell"):
//   "option B", "choice D"                  a letter straight after option/choice
//   "answer (C)", "the answer is D."         after "answer" (or "option is", ":"),
//                                            a bare letter only before the end,
//                                            punctuation or is/because/since/as/and/or
//   "options A and C"                        lists of letters
//   "(B) forgets…", "(A) and (C)"            a bracketed letter starting a sentence
//                                            or clause, before a lower-case word,
//                                            or listed with other bracketed letters
//   "B is incorrect"                         at the start of a sentence or clause
// Never a letter in a range ("A–C", "A to C") or joined by a hyphen ("A-level").
const NO_JOIN = String.raw`(?![\w'’\-–—])`
const ONE_LETTER = String.raw`\(?[A-H]\)?${NO_JOIN}`
const PAREN = String.raw`\([A-H]\)${NO_JOIN}`
const JOIN = String.raw`(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or|&)\s+|\s*\/\s*)`
const NOT_MATHS = String.raw`(?!\s*[=<>+*/^])`
const KEYWORD = String.raw`\b(?<kw>(?:[Oo]ptions?|[Aa]nswers?|[Cc]hoices?|[Aa]lternatives?)(?:\s+(?:is|was|are|were)\s+|\s*:\s*|\s+|(?=\()))(?<kwList>${ONE_LETTER}(?:${JOIN}${ONE_LETTER})*)${NOT_MATHS}`
const PAREN_START = String.raw`(?<psPre>^|[.;:!?]\s+|\n\s*)(?<psList>${PAREN}(?:${JOIN}${PAREN})*)(?=\s+[a-z]|\s*[:,])${NOT_MATHS}`
const PAREN_LIST = String.raw`(?<plPre>^|[^\w])(?<plList>${PAREN}(?:${JOIN}${PAREN})+)${NOT_MATHS}`
const VERDICT = String.raw`(?<vPre>^|[.;:!?]\s+|\n\s*|,\s+|\b(?:and|but|while|whereas)\s+)(?<vLetter>[A-H])(?=\s+(?:is|was)\s+(?:not\s+|also\s+)?(?:incorrect|correct|wrong|right|the\s+(?:correct\s+|right\s+|best\s+)?answer)(?![-\w]))`
const REFERENCE = new RegExp(`${KEYWORD}|${PAREN_START}|${PAREN_LIST}|${VERDICT}`, 'g')
// What may follow a bare letter after "answer" / "option is" / ":".
const AFTER_BARE = /^(?:\s*$|\s*[.,;:!?)\]]|\s+(?:is|was|are|were|because|since|as|and|or)\b)/
const RANGE_AFTER = /^\s*(?:[-–—]|to\b|through\b)/
// Maths ($…$, $$…$$, \(…\), \[…\]) is left as it is.
const MATHS = /(\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/

/**
 * `text` with its option letters moved from the stored order to the displayed
 * one, in one pass (each letter is mapped once, from the original).
 */
export function relabelLetters(text, order) {
  if (typeof text !== 'string' || !text || !Array.isArray(order)) return text
  const inRange = (letter) => LETTERS.indexOf(letter) < order.length
  const map = (letter) => (inRange(letter) ? LETTERS[toDisplay(order, LETTERS.indexOf(letter))] : letter)
  const mapAll = (s) => s.replace(/[A-H]/g, map)
  return text.split(MATHS).map((part, i) => (i % 2 ? part : part.replace(REFERENCE, (...args) => {
    const m = args[0]
    const g = args[args.length - 1]
    const after = args[args.length - 2].slice(args[args.length - 3] + m.length)
    if (g.kwList != null) {
      if (RANGE_AFTER.test(after)) return m
      // A bare letter straight after option/choice is clear; after "answer",
      // "is" or ":" it could be an article ("the answer is A cell").
      const direct = /^(?:options?|choices?|alternatives?)\s+$/i.test(g.kw)
      if (!/\)$/.test(g.kwList) && !direct && !AFTER_BARE.test(after)) return m
      return g.kw + mapAll(g.kwList)
    }
    if (g.psList != null || g.plList != null) {
      const list = g.psList ?? g.plList
      if (RANGE_AFTER.test(after) || !list.match(/[A-H]/g).every(inRange)) return m
      return (g.psPre ?? g.plPre) + mapAll(list)
    }
    return g.vPre + map(g.vLetter)
  }))).join('')
}

/**
 * The server's answer fields (`reveal`) for a question shown in `order`: the
 * answer at its displayed index, the solution and tip with displayed letters.
 */
export function presentReveal(reveal, order) {
  if (!reveal || !Array.isArray(order)) return reveal
  const out = { ...reveal }
  if (Number.isInteger(reveal.answer_index)) out.answer_index = toDisplay(order, reveal.answer_index)
  if (typeof reveal.solution === 'string') out.solution = relabelLetters(reveal.solution, order)
  if (typeof reveal.tip === 'string') out.tip = relabelLetters(reveal.tip, order)
  return out
}

/**
 * The question as practice shows it: options in their shuffled order, the
 * order kept as `option_order`, and any answer or solution already in hand
 * moved to match. Unchanged when it isn't shuffled, or already is.
 */
export function presentQuestion(question, seedKey) {
  if (!question || Array.isArray(question.option_order)) return question
  const order = optionOrder(question, seedKey)
  if (!order) return question
  return presentReveal({ ...question, options: order.map(i => question.options[i]), option_order: order }, order)
}

/** A presented question back in its stored order (as the bank has it). */
export function storedQuestion(question) {
  if (!question || !Array.isArray(question.option_order)) return question
  const { option_order: order, ...rest } = question
  const options = []
  order.forEach((original, d) => { options[original] = question.options[d] })
  // The inverse order maps the displayed letters back to the stored ones.
  const inverse = []
  order.forEach((original, d) => { inverse[original] = d })
  const out = { ...rest, options }
  if (Number.isInteger(rest.answer_index)) out.answer_index = toOriginal(order, rest.answer_index)
  if (typeof rest.solution === 'string') out.solution = relabelLetters(rest.solution, inverse)
  if (typeof rest.tip === 'string') out.tip = relabelLetters(rest.tip, inverse)
  return out
}
