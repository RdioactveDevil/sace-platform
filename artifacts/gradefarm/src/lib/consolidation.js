// "Consolidate — practice this topic" from Titan AI: a short round of quiz
// questions on one subtopic (or topic), after which the student goes back to
// the quiz they were in.

// The round ends at this many right answers in a row…
export const CONSOLIDATION_STREAK = 3
// …or after this many questions, whichever comes first.
export const CONSOLIDATION_MAX_QUESTIONS = 8

const norm = (s) => String(s ?? '').trim().toLowerCase()

/**
 * What to practise for a Titan topic: { label, subtopics } naming bank
 * subtopics, or null if the bank has nothing for it. The topic is a subtopic
 * when Titan was opened from a quiz question, but may be a whole topic or
 * whatever the student typed when they started a lesson themselves.
 */
export function resolveConsolidation(questions, target) {
  const want = norm(target)
  if (!want) return null
  const subtopics = new Map()   // normalised → spelling in the bank
  const byTopic = new Map()     // normalised topic → Set of its subtopics
  for (const q of questions || []) {
    if (!q?.subtopic) continue
    subtopics.set(norm(q.subtopic), q.subtopic)
    if (q.topic) {
      const key = norm(q.topic)
      if (!byTopic.has(key)) byTopic.set(key, { name: q.topic, subtopics: new Set() })
      byTopic.get(key).subtopics.add(q.subtopic)
    }
  }
  if (subtopics.has(want)) return { label: subtopics.get(want), subtopics: [subtopics.get(want)] }
  const topic = byTopic.get(want)
  if (topic) return { label: topic.name, subtopics: [...topic.subtopics] }
  return null
}

/**
 * Where the round stands, from this session's results (a consolidation round
 * is a session of its own). Only quiz questions count, not remediation.
 */
export function consolidationRound(sessionResults) {
  const main = (sessionResults || []).filter(r => !r.remediation)
  let inARow = 0
  for (let i = main.length - 1; i >= 0 && main[i].correct; i--) inARow++
  const answered = main.length
  return {
    answered,
    inARow,
    done: inARow >= CONSOLIDATION_STREAK || answered >= CONSOLIDATION_MAX_QUESTIONS,
    byStreak: inARow >= CONSOLIDATION_STREAK,
  }
}
