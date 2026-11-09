// The exam builder: a full practice exam assembled from real past exams
// (official, e.g. VCAA) and commercial trial exams in the bank, mixed and
// matched, and laid out like the real paper (ExamPaper.jsx). Pure functions so
// the choices can be tested and rebuilt from the same settings and seed.
//
// Questions from exam papers carry (migration 20261109000003_question_source.sql):
//   source            "VCAA 2023 Exam 2" (shown on the paper and in the solutions)
//   source_kind       'official' | 'commercial'
//   source_publisher  "VCAA", "NEAP", ...
//   source_year       2023
//   source_paper      "Exam 1" / "Exam 2" (which paper: never mixed in one exam)
//   source_question   "5" or "3b" as printed
//   exam_section      'A' (multiple choice) | 'B' (short and extended answer)
//   parts             [{ label: 'a', text, marks, solution, image_url, level: 1|2|3 }]
//                     for multi-part questions (question_type 'extended')

import { getQuestionType, totalMarks } from './questionTypes.js'

/** A small seeded random number generator (mulberry32), so an exam can be rebuilt. */
export function seededRandom(seed) {
  let a = (Number(seed) >>> 0) || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle(list, rand) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export const BANK_SOURCE = 'GradeFarm question bank'

/** Which section a question belongs in: A = multiple choice, B = written. */
export function sectionOf(q) {
  if (q?.exam_section === 'A' || q?.exam_section === 'B') return q.exam_section
  const type = q?.question_type === 'extended' ? 'extended' : getQuestionType(q)
  if (type === 'mcq') return 'A'
  if (type === 'extended' || type === 'marked' || type === 'numeric' || type === 'short_text') return 'B'
  return null
}

/** A written question's parts; a question without parts is one unlabelled part. */
export function partsOf(q) {
  if (Array.isArray(q?.parts) && q.parts.length) {
    return q.parts.filter(p => p && (p.text || p.image_url)).map(p => ({
      label: String(p.label || '').replace(/^\(|\)?\.?$/g, ''),
      text: p.text || '',
      marks: Math.max(0, Number(p.marks) || 0),
      solution: p.solution || '',
      image_url: p.image_url || null,
      level: [2, 3].includes(Number(p.level)) ? Number(p.level) : 1,
    }))
  }
  const type = getQuestionType(q)
  const marks = type === 'marked' ? (totalMarks(q) || 1) : Math.max(1, Number(q?.total_marks) || 1)
  return [{ label: '', text: '', marks, solution: q?.solution || '', image_url: null, level: 1 }]
}

/** Marks a question is worth. */
export function marksOf(q) {
  if (sectionOf(q) === 'A') return 1
  const fromParts = partsOf(q).reduce((s, p) => s + p.marks, 0)
  return fromParts || Math.max(1, Number(q?.total_marks) || 1)
}

/** Where a question comes from, as a filter key. */
export function sourceKey(q) {
  return q?.source ? q.source : BANK_SOURCE
}

/** "VCAA 2023 Exam 2, Q5" for exam questions, "GradeFarm question bank" otherwise. */
export function sourceLabel(q) {
  if (!q?.source) return BANK_SOURCE
  return q.source_question ? `${q.source}, Q${String(q.source_question).replace(/^q/i, '')}` : q.source
}

/** Usable on paper: in a section, not a reading-passage question, with a stem. */
export function isExamReady(q) {
  return !!q?.question && !q.passage_id && !!sectionOf(q)
}

/**
 * The papers, sources and topics available in a bank, for the builder's
 * filters. Papers: "Exam 1", "Exam 2" … (questions without one are "Any").
 * Sources are grouped official / commercial / bank, newest first.
 */
export function bankSummary(questions) {
  const ready = (questions || []).filter(isExamReady)
  const papers = new Map()
  const sources = new Map()
  const topics = new Map()
  for (const q of ready) {
    const paper = q.source_paper || ''
    papers.set(paper, (papers.get(paper) || 0) + 1)
    const key = sourceKey(q)
    if (!sources.has(key)) {
      sources.set(key, {
        key, kind: q.source ? (q.source_kind === 'commercial' ? 'commercial' : 'official') : 'bank',
        publisher: q.source_publisher || '', year: Number(q.source_year) || 0, paper, count: 0,
      })
    }
    sources.get(key).count++
    if (q.topic) topics.set(q.topic, (topics.get(q.topic) || 0) + 1)
  }
  const kindOrder = { official: 0, commercial: 1, bank: 2 }
  return {
    papers: [...papers].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)),
    sources: [...sources.values()].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || b.year - a.year || a.key.localeCompare(b.key)),
    topics: [...topics].map(([name, count]) => ({ name, count })),
  }
}

/**
 * Questions that fit the builder's settings, per section. `paper` keeps one
 * exam's questions apart from another's (e.g. tech-free Exam 1 and Exam 2);
 * bank questions without a paper fit any.
 */
export function examPool(questions, { paper = '', sources = [], topics = [] } = {}) {
  const out = { A: [], B: [] }
  const seen = new Set()
  for (const q of questions || []) {
    if (!isExamReady(q)) continue
    if (paper && q.source_paper && q.source_paper !== paper) continue
    if (sources.length && !sources.includes(sourceKey(q))) continue
    if (topics.length && !topics.includes(q.topic)) continue
    const key = `${(q.question || '').trim().toLowerCase()}|${JSON.stringify(q.options || '')}`
    if (seen.has(key)) continue
    seen.add(key)
    out[sectionOf(q)].push(q)
  }
  return out
}

/** Real exam questions before bank questions, then spread across topics. */
function spread(list, rand) {
  const byTopic = new Map()
  const ordered = [...shuffle(list.filter(q => q.source), rand), ...shuffle(list.filter(q => !q.source), rand)]
  for (const q of ordered) {
    const k = q.topic || ''
    if (!byTopic.has(k)) byTopic.set(k, [])
    byTopic.get(k).push(q)
  }
  const lists = shuffle([...byTopic.values()], rand)
  const out = []
  for (let round = 0; ; round++) {
    let took = false
    for (const l of lists) if (l[round]) { out.push(l[round]); took = true }
    if (!took) break
  }
  return out
}

/** Course order of topics, as they first appear in the bank. */
function topicOrder(questions) {
  const order = new Map()
  for (const q of questions || []) if (q.topic && !order.has(q.topic)) order.set(q.topic, order.size)
  return order
}

/**
 * Pick an exam: `mcCount` multiple-choice questions for Section A and Section B
 * questions adding up to about `bMarks` (never over by more than the last
 * question). Spread across topics, real exam questions first, then put in
 * course order. Returns { A: [ids], B: [ids] }.
 */
export function pickExam(pool, { mcCount = 20, bMarks = 60, seed = 1, allQuestions = [] } = {}) {
  const rand = seededRandom(seed)
  const order = topicOrder(allQuestions.length ? allQuestions : [...pool.A, ...pool.B])
  const byCourse = (a, b) => (order.get(a.topic) ?? 999) - (order.get(b.topic) ?? 999) || (Number(a.difficulty) || 3) - (Number(b.difficulty) || 3)

  const A = spread(pool.A, rand).slice(0, mcCount).sort(byCourse)

  const B = []
  let marks = 0
  if (bMarks > 0) {
    const candidates = spread(pool.B, rand)
    // Fill with the questions that fit, then top up with the closest one.
    for (const q of candidates) {
      const m = marksOf(q)
      if (marks + m <= bMarks) { B.push(q); marks += m }
      if (marks >= bMarks) break
    }
    if (marks < bMarks) {
      const rest = candidates.filter(q => !B.includes(q))
      const best = rest.sort((x, y) => Math.abs(bMarks - marks - marksOf(x)) - Math.abs(bMarks - marks - marksOf(y)))[0]
      if (best && marksOf(best) - (bMarks - marks) < marksOf(best) / 2) { B.push(best); marks += marksOf(best) }
    }
  }
  B.sort(byCourse)
  return { A: A.map(q => q.id), B: B.map(q => q.id) }
}

/** Another question for the same slot: same section, not already in the exam, preferably the same topic. */
export function swapCandidate(pool, current, usedIds, seed = 1) {
  const section = sectionOf(current)
  const options = (pool[section] || []).filter(q => !usedIds.includes(q.id))
  if (!options.length) return null
  const rand = seededRandom(seed)
  const sameTopic = options.filter(q => q.topic === current.topic)
  const close = (list) => section === 'B'
    ? [...list].sort((a, b) => Math.abs(marksOf(a) - marksOf(current)) - Math.abs(marksOf(b) - marksOf(current)))
    : list
  const pickFrom = sameTopic.length ? sameTopic : options
  const ranked = close(shuffle(pickFrom, rand))
  return ranked[0]
}

/** Totals for the cover's structure table. */
export function examTotals(exam) {
  const aMarks = exam.A.length
  const bMarks = exam.B.reduce((s, q) => s + marksOf(q), 0)
  return { aCount: exam.A.length, aMarks, bCount: exam.B.length, bMarks, total: aMarks + bMarks }
}

/** Writing time in minutes, VCE-style: 1.5 minutes a mark, rounded to 15. */
export function writingMinutes(totalMarks) {
  if (!totalMarks) return 0
  return Math.max(15, Math.round((totalMarks * 1.5) / 15) * 15)
}

export function formatMinutes(min) {
  if (min < 60) return `${min} minutes`
  const h = Math.floor(min / 60), m = min % 60
  return `${h} hour${h === 1 ? '' : 's'}${m ? ` ${m} minutes` : ''}`
}

/** Short code for page headers, like the real papers ("MATHMETH EXAM 2"). */
export function subjectCode(name = '') {
  const n = String(name).replace(/^(VCE|SACE)\s+/i, '').replace(/\s*(Units?\s*\d.*|Stage\s*\d.*)$/i, '').trim()
  const known = [
    [/mathematical methods|maths? methods/i, 'MATHMETH'], [/specialist/i, 'SPECMATH'], [/general math/i, 'GENMATH'],
    [/foundation math/i, 'FOUNMATH'], [/chemistry/i, 'CHEM'], [/biology/i, 'BIOL'], [/physics/i, 'PHYS'],
    [/psychology/i, 'PSYCH'], [/english language/i, 'ENGLANG'], [/literature/i, 'LIT'], [/english/i, 'ENG'],
  ]
  for (const [re, code] of known) if (re.test(n)) return code
  return n.split(/\s+/)[0].toUpperCase().slice(0, 8) || 'EXAM'
}

/** Is the subject maths (for the Section B instructions)? */
export const isMathsSubject = (name = '') => /math/i.test(name)

/**
 * Pack measured blocks into pages. Blocks: { h, keepWithNext, section }.
 * A block that is taller than a page gets a page to itself. A block marked
 * keepWithNext moves to the next page with the block after it. A new section
 * can start a new page (`breakBefore`). Returns arrays of block indexes.
 */
export function paginate(blocks, capacity) {
  const pages = []
  let page = [], used = 0
  const flush = () => { if (page.length) pages.push(page); page = []; used = 0 }
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.breakBefore) flush()
    let need = b.h
    // Keep a heading with what follows it.
    if (b.keepWithNext && blocks[i + 1]) need += blocks[i + 1].h
    if (page.length && used + Math.min(need, capacity) > capacity) flush()
    page.push(i)
    used += b.h
  }
  flush()
  return pages
}

/** Ruled lines of answer space for a part worth `marks` (fewer for 1 mark). */
export function linesForMarks(marks) {
  const m = Math.max(1, Number(marks) || 1)
  return Math.min(16, m === 1 ? 3 : m * 3)
}
