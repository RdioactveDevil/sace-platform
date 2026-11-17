// Admin → Exam papers: reading exam paper details from file names, pairing
// solutions files with their papers, and saving a batch for the "Ingest exam
// paper" Action (exam_paper_batches, migration 20261109000005).

/** Trial-exam publishers recognised in file names, with how to write them. */
export const PUBLISHERS = [
  ['NEAP', /\bneap\b/i], ['Insight', /insight/i], ['Kilbaha', /kilbaha/i], ['MAV', /\bmav\b/i],
  ['TSSM', /\btssm\b/i], ['Itute', /itute/i], ['Checkpoints', /checkpoint/i], ['Heffernan', /heffernan/i],
  ['Jacaranda', /jacaranda/i], ['Cambridge', /cambridge/i], ['Edrolo', /edrolo/i], ['STAV', /\bstav\b/i],
  ['Engage', /\bengage\b/i], ['Lisachem', /lisachem/i], ['A+', /\ba\+|aplus/i],
  ['QATS', /\bqats\b/i], ['Lorikeet', /lorikeet/i], ['Access', /\baccess\b/i],
]

/** The northern-hemisphere (NHT) paper: a different exam from the main one that year, in the same format. */
const NHT = /\bnht\b|northern[-_ ]hemisphere/i

const SOLUTION_WORDS = /(solution|answers?|report|marking|guide|exemplar|worked|response)/i

/**
 * What a file name says about a paper: year, which paper, publisher, and
 * whether it is solutions. `board` ('vce' | 'sace') sets the official
 * publisher and the default paper name.
 */
export function parsePaperFilename(name, board = 'vce') {
  const base = String(name || '').replace(/\.pdf$/i, '')
  const year = Number((base.match(/(?:19|20)\d{2}/) || [])[0]) || null
  const solutions = SOLUTION_WORDS.test(base)
  const pub = PUBLISHERS.find(([, re]) => re.test(base))
  const withoutYear = base.replace(/(?:19|20)\d{2}/g, ' ')
  const num = (withoutYear.match(/(?:exam|paper)\s*[-_ ]?\s*([1-3])\b/i) || withoutYear.match(/[a-z]([12])(?=[-_ .]|$)/i) || [])[1]
  return {
    year,
    solutions,
    kind: pub ? 'commercial' : 'official',
    // An NHT paper gets its own publisher name so its label differs from the main exam's,
    // and keeps the same paper name so the exam builder can mix the two.
    publisher: pub ? pub[0] : `${board === 'sace' ? 'SACE Board' : 'VCAA'}${NHT.test(base) ? ' NHT' : ''}`,
    paper: num ? `Exam ${num}` : 'Exam',
  }
}

/** A name with its solutions words, years and punctuation taken out, for matching a solutions file to its paper. */
const stem = (name) => String(name || '').toLowerCase().replace(/\.pdf$/, '').replace(SOLUTION_WORDS, ' ').replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Turn dropped files into paper rows: each non-solutions file is a paper;
 * each solutions file is attached to the paper with the same year, paper and
 * publisher (closest name wins), else left over in `unpaired`.
 */
export function buildPaperRows(files, board = 'vce') {
  const items = files.map((file, i) => ({ i, file, info: parsePaperFilename(file.name, board) }))
  const papers = items.filter(x => !x.info.solutions).map(x => ({ key: x.i, file: x.file, ...x.info, solutionsKey: null }))
  const unpaired = []
  for (const s of items.filter(x => x.info.solutions)) {
    const same = papers.filter(p => !p.solutionsKey && p.year === s.info.year && p.paper === s.info.paper && p.publisher === s.info.publisher)
    const ss = stem(s.file.name)
    const score = (p) => { const ps = stem(p.file.name); let n = 0; while (n < ps.length && ps[n] === ss[n]) n++; return n }
    const best = same.sort((a, b) => score(b) - score(a))[0]
    if (best) best.solutionsKey = s.i
    else unpaired.push({ key: s.i, file: s.file, ...s.info })
  }
  return { papers, unpaired }
}

/** A storage-safe file name. */
export const safeName = (name) => String(name || 'paper.pdf').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-80)

/** "VCAA 2023 Exam 2" or "NEAP 2024 Trial Exam 2", as the ingest script labels questions. */
export function sourceLabelFor({ kind, publisher, year, paper }) {
  return [publisher, year, kind === 'commercial' ? 'Trial' : '', paper].filter(Boolean).join(' ')
}

/**
 * Labels that more than one paper row would be saved under. Questions are
 * stored by label and question number, so a second paper with the same label
 * overwrites the first one's questions.
 */
export function duplicateLabels(rows) {
  const seen = new Map()
  for (const r of rows || []) {
    const label = sourceLabelFor(r)
    seen.set(label, (seen.get(label) || 0) + 1)
  }
  return [...seen].filter(([, n]) => n > 1).map(([label]) => label)
}

/** Natural order for question numbers ("2" before "10", "3a" after "3"). */
const byQuestionNumber = (a, b) => {
  const na = parseInt(a.source_question, 10)
  const nb = parseInt(b.source_question, 10)
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  return String(a.source_question || '').localeCompare(String(b.source_question || ''), undefined, { numeric: true })
}

/**
 * A subject's loaded exam-paper questions grouped into papers, newest first:
 * [{ key, label, kind, publisher, year, paper, a: [Section A], b: [Section B], marks, loadedAt }].
 * A question belongs to a paper by its `source` label (scripts/src/ingest-past-paper.ts).
 */
export function groupLoadedPapers(rows) {
  const papers = new Map()
  for (const q of rows || []) {
    const label = q.source || sourceLabelFor({ kind: q.source_kind, publisher: q.source_publisher, year: q.source_year, paper: q.source_paper }) || 'Unnamed paper'
    if (!papers.has(label)) {
      papers.set(label, {
        key: label, label, kind: q.source_kind === 'commercial' ? 'trial' : 'past',
        publisher: q.source_publisher || '', year: q.source_year || null, paper: q.source_paper || '',
        a: [], b: [], marks: 0, loadedAt: null,
      })
    }
    const p = papers.get(label)
    if (q.exam_section === 'B' || q.question_type === 'extended') p.b.push(q)
    else p.a.push(q)
    p.marks += q.question_type === 'extended' ? Number(q.total_marks) || 0 : 1
    if (q.created_at && (!p.loadedAt || q.created_at > p.loadedAt)) p.loadedAt = q.created_at
  }
  const out = [...papers.values()]
  for (const p of out) { p.a.sort(byQuestionNumber); p.b.sort(byQuestionNumber) }
  return out.sort((x, y) => (Number(y.year) || 0) - (Number(x.year) || 0) || x.label.localeCompare(y.label))
}
