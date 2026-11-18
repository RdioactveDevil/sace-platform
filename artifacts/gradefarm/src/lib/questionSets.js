// Question sets: exam questions that share one block of information ("Use the
// following information to answer Questions 29 and 30."). Stored on the
// questions (migration 20261118000002_question_sets):
//   set_key           the same for every question of a set (the first one's id)
//   set_position      1, 2, 3… in paper order
//   shared_info       on the first question only: the shared information,
//                     without the "Use the following information…" sentence
//   shared_image_url  on the first question only: the shared figure
// questions_student gives every member the set's shared fields; admin screens
// fill them from the first question (fillShared).

const LEAD = /^[^\n]*?\binformation\b[^\n]*?\b(?:answers?|for)\s+questions?\s+(\d+(?:\s*(?:,|and|&|to|-|–|—)\s*\d+)+)\s*\.?/im

/** The question numbers a lead question shares its information with, and its lead sentence; null if it isn't a lead. */
export function parseSetLead(text) {
  const m = String(text || '').match(LEAD)
  if (!m) return null
  const spec = m[1]
  const nums = (spec.match(/\d+/g) || []).map(Number)
  let numbers
  if (/\bto\b|[-–—]/.test(spec) && nums.length === 2) {
    numbers = []
    for (let n = nums[0]; n <= nums[1] && numbers.length < 10; n++) numbers.push(n)
  } else numbers = nums
  if (numbers.length < 2) return null
  return { numbers, sentence: m[0].trim() }
}

/**
 * A lead question's text split into the shared information and its own
 * question: the lead sentence goes (it is printed with the exam's numbers);
 * the last paragraph (or, in a single paragraph, the last line) is the
 * question; the rest is shared.
 */
export function splitLead(text) {
  const lead = parseSetLead(text)
  let body = String(text || '')
  if (lead) body = body.replace(lead.sentence, '')
  body = body.replace(/^\s*\n/, '').trim()
  const paras = body.split(/\n\s*\n/)
  if (paras.length > 1) return { shared: paras.slice(0, -1).join('\n\n').trim(), own: paras[paras.length - 1].trim() }
  const lines = body.split('\n')
  return { shared: lines.slice(0, -1).join('\n').trim(), own: (lines[lines.length - 1] || '').trim() }
}

/** "Use the following information to answer Questions 7 and 8." with the numbers given. */
export function setSentence(numbers) {
  const ns = (numbers || []).map(String)
  const start = 'Use the following information to answer'
  if (ns.length <= 1) return `${start} Question ${ns[0] ?? ''}.`
  const run = ns.every((n, i) => i === 0 || Number(n) === Number(ns[i - 1]) + 1)
  if (ns.length === 2) return `${start} Questions ${ns[0]} and ${ns[1]}.`
  if (run) return `${start} Questions ${ns[0]} to ${ns[ns.length - 1]}.`
  return `${start} Questions ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}.`
}

/** The questions with each set's shared information and figure, taken from its first question, on every member. */
export function fillShared(questions) {
  const first = new Map()
  for (const q of questions || []) {
    if (!q?.set_key) continue
    const f = first.get(q.set_key)
    if (!f || (Number(q.set_position) || 0) < (Number(f.set_position) || 0)) first.set(q.set_key, q)
  }
  return (questions || []).map(q => {
    const f = q?.set_key && first.get(q.set_key)
    if (!f || f === q || (!f.shared_info && !f.shared_image_url)) return q
    return { ...q, shared_info: f.shared_info ?? null, shared_image_url: f.shared_image_url ?? null }
  })
}

/** The questions as units: each set (its members here, in position order) where its first member falls; other questions alone. */
export function setUnits(questions) {
  const units = []
  const sets = new Map()
  for (const q of questions || []) {
    if (!q?.set_key) { units.push([q]); continue }
    if (!sets.has(q.set_key)) { const u = []; sets.set(q.set_key, u); units.push(u) }
    sets.get(q.set_key).push(q)
  }
  for (const u of sets.values()) u.sort((a, b) => (Number(a.set_position) || 0) - (Number(b.set_position) || 0))
  // A set lands where its earliest-listed member was.
  return units
}

const num = (q) => Number(String(q.source_question || '').replace(/\D+/g, ''))

/**
 * Linking the sets already in the bank, from the lead sentences in their
 * text: a set is the questions numbered as a sentence says, in the same paper
 * and section, found from whichever of them carry the sentence (older loads
 * copied it, with the shared text, into follow-on questions too). The shared
 * information is taken from the first question that carries it (the set's
 * first question if it does) and stored once, on the set's first question,
 * with that question's figure as the shared figure. Every question that
 * carried the sentence keeps only its own question. Returns the updates and
 * the sets that couldn't be linked.
 */
// The paper a question came from: its load (ep_<load>_A3), so two loads of a
// paper with the same label are never mixed; else its label.
const paperOf = (r) => `${r.curriculum_id}|${/^ep_[0-9a-f]+_/.exec(r.id || '')?.[0] || r.source}|${r.exam_section}`

export function planSetLinks(rows) {
  const byPaper = new Map()
  for (const r of rows || []) {
    const k = paperOf(r)
    if (!byPaper.has(k)) byPaper.set(k, new Map())
    byPaper.get(k).set(num(r), r)
  }
  // Each set once, with the questions that carry its sentence, in paper order.
  const sets = new Map()
  for (const r of rows || []) {
    const lead = parseSetLead(r.question)
    if (!lead) continue
    const pk = paperOf(r)
    const key = `${pk}|${lead.numbers.join(',')}`
    if (!sets.has(key)) sets.set(key, { pk, numbers: lead.numbers, holders: [] })
    sets.get(key).holders.push(r)
  }
  const updates = []
  const problems = []
  for (const s of sets.values()) {
    const paper = byPaper.get(s.pk)
    s.holders.sort((a, b) => num(a) - num(b))
    const label = `${s.holders[0].source} ${s.holders[0].exam_section}${s.numbers[0]}`
    const missing = s.numbers.filter(n => !paper.has(n))
    if (missing.length) { problems.push(`${label}: Question ${missing.join(', ')} isn't in the bank, so the set wasn't linked.`); continue }
    const members = s.numbers.map(n => paper.get(n))
    const taken = members.filter(m => m.set_key)
    if (taken.length) { problems.push(`${label}: Question ${taken.map(num).join(', ')} is already in a set.`); continue }
    const first = members[0]
    const from = s.holders.includes(first) ? first : s.holders[0]
    const shared = splitLead(from.question).shared
    const sharedFig = from.image_url || null
    members.forEach((m, i) => {
      const u = { id: m.id, set_key: first.id, set_position: i + 1 }
      const holder = s.holders.includes(m)
      if (holder) u.question = splitLead(m.question).own
      // The shared figure is kept once, on the first; a copy of it on another question goes.
      if (sharedFig && m.image_url === sharedFig) u.image_url = null
      if (i === 0) {
        u.shared_info = shared
        u.shared_image_url = sharedFig
        u.flag = {
          code: 'set_linked', where: '',
          message: shared
            ? `Linked automatically with Question${s.numbers.length > 2 ? 's' : ''} ${s.numbers.slice(1).join(', ')} as a set: check the shared information and each question's own text are split correctly.`
            : sharedFig
              ? `Linked automatically with Question${s.numbers.length > 2 ? 's' : ''} ${s.numbers.slice(1).join(', ')} as a set that shares only a figure: check the figure belongs to all of them.`
              : 'Linked automatically as a set, but no shared information was found: check its text.',
        }
      } else if (holder) {
        u.flag = { code: 'set_copy_removed', where: '', message: `This question carried a copy of the set's shared information, which is now kept once with Question ${s.numbers[0]}: check its own text.` }
      }
      updates.push(u)
    })
  }
  return { updates, problems }
}

// Whether text points at a figure ("shown below", "the graph above").
const FIGURE_REF = /\b(below|above|shown|diagram|graph|spectrum|figure|flow ?chart)\b/i
const MIN_SHARED = 40

// The whole lines two texts start with, leaving each at least one line of its own.
function sharedLines(a, b) {
  const x = String(a || '').split('\n')
  const y = String(b || '').split('\n')
  let k = 0
  while (k < x.length - 1 && k < y.length - 1 && x[k] === y[k]) k++
  // Don't end on a blank line.
  while (k > 0 && !x[k - 1].trim()) k--
  return k
}
const firstLines = (text, k) => String(text || '').split('\n').slice(0, k).join('\n').trim()
const afterLines = (text, k) => String(text || '').split('\n').slice(k).join('\n').trim()

/**
 * Sets that older loads saved with no lead sentence, each question carrying a
 * copy of the shared information: neighbouring questions of the same load
 * and section that start with the same lines (40 characters or more). The
 * shared lines are kept once, on the first question; each keeps the rest.
 * Figures: one figure on every question becomes the shared figure; when the
 * shared lines point at a figure ("shown below") or a follow-on carries a
 * copy of the first question's figure (the same image, or one
 * opts.sameFigure(urlA, urlB) says matches), the first question's figure is
 * shared and the copies go; a different figure stays with its question. Every set is flagged for
 * review, and `report` says what was decided and what is unsure.
 */
export function planCopiedSets(rows, opts = {}) {
  const papers = new Map()
  for (const r of rows || []) {
    const k = paperOf(r)
    if (!papers.has(k)) papers.set(k, [])
    papers.get(k).push(r)
  }
  const updates = []
  const report = []
  for (const list of papers.values()) {
    list.sort((a, b) => num(a) - num(b))
    for (let i = 0; i + 1 < list.length; i++) {
      if (num(list[i + 1]) !== num(list[i]) + 1) continue
      let k = sharedLines(list[i].question, list[i + 1].question)
      if (firstLines(list[i].question, k).length < MIN_SHARED) continue
      let j = i + 2
      while (j < list.length && num(list[j]) === num(list[j - 1]) + 1) {
        const kj = Math.min(k, sharedLines(list[i].question, list[j].question))
        if (firstLines(list[i].question, kj).length < MIN_SHARED) break
        k = kj
        j++
      }
      const members = list.slice(i, j)
      i = j - 1
      if (members.some(m => m.set_key)) continue
      let shared = firstLines(members[0].question, k)
      // A lead sentence the first pass couldn't read ("…to be used for Questions 9 and 10") goes, as there.
      const lead = parseSetLead(shared)
      if (lead) shared = shared.replace(lead.sentence, '').replace(/^\s*\n/, '').trim()
      const owns = members.map(m => afterLines(m.question, k))
      const unsure = []
      if (/\bthis question\b/i.test(shared)) unsure.push('the shared lines say "this question"')
      if (members.some(m => m.exam_section !== 'A')) unsure.push('written-answer questions')
      if (owns.some(o => !o)) { unsure.push('a question has no text of its own'); }

      // Figures. A follow-on's figure that is the first one's (the same image,
      // or one opts.sameFigure says matches) is a copy.
      const imgs = members.map(m => m.image_url || null)
      const same = (a, b) => !!a && !!b && (a === b || !!opts.sameFigure?.(a, b))
      const copies = imgs.map((u, n) => n > 0 && same(imgs[0], u))
      let sharedFig = null
      const keep = imgs.slice()
      const notes = []
      const byWording = FIGURE_REF.test(shared) && !FIGURE_REF.test(owns[0])
      if (imgs[0] && (copies.some(Boolean) || byWording)) {
        sharedFig = imgs[0]
        keep[0] = null
        notes.push(`Question ${num(members[0])}'s figure becomes the shared figure${copies.some(Boolean) ? '' : ' (from the wording)'}`)
        for (let n = 1; n < members.length; n++) {
          if (!imgs[n]) continue
          if (copies[n]) { keep[n] = null; notes.push(`Question ${num(members[n])}'s copy of it is removed`) } else notes.push(`Question ${num(members[n])} keeps its own, different figure`)
        }
      } else if (imgs[0] && FIGURE_REF.test(shared)) {
        unsure.push(`Question ${num(members[0])}'s figure could be shared or its own; left on the question`)
      } else if (imgs.some(Boolean)) {
        notes.push('figures stay on their questions')
        if (FIGURE_REF.test(shared)) unsure.push('the shared lines point at a figure, but the first question has none')
      }

      const numbers = members.map(num)
      members.forEach((m, n) => {
        const u = { id: m.id, set_key: members[0].id, set_position: n + 1, question: owns[n] }
        if (keep[n] !== imgs[n]) u.image_url = keep[n]
        if (n === 0) {
          u.shared_info = shared
          u.shared_image_url = sharedFig
        }
        u.flag = n === 0
          ? { code: 'set_linked', where: '', message: `Linked automatically with Question${numbers.length > 2 ? 's' : ''} ${numbers.slice(1).join(', ')} as a set, because they started with the same text: check they really share it, and check the figures.` }
          : { code: 'set_copy_removed', where: '', message: `This question started with the same text as Question ${numbers[0]}, which is now kept once with Question ${numbers[0]} as the set's shared information: check its own text.` }
        updates.push(u)
      })
      report.push({ label: `${members[0].source} ${members[0].exam_section}${numbers.join('–')}`, ids: members.map(m => m.id), live: members.filter(m => m.review_status === 'approved').length, shared, owns, notes, unsure })
    }
  }
  return { updates, report }
}
