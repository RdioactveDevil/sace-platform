// Helpers for the "New consultation" form (POST /api/tutor/consultations/new).
// Pure checks and the request body; the route does the writing and sending.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** A fresh form: nothing typed, the questionnaire and the test ticked. */
export function emptyNewConsultation() {
  return {
    studentName: '',
    studentEmail: '',
    sendToStudent: false,
    parentEmail: '',
    sendToParent: false,
    startIso: '',
    reminderMinutes: null,   // null: the tutor's defaults
    sendQuestionnaire: true,
    tailored: null,          // a questionnaire edited for this student, or null to use the tutor's own
    sendTest: true,
    test: null,              // { yearLevel, subjects, questions } once generated and previewed
  }
}

/** The message to show while the recipients can't be sent to yet, or null. */
export function recipientsError(form) {
  if (!form.sendToStudent && !form.sendToParent) return 'Choose who to send it to: the student, the parent or both.'
  if (form.sendToStudent && !EMAIL_RE.test(String(form.studentEmail || '').trim())) return 'Enter a valid email address for the student.'
  if (form.sendToParent && !EMAIL_RE.test(String(form.parentEmail || '').trim())) return 'Enter a valid email address for the parent.'
  return null
}

/** The first thing stopping Send, or null when the form can be sent. */
export function newConsultationError(form) {
  if (!String(form.studentName || '').trim()) return "Enter the student's name."
  const r = recipientsError(form)
  if (r) return r
  if (!form.startIso) return 'Choose a time for the call.'
  if (form.sendTest && !form.test) return 'Generate the test and check its questions first, or untick Diagnostic test.'
  return null
}

/** Exactly the route's body. An unticked address is left blank (the route doesn't keep it). */
export function newConsultationBody(form) {
  const t = form.sendTest ? form.test : null
  return {
    studentName: String(form.studentName || '').trim(),
    studentEmail: form.sendToStudent ? String(form.studentEmail || '').trim().toLowerCase() : '',
    sendToStudent: !!form.sendToStudent,
    parentEmail: form.sendToParent ? String(form.parentEmail || '').trim().toLowerCase() : '',
    sendToParent: !!form.sendToParent,
    start: form.startIso,
    ...(Array.isArray(form.reminderMinutes) && form.reminderMinutes.length ? { reminderMinutes: form.reminderMinutes } : {}),
    questionnaire: form.sendQuestionnaire ? (form.tailored || 'default') : null,
    test: t ? { yearLevel: t.yearLevel, subjects: t.subjects, questions: t.questions } : null,
  }
}

/** "student, parent" from the route's `emailed` ({ student?, parent? } booleans). */
export function whoWasEmailed(emailed) {
  const e = emailed || {}
  return [e.student ? 'student' : '', e.parent ? 'parent' : ''].filter(Boolean).join(', ')
}
