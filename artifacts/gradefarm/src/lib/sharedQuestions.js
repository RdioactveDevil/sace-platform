// Questions a subject borrows from another subject's subtopics
// (supabase/migrations/20261102000000_subtopic_links.sql).
//
// The app groups questions by their topic and subtopic names, so a borrowed
// question is filed under the borrowing subtopic: same id (so a student's
// history for it is the same in both subjects), with this subject's topic,
// subtopic and subject names. `shared_from` keeps the subject it lives in.

/**
 * @param {object[]} rows      questions from the source subtopics
 * @param {{ subtopic_id: string, source_subtopic_id: string }[]} links
 * @param {{ id: string, name: string, topic: string }[]} targets  this subject's subtopics, in order
 * @param {{ subject: string, ownIds?: Iterable<string> }} opts
 */
export function fileBorrowedQuestions(rows, links, targets, { subject, ownIds = [] }) {
  const own = new Set(ownIds)
  const order = new Map(targets.map((t, i) => [t.id, i]))
  const byId = new Map(targets.map(t => [t.id, t]))
  // A source used by more than one subtopic here is filed under the first.
  const home = new Map()
  for (const l of [...links].sort((a, b) => (order.get(a.subtopic_id) ?? 1e9) - (order.get(b.subtopic_id) ?? 1e9))) {
    if (byId.has(l.subtopic_id) && !home.has(l.source_subtopic_id)) home.set(l.source_subtopic_id, byId.get(l.subtopic_id))
  }
  const out = []
  const seen = new Set()
  for (const q of rows || []) {
    const t = home.get(q.subtopic_id)
    if (!t || own.has(q.id) || seen.has(q.id)) continue
    seen.add(q.id)
    out.push({ ...q, topic: t.topic, subtopic: t.name, subject, shared_from: q.subject })
  }
  return out
}
