// Checks on a question loaded from an exam paper, so one that came out of the
// ingest wrong is caught before students see it (Admin → Exam papers →
// Loaded papers). Pure functions: the admin page runs them on every question
// as it is now, so a fix clears its flag straight away.
//
// The ingest (scripts/src/ingest-past-paper.ts) also stores, on each question:
//   review_status  'pending' until an admin approves it ('approved') or
//                  rejects it ('rejected'); null for questions loaded before
//                  reviews existed, which stay live.
//   review         { printed_marks, flags: [{ code, where, message }] }: the
//                  total printed with the question, and what a close look at
//                  each cropped figure found (scripts/src/lib/question-review.ts).
//
// A flag is { code, where, message }; `where` is '' for the question itself or
// the part's label.

import { partsOf, sameWords } from './examBuilder.js'
import { parseSetLead } from './questionSets.js'

/** Text that points at a figure: "Figure 3", "shown below", "the diagram above", "in the circles provided". */
const FIGURE_REF = new RegExp([
  String.raw`\bfig(?:ure|\.)\s*\d+`,
  String.raw`\bshown\s+(?:below|above|on the (?:left|right))`,
  String.raw`\b(?:diagram|graph|figure|structures?|table|image|apparatus|plot|curve|spectrum|energy profile|circles?|box|axes)\s+(?:below|above|provided)`,
  String.raw`\bon the (?:diagram|graph|figure|axes|energy profile|grid)\b`,
  String.raw`\bin the (?:circles?|boxe?s?)\b`,
].join('|'), 'i')

/** A reference to another question by its number, which changes when an exam is built. */
const OTHER_QUESTION = /\bquestions?\s+\d+(?:\s*(?:,|and|or|to|&|-|–)\s*\d+)*\b/i

/** Page headers and footers that ended up in the text. */
const FURNITURE = /(\bsection\s+[a-z0-9]+\s*[-–—]\s*(?:question\s+\d+\s*[-–—]\s*)?continued\b|\bturn\s*over\b|\bpage\s+\d+\s+of\s+\d+|\bdo not write in this area\b|\bend of (?:section|question|examination)\b)/i

const MARKDOWN_TABLE = /^\s*\|.*\|\s*$/m

const norm = (s) => String(s || '').replace(/\\ce\{([^}]*)\}/g, '$1').replace(/[$\\{}]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
const sentences = (text) => String(text || '').split(/(?<=[.?!])\s+|\n+/).map(norm).filter(s => s.split(' ').length >= 8)
const hasVisual = (q) => !!(q.image_url || q.graph || q.diagram || q.table_data)

function optionsOf(q) {
  if (Array.isArray(q.options)) return q.options
  try { const o = JSON.parse(q.options || '[]'); return Array.isArray(o) ? o : [] } catch { return [] }
}

/** Everything that looks wrong with a question as it stands. */
export function checkQuestion(q) {
  if (!q) return []
  const flags = []
  const add = (code, where, message) => {
    if (!flags.some(f => f.code === code && f.where === where)) flags.push({ code, where, message })
  }
  const name = (where) => (where ? `Part ${where}` : 'The question')
  const mcq = q.exam_section === 'A' || q.question_type === 'mcq'
  const parts = mcq ? [] : partsOf(q)
  const single = parts.length === 1 && !parts[0].label
  const stem = String(q.question || '')
  // The texts as printed, in order: the stem, then each part.
  const texts = [{ where: '', text: stem }, ...parts.map(p => ({ where: p.label, text: p.text }))]

  // Marks: the parts add up to the total printed with the question.
  const printed = Number(q.review?.printed_marks) || 0
  if (!mcq && printed > 0) {
    const sum = parts.reduce((s, p) => s + p.marks, 0)
    if (sum !== printed) add('marks_mismatch', '', `The parts add up to ${sum} mark${sum === 1 ? '' : 's'}, but the paper prints ${printed}. A part may be missing or its marks misread.`)
  }

  // Text printed twice: a part repeating the stem, or the same sentence twice.
  for (const p of parts) {
    if (p.label && p.text && (sameWords(p.text, stem) || (norm(p.text).split(' ').length >= 8 && norm(stem).includes(norm(p.text))))) {
      add('repeated_text', p.label, `Part ${p.label} repeats text that is already in the question.`)
    }
  }
  const seen = new Set()
  for (const t of texts) {
    for (const s of sentences(t.text)) {
      if (seen.has(s)) add('repeated_text', t.where, `${name(t.where)} prints a sentence that appears earlier: "${s.slice(0, 60)}…"`)
      seen.add(s)
    }
  }

  // A figure the text points to but that isn't there.
  texts.forEach((t, i) => {
    if (!FIGURE_REF.test(t.text) || MARKDOWN_TABLE.test(t.text)) return
    // Parts' texts are texts[1..]: a figure on the question, on any part up to
    // this one, or on the next (whose figure may be printed with this text), counts.
    const k = i - 1
    const near = hasVisual(q) || MARKDOWN_TABLE.test(stem) || parts.some((p, j) => p.image_url && j <= k + 1)
    if (!near) add('figure_missing', t.where, `${name(t.where)} refers to a figure, table or diagram, but none is attached.`)
  })

  // Questions that share information (lib/questionSets.js).
  const lead = parseSetLead(stem)
  if (q.set_key) {
    if (!q.shared_info && !q.shared_image_url) add('set_no_info', '', 'This question is in a set, but the set has no shared information or figure. Add it on the set\'s first question, or break up the set.')
    if (lead) add('set_sentence_left', '', 'The question still starts with "Use the following information…". The exam prints that line itself with its own numbers, so take it out of the question.')
    // The reading sometimes gives a later question the next question's figure.
    if (Number(q.set_position) > 1 && q.image_url && q.shared_image_url && q.image_url !== q.shared_image_url) {
      add('set_own_figure', '', "This question has a figure of its own as well as the set's shared figure. Check against the paper that it belongs to this question and isn't the next question's; remove it if it doesn't.")
    }
  } else if (lead) {
    add('set_not_linked', '', `This question says it shares information with Questions ${lead.numbers.join(', ')}, but they aren't linked as a set. Link them so they stay together.`)
  }

  for (const t of texts) {
    // A set's lead sentence is handled above.
    if (t.where === '' && lead) continue
    // "SECTION B – Question 1 – continued" is a footer, not a reference.
    const plain = t.text.replace(new RegExp(FURNITURE.source, 'gi'), ' ')
    if (OTHER_QUESTION.test(plain)) add('other_question', t.where, `${name(t.where)} refers to another question by number ("${plain.match(OTHER_QUESTION)[0]}"). In a built exam that question is somewhere else or missing.`)
    if (FURNITURE.test(t.text)) add('furniture_in_text', t.where, `${name(t.where)} includes a page header or footer ("${t.text.match(FURNITURE)[0]}").`)
  }

  // Parts with marks but no question, or a question with no marks.
  if (!single) {
    parts.forEach((p, i) => {
      if (p.marks > 0 && !p.text.trim() && !p.image_url) add('empty_part', p.label, `Part ${p.label || i + 1} has ${p.marks} mark${p.marks === 1 ? '' : 's'} but no question.`)
      const introduces = (parts[i + 1]?.level || 0) > p.level
      if (!p.marks && p.text.trim() && !introduces) add('no_marks', p.label, `Part ${p.label || i + 1} has no marks and no sub-parts.`)
    })
  }

  if (mcq) {
    const options = optionsOf(q)
    const distinct = new Set(options.map(norm))
    const ai = Number(q.answer_index)
    if (options.length < 4 || distinct.size < options.length || !Number.isInteger(ai) || ai < 0 || ai >= options.length) {
      add('options', '', `The options don't look right: ${options.length} option${options.length === 1 ? '' : 's'}${distinct.size < options.length ? ', some the same' : ''}${!Number.isInteger(ai) || ai < 0 || ai >= options.length ? ', no valid answer' : ''}.`)
    }
  }
  return flags
}

/** What the ingest found in the question's figures, then the text checks. */
export function reviewFlags(q) {
  const stored = Array.isArray(q?.review?.flags) ? q.review.flags.filter(f => f && f.code && f.message) : []
  const out = stored.map(f => ({ code: String(f.code), where: String(f.where || ''), message: String(f.message) }))
  for (const f of checkQuestion(q)) if (!out.some(o => o.code === f.code && o.where === f.where)) out.push(f)
  return out
}

/** 'pending' | 'approved' | 'rejected'; questions loaded before reviews existed count as approved. */
export function reviewState(q) {
  return q?.review_status === 'pending' || q?.review_status === 'rejected' ? q.review_status : 'approved'
}

/** Approved, so it may go to students. */
export const isReviewed = (q) => reviewState(q) === 'approved'

/**
 * Needs an admin to look at it: waiting for review, or loaded before reviews
 * existed and showing a problem. An approved or rejected question has been
 * looked at already.
 */
export function needsAttention(q, flags = reviewFlags(q)) {
  if (q?.review_status === 'pending') return true
  return !q?.review_status && flags.length > 0
}

/** A paper's questions in review terms: { pending, flagged, rejected, attention, cleanPending: [ids] }. */
export function reviewSummary(questions) {
  const out = { pending: 0, flagged: 0, rejected: 0, attention: 0, cleanPending: [] }
  for (const q of questions || []) {
    const flags = reviewFlags(q)
    if (q.review_status === 'pending') out.pending++
    if (q.review_status === 'rejected') out.rejected++
    if (flags.length && q.review_status !== 'rejected' && q.review_status !== 'approved') out.flagged++
    if (needsAttention(q, flags)) out.attention++
    if (q.review_status === 'pending' && !flags.length) out.cleanPending.push(q.id)
  }
  return out
}

/**
 * Where a paper's review is: 'checked' when every question is approved or
 * rejected, 'partway' when some are, 'unchecked' when none are (including
 * papers loaded before reviews existed). lastAt / lastBy: the latest review
 * (reviewed_at, reviewed_by; migration 20261118000001).
 */
export function paperStatus(questions) {
  const list = questions || []
  const done = list.filter(q => q.review_status === 'approved' || q.review_status === 'rejected')
  const latest = done.filter(q => q.reviewed_at).sort((a, b) => (a.reviewed_at < b.reviewed_at ? 1 : -1))[0]
  return {
    state: list.length && done.length === list.length ? 'checked' : done.length ? 'partway' : 'unchecked',
    checked: done.length,
    total: list.length,
    lastAt: latest?.reviewed_at || null,
    lastBy: latest?.reviewed_by || null,
  }
}
