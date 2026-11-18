// The exam builder's free preview (ExamBuilderScreen `preview`): the first few
// questions in print order keep their text; every other question goes to the
// page as filler of the same shape (scrambled letters, no maths, no figures),
// drawn blurred. So the pages look like the exam, but past the first page
// there is no real question in them to un-blur.
import { marksOf } from './examBuilder.js'

// About one page of questions: a multiple-choice question counts as 1.6, a
// written one as its marks.
const PAGE_BUDGET = 8

function rng(seedText) {
  let h = 2166136261
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619)
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
}

/** Text of the same shape with none of the words: letters and digits scrambled, maths and LaTeX turned into plain letters. */
export function scramble(text, seed = '') {
  if (typeof text !== 'string' || !text) return text
  const r = rng(seed + text.length)
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const letter = () => lower[Math.floor(r() * 26)]
  return text
    .replace(/\$\$?[^$]*\$\$?/g, m => 'x'.repeat(Math.max(1, Math.min(12, Math.round(m.length / 2)))))
    .replace(/\\[a-zA-Z]+|[{}^_\\$]/g, '')
    .replace(/[A-Za-z0-9]/g, ch => (/[A-Z]/.test(ch) ? letter().toUpperCase() : /[0-9]/.test(ch) ? String(Math.floor(r() * 10)) : letter()))
}

function scrambleQuestion(q) {
  const s = (t, k) => scramble(t, `${q.id}:${k}`)
  return {
    ...q,
    question: s(q.question, 'q'),
    options: Array.isArray(q.options) ? q.options.map((o, i) => s(o, `o${i}`)) : q.options,
    parts: Array.isArray(q.parts) ? q.parts.map((p, i) => ({ ...p, text: s(p.text, `p${i}`), image_url: null })) : q.parts,
    shared_info: s(q.shared_info, 'si'),
    image_url: null, shared_image_url: null, graph: null, diagram: null, table_data: null,
  }
}

/**
 * exam { A, B } (question objects) → { exam, redact }: the exam to print, with
 * every question after the first page's worth scrambled, and the ids and set
 * keys of the scrambled ones (ExamPaper blurs their blocks).
 */
export function previewExam(exam) {
  const order = [...exam.A, ...exam.B]
  const keep = new Set()
  let used = 0
  for (const q of order) {
    if (used >= PAGE_BUDGET) break
    keep.add(q.id)
    used += q.exam_section === 'A' || exam.A.includes(q) ? 1.6 : marksOf(q)
  }
  // A set prints together: keep all of it or none.
  const keptSets = new Set(order.filter(q => keep.has(q.id) && q.set_key).map(q => q.set_key))
  for (const q of order) if (q.set_key && keptSets.has(q.set_key)) keep.add(q.id)
  const redact = new Set()
  const swap = (q) => {
    if (keep.has(q.id)) return q
    redact.add(q.id)
    if (q.set_key) redact.add(`set:${q.set_key}`)
    return scrambleQuestion(q)
  }
  return { exam: { A: exam.A.map(swap), B: exam.B.map(swap) }, redact }
}

/** Whether a printed block (ExamPaper's block keys) belongs to a scrambled question. */
export function isRedactedBlock(key, redact) {
  if (!redact || !redact.size || typeof key !== 'string') return false
  const rest = key.slice(2) // after "A-", "B-" or "S-"
  if (rest.startsWith('set-')) return redact.has(`set:${rest.slice(4)}`)
  if (redact.has(rest)) return true
  for (const id of redact) if (rest.startsWith(`${id}-`)) return true
  return false
}
