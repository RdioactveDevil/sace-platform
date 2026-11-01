// Rebuilds quiz sessions from the answer log for History.
//
// Answers recorded with a session_id belong to that session. Older answers
// have none, so those are split wherever the student went SESSION_GAP_MS
// without answering.

export const SESSION_GAP_MS = 10 * 60 * 1000

const timeOf = (a) => new Date(a.answered_at).getTime()

/**
 * Group answer_log rows ({ question_id, correct, answered_at, session_id })
 * into sessions, newest session first. Each session is
 * { id, date (its first answer), answers (in the order given), correct, total,
 *   allIds, wrongIds } where allIds are its distinct question ids and
 * wrongIds the ones answered wrong at least once.
 */
export function groupAnswersIntoSessions(answers, gapMs = SESSION_GAP_MS) {
  const sorted = [...(answers || [])].sort((a, b) => timeOf(a) - timeOf(b))
  const sessions = []
  const byId = new Map()
  let open = null // the session without an id that the next unlinked answer may join
  for (const a of sorted) {
    let s
    if (a.session_id) {
      s = byId.get(a.session_id)
      if (!s) {
        s = { id: a.session_id, answers: [] }
        byId.set(a.session_id, s)
        sessions.push(s)
      }
    } else {
      const last = open?.answers[open.answers.length - 1]
      if (!last || timeOf(a) - timeOf(last) > gapMs) {
        open = { id: `t${timeOf(a)}`, answers: [] }
        sessions.push(open)
      }
      s = open
    }
    s.answers.push(a)
  }
  return sessions
    .map(s => {
      const allIds = [...new Set(s.answers.map(a => a.question_id).filter(Boolean))]
      const wrong = new Set(s.answers.filter(a => !a.correct).map(a => a.question_id))
      return {
        id: s.id,
        date: s.answers[0].answered_at,
        answers: s.answers,
        correct: s.answers.filter(a => a.correct).length,
        total: s.answers.length,
        allIds,
        wrongIds: allIds.filter(id => wrong.has(id)),
      }
    })
    .sort((a, b) => timeOf({ answered_at: b.date }) - timeOf({ answered_at: a.date }))
}
