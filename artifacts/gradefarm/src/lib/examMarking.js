// The Exams dashboard: self-marked attempts at exams from the exam builder.
// A student downloads an exam, sits it on paper, then marks each part against
// the solutions: marks out of the part's total, or "skipped" when they left it
// blank, so a blank is kept apart from an answer that scored 0.
//
// Pure functions (no I/O) so scores can be tested. Rows are stored in
// built_exam_attempts (migration 20261111000000_built_exam_attempts.sql):
//   snapshot  the exam as it was when the attempt began (see snapshotOf)
//   marks     { "<question id>#<part index>": integer | "skip" }

import { partsOf, marksOf, sourceLabel } from './examBuilder.js'

export const SKIP = 'skip'

/** "(b)(ii)(1)": a part's label with the labels of the parts it sits under. */
function labelPaths(parts) {
  const path = []
  return parts.map(p => {
    path.length = Math.max(0, p.level - 1)
    path[p.level - 1] = p.label ? `(${p.label})` : ''
    return path.join('')
  })
}

/** The first sentence or so of a question's stem, to name it in lists. */
export function shortTitle(text = '', max = 60) {
  const plain = String(text).replace(/\$\$?[^$]*\$\$?/g, '').replace(/\\ce\{([^}]*)\}/g, '$1').replace(/\s+/g, ' ').trim()
  const first = (plain.match(/^[^.?!]*[.?!]?/) || [''])[0].trim() || plain
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first
}

/**
 * The exam as it is now, kept with an attempt. `exam` is { A: [questions],
 * B: [questions] } in paper order. Numbers are as printed: SACE papers count
 * on through both sections; VCE papers start again in Section B.
 */
export function snapshotOf(exam, { title = '', subject = '', board = 'sace' } = {}) {
  const sections = (exam?.A?.length || 0) > 0
  const questions = []
  for (const section of ['A', 'B']) {
    ;(exam?.[section] || []).forEach((q, i) => {
      const number = board === 'vce' && sections ? `${section}${i + 1}` : String(section === 'A' || board === 'vce' ? i + 1 : (exam.A?.length || 0) + i + 1)
      const parts = []
      if (section === 'A') {
        parts.push({ key: `${q.id}#0`, label: '', marks: 1, text: '' })
      } else {
        const ps = partsOf(q)
        const labels = labelPaths(ps)
        ps.forEach((p, k) => { if (p.marks) parts.push({ key: `${q.id}#${k}`, label: labels[k], marks: p.marks, text: p.text || '' }) })
      }
      questions.push({
        id: q.id, number, section, topic: q.topic || '', source: q.source ? sourceLabel(q) : '',
        title: shortTitle(q.question || ''), marks: section === 'A' ? 1 : marksOf(q), parts,
      })
    })
  }
  return { title, subject, board, questions }
}

/** Every part of an attempt's exam, in order. */
export const partRows = (snapshot) => (snapshot?.questions || []).flatMap(q => q.parts.map(p => ({ ...p, question: q })))

/** A stored mark made safe: an integer from 0 to the part's marks, "skip", or undefined. */
export function cleanMark(v, max) {
  if (v === SKIP) return SKIP
  const n = Number(v)
  return v !== null && v !== '' && Number.isInteger(n) && n >= 0 && n <= max ? n : undefined
}

/**
 * Totals for one attempt: marks scored, lost on answers given, and skipped,
 * out of the whole exam (`available`); how many parts have a mark yet.
 */
export function tally(snapshot, marks = {}) {
  let scored = 0, lost = 0, skipped = 0, available = 0, entered = 0, parts = 0
  for (const p of partRows(snapshot)) {
    parts++
    available += p.marks
    const m = cleanMark(marks[p.key], p.marks)
    if (m === undefined) continue
    entered++
    if (m === SKIP) skipped += p.marks
    else { scored += m; lost += p.marks - m }
  }
  const answered = scored + lost
  return {
    scored, lost, skipped, available, entered, parts, complete: parts > 0 && entered === parts,
    percent: available ? Math.round((scored / available) * 100) : 0,
    answeredPercent: answered ? Math.round((scored / answered) * 100) : 0,
  }
}

/** Marks by question, for the result page. */
export function byQuestion(snapshot, marks = {}) {
  return (snapshot?.questions || []).map(q => {
    let scored = 0, skipped = 0, entered = 0
    for (const p of q.parts) {
      const m = cleanMark(marks[p.key], p.marks)
      if (m === undefined) continue
      entered++
      if (m === SKIP) skipped += p.marks
      else scored += m
    }
    return { id: q.id, number: q.number, title: q.title, topic: q.topic, source: q.source, scored, skipped, max: q.marks, entered, parts: q.parts.length }
  })
}

/** Parts that were skipped, as "(b)(ii)(1) in Question 2". */
export function skippedParts(snapshot, marks = {}) {
  return partRows(snapshot).filter(p => cleanMark(marks[p.key], p.marks) === SKIP)
    .map(p => `${p.label ? `${p.label} in ` : ''}Question ${p.question.number}`)
}

/** Questions to try again: those with marks lost on an answer ('lost') or left blank ('skipped'). */
export function questionsToRedo(snapshot, marks = {}, kind = 'lost') {
  return (snapshot?.questions || []).filter(q => q.parts.some(p => {
    const m = cleanMark(marks[p.key], p.marks)
    return kind === 'skipped' ? m === SKIP : Number.isInteger(m) && m < p.marks
  })).map(q => q.id)
}

/** Marked attempts only, oldest first. */
const markedOldestFirst = (attempts) => (attempts || []).filter(a => a.status === 'marked')
  .sort((a, b) => String(a.marked_at || a.updated_at || '').localeCompare(String(b.marked_at || b.updated_at || '')))

const pct = (a) => (a.available ? Math.round((a.scored / a.available) * 100) : 0)

/** Marks scored out of marks available by topic, across marked attempts; weakest first. */
export function byTopic(attempts) {
  const map = new Map()
  for (const a of markedOldestFirst(attempts)) {
    for (const q of a.snapshot?.questions || []) {
      const topic = q.topic || 'Other'
      const row = map.get(topic) || { topic, scored: 0, max: 0 }
      for (const p of q.parts) {
        const m = cleanMark(a.marks?.[p.key], p.marks)
        if (m === undefined) continue
        row.max += p.marks
        if (m !== SKIP) row.scored += m
      }
      map.set(topic, row)
    }
  }
  return [...map.values()].filter(r => r.max > 0)
    .map(r => ({ ...r, percent: Math.round((r.scored / r.max) * 100) }))
    .sort((a, b) => a.percent - b.percent || b.max - a.max)
}

/** The dashboard's figures, from all of a subject's attempts. */
export function summary(attempts) {
  const marked = markedOldestFirst(attempts)
  const waiting = (attempts || []).filter(a => a.status !== 'marked').length
  if (!marked.length) return { marked: 0, waiting, average: null, latest: null, change: null, skippedPercent: null, trend: [] }
  const average = Math.round(marked.reduce((s, a) => s + pct(a), 0) / marked.length)
  const latest = marked[marked.length - 1]
  const available = marked.reduce((s, a) => s + (a.available || 0), 0)
  const skipped = marked.reduce((s, a) => s + (a.skipped || 0), 0)
  return {
    marked: marked.length, waiting, average,
    latest: { id: latest.id, scored: latest.scored, available: latest.available, percent: pct(latest), at: latest.marked_at || latest.updated_at },
    change: marked.length > 1 ? pct(latest) - pct(marked[0]) : null,
    skippedPercent: available ? Math.round((skipped / available) * 100) : 0,
    trend: marked.slice(-8).map(a => ({
      id: a.id, at: a.marked_at || a.updated_at, percent: pct(a),
      skippedPercent: a.available ? Math.round(((a.skipped || 0) / a.available) * 100) : 0,
    })),
  }
}

/** The score of the marked attempt before this one, for "up 3 points on your last exam". */
export function previousPercent(attempts, attempt) {
  const marked = markedOldestFirst(attempts)
  const i = marked.findIndex(a => a.id === attempt?.id)
  return i > 0 ? pct(marked[i - 1]) : null
}

/** Questions the student has had in any exam attempt. */
export function seenQuestionIds(attempts) {
  const out = new Set()
  for (const a of attempts || []) for (const id of a.question_ids || []) out.add(id)
  return out
}
