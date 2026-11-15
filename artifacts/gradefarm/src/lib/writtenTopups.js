// When the quiz asks the server for more written-answer questions
// (POST /api/marked/top-up, via fetchMoreWrittenAnswers in lib/db.js).
//
// Written answers are slow and costly to write, so the quiz only refills a
// subtopic the student is actually working through:
//  - the subtopic of the written answer they just did, once it's down to its
//    last one, so the next is ready by the time they finish it; and
//  - a subtopic they picked for this session that has none left.
// A subtopic with no written answers at all is never started. The server
// checks all of this again and keeps each student to a daily allowance.

import { isAiMarked } from './questionTypes.js'

/** Written answers left in a subtopic at which the quiz asks for more. */
export const WRITTEN_TOPUP_LOW_WATER = 1

/**
 * The subtopic to ask for more written answers in, or null.
 * @param {object} p
 * @param {object[]} p.questions the session's questions
 * @param {(q: object) => boolean} p.isAvailable whether a question can still come up this session
 * @param {string[]} [p.picked] subtopics the student chose (empty: the whole subject)
 * @param {object|null} [p.lastAnswered] the question they just answered
 * @param {Set<string>} [p.skip] subtopics not to ask about again this session
 */
export function writtenTopupSubtopic({ questions, isAvailable, picked = [], lastAnswered = null, skip = new Set() }) {
  const lowWater = new Map()
  for (const s of picked || []) if (s) lowWater.set(s, 0)
  if (lastAnswered?.subtopic && isAiMarked(lastAnswered)) lowWater.set(lastAnswered.subtopic, WRITTEN_TOPUP_LOW_WATER)

  let best = null
  for (const [subtopic, most] of lowWater) {
    if (skip.has(subtopic)) continue
    const written = (questions || []).filter(q => q.subtopic === subtopic && isAiMarked(q))
    if (!written.length) continue
    const left = written.filter(isAvailable).length
    if (left > most) continue
    if (!best || left < best.left) best = { subtopic, left }
  }
  return best?.subtopic ?? null
}
