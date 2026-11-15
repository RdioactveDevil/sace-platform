// When the quiz asks the server for more written-answer questions
// (POST /api/marked/top-up, via fetchMoreWrittenAnswers in lib/db.js).
//
// Written answers are slow and costly to write, so the quiz only refills a
// subtopic the student is actually working on:
//  - the subtopic of the written answer they just did, once it's down to its
//    last one, so the next is ready by the time they finish it;
//  - the subtopic of any other question they just answered, once its written
//    answers are all used up;
//  - a subtopic they picked for this session that has none left; and
//  - practising the whole subject with no written answers left anywhere, the
//    subtopic they last did written answers in (so it works from the start).
// A subtopic with no written answers at all is never started. The server
// checks all of this again and keeps each student to a daily allowance.

import { isAiMarked } from './questionTypes.js'

/** Written answers left in a subtopic at which the quiz asks for more, after one is answered there. */
export const WRITTEN_TOPUP_LOW_WATER = 1

/**
 * The subtopic to ask for more written answers in, or null.
 * @param {object} p
 * @param {object[]} p.questions the subject's questions in this session's format
 * @param {(q: object) => boolean} p.isAvailable whether a question can still come up this session
 * @param {string[]} [p.picked] subtopics the student chose (empty: the whole subject)
 * @param {object|null} [p.lastAnswered] the question they just answered
 * @param {Set<string>} [p.skip] subtopics not to ask about again this session
 * @param {(q: object) => number} [p.lastSeen] when they last answered a question (ms), 0 for never
 */
export function writtenTopupSubtopic({ questions, isAvailable, picked = [], lastAnswered = null, skip = new Set(), lastSeen = () => 0 }) {
  const whole = !picked?.length
  // Each subtopic's written answers in this session: how many, how many can still come up, last done.
  const stats = new Map()
  for (const q of questions || []) {
    if (!q?.subtopic || !isAiMarked(q) || !(whole || picked.includes(q.subtopic))) continue
    const s = stats.get(q.subtopic) || { total: 0, left: 0, seen: 0 }
    s.total++
    if (isAvailable(q)) s.left++
    s.seen = Math.max(s.seen, lastSeen(q) || 0)
    stats.set(q.subtopic, s)
  }

  // Subtopic → refill once this many or fewer are left.
  const lowWater = new Map()
  const consider = (subtopic, most) => {
    if (subtopic) lowWater.set(subtopic, Math.max(lowWater.get(subtopic) ?? 0, most))
  }
  for (const s of picked || []) consider(s, 0)
  if (lastAnswered?.subtopic) consider(lastAnswered.subtopic, isAiMarked(lastAnswered) ? WRITTEN_TOPUP_LOW_WATER : 0)
  if (whole && stats.size && [...stats.values()].every(s => s.left === 0)) {
    const recent = [...stats.entries()]
      .filter(([subtopic]) => !skip.has(subtopic))
      .sort((a, b) => b[1].seen - a[1].seen)[0]
    if (recent) consider(recent[0], 0)
  }

  let best = null
  for (const [subtopic, most] of lowWater) {
    const s = stats.get(subtopic)
    if (skip.has(subtopic) || !s) continue
    if (s.left > most) continue
    if (!best || s.left < best.left) best = { subtopic, left: s.left }
  }
  return best?.subtopic ?? null
}
