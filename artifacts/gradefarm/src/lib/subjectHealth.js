// What a subject's Overview in Admin shows: questions by topic, and what
// needs fixing (components/AdminSubjectOverview.jsx).

/** Topics with fewer questions than this are "thin". */
export const THIN_TOPIC = 25

/** Each topic's question count, most first: [{ name, count, thin }]. Topics with none are included. */
export function topicCounts(topics, rows) {
  const counts = new Map((topics || []).map(t => [t.name, 0]))
  for (const q of rows || []) if (counts.has(q.topic)) counts.set(q.topic, counts.get(q.topic) + 1)
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, thin: count < THIN_TOPIC }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** Subtopics with no questions at all. */
export function emptySubtopics(topics, rows) {
  const ids = new Set((rows || []).map(q => q.subtopic_id).filter(Boolean))
  const names = new Set((rows || []).map(q => q.subtopic).filter(Boolean))
  return (topics || []).flatMap(t => (t.subtopics || []).filter(s => !ids.has(s.id) && !names.has(s.name)).map(s => ({ topic: t.name, name: s.name })))
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * The "Needs you" list, most urgent first: [{ key, tone, text, section, action }].
 * tone: 'red' (students are affected), 'amber' (worth fixing), 'grey' (optional).
 */
export function subjectNeeds({ topics, rows, openReports = 0, drafts = 0, papers = 0, features = {}, examContext = '' }) {
  const needs = []
  const counted = topicCounts(topics, rows)
  const thin = counted.filter(t => t.thin)
  const empty = emptySubtopics(topics, rows)
  const official = (rows || []).some(q => q.source_kind === 'official')
  if (openReports) needs.push({ key: 'reports', tone: 'red', text: `${plural(openReports, 'question')} reported as wrong`, section: 'reports', action: 'Open reports' })
  if (drafts) needs.push({ key: 'review', tone: 'amber', text: `${plural(drafts, 'new question')} waiting for review`, section: 'review', action: 'Review' })
  if (empty.length) needs.push({ key: 'empty', tone: 'amber', text: `${plural(empty.length, 'subtopic')} with no questions`, section: 'add', action: 'Add questions' })
  if (thin.length) needs.push({ key: 'thin', tone: 'amber', text: `${plural(thin.length, 'topic')} under ${THIN_TOPIC} questions`, section: 'add', action: 'Add questions' })
  if (!papers && !official) needs.push({ key: 'papers', tone: 'amber', text: 'No past exam papers loaded', section: 'papers', action: 'Load papers' })
  if (!String(examContext || '').trim()) needs.push({ key: 'exam', tone: 'grey', text: "No notes on the real exam for AI to follow", section: 'exam', action: 'Add notes' })
  if (!features?.written_answers) needs.push({ key: 'written', tone: 'grey', text: 'Written answers are off', section: 'features', action: 'Settings' })
  return needs
}
