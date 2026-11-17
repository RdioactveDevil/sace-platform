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

const LEAD = /^[^\n]*?\binformation\b[^\n]*?\banswer\s+questions?\s+(\d+(?:\s*(?:,|and|&|to|-|–|—)\s*\d+)+)\s*\.?/im

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
export function planSetLinks(rows) {
  const byPaper = new Map()
  for (const r of rows || []) {
    const k = `${r.curriculum_id}|${r.source}|${r.exam_section}`
    if (!byPaper.has(k)) byPaper.set(k, new Map())
    byPaper.get(k).set(num(r), r)
  }
  // Each set once, with the questions that carry its sentence, in paper order.
  const sets = new Map()
  for (const r of rows || []) {
    const lead = parseSetLead(r.question)
    if (!lead) continue
    const pk = `${r.curriculum_id}|${r.source}|${r.exam_section}`
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
