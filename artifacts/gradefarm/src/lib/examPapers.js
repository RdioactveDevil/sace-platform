// Admin → Exam papers: reading exam paper details from file names, pairing
// solutions files with their papers, and saving a batch for the "Ingest exam
// paper" Action (exam_paper_batches, migration 20261109000005).

/** Trial-exam publishers recognised in file names, with how to write them. */
export const PUBLISHERS = [
  ['NEAP', /\bneap\b/i], ['Insight', /insight/i], ['Kilbaha', /kilbaha/i], ['MAV', /\bmav\b/i],
  ['TSSM', /\btssm\b/i], ['Itute', /itute/i], ['Checkpoints', /checkpoint/i], ['Heffernan', /heffernan/i],
  ['Jacaranda', /jacaranda/i], ['Cambridge', /cambridge/i], ['Edrolo', /edrolo/i], ['STAV', /\bstav\b/i],
  ['Engage', /\bengage\b/i], ['Lisachem', /lisachem/i], ['A+', /\ba\+|aplus/i],
]

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
    publisher: pub ? pub[0] : board === 'sace' ? 'SACE Board' : 'VCAA',
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
