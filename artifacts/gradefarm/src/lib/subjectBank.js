/**
 * The question bank held in App state, tagged with the subject it was loaded
 * for. Banks load asynchronously and a subject can change while one is in
 * flight (switching subjects, the picker, an assignment in another subject),
 * so a bank is only ever shown under its own subject: otherwise one subject's
 * topic list fills with another subject's questions.
 */
export const NO_QUESTIONS = Object.freeze([])

export function emptyBank() {
  return { subjectId: null, questions: NO_QUESTIONS }
}

/** @param {string} subjectId  the subject tile's id  @param {Array} questions */
export function storedBank(subjectId, questions) {
  return { subjectId: subjectId ?? null, questions: questions || NO_QUESTIONS }
}

/** The bank's questions if it belongs to `subjectId`, else none. */
export function bankForSubject(bank, subjectId) {
  return bank && subjectId != null && bank.subjectId === subjectId ? bank.questions : NO_QUESTIONS
}
