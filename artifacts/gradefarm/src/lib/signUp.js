// Helpers for "Sign them up": turning a finished consultation diagnostic into an invite.

const firstWord = (s) => String(s || '').trim().split(/\s+/)[0] || ''

/** Starting values for the sign-up form, from a diagnostic row.
 *  The subject is ticked only when the tutor can include subjects and it is one they can include
 *  (includableIds: the ids from the included-subjects list). */
export function signUpDefaults(row, { canInclude, includableIds } = {}) {
  const r = row || {}
  const carry = !!(canInclude && r.curriculum_id && (includableIds || []).includes(r.curriculum_id))
  return {
    email: r.prospect_email || '',
    curriculumIds: carry ? [r.curriculum_id] : [],
    parentEmail: r.parent_email || null,
    childName: firstWord(r.submitted_by_name || r.student_name),
  }
}

/** The chip a row shows once the prospect has been invited or has signed up. */
export function signUpChip(signup) {
  if (!signup) return null
  if (signup.status === 'signed_up') return { label: signup.studentName ? `Signed up · ${signup.studentName}` : 'Signed up', tone: 'success' }
  if (signup.status === 'invited') return { label: 'Invited', tone: 'gold' }
  return null
}

/** Whether the consultation diagnostic comes across with the invite:
 *  'carries' | 'not-ticked' | 'cannot-include' | 'no-subject' (a built-in diagnostic has no subject). */
export function carryState({ sourceId, ticked, canInclude, includableIds } = {}) {
  if (!sourceId) return 'no-subject'
  if (!canInclude || !(includableIds || []).includes(sourceId)) return 'cannot-include'
  return (ticked || []).includes(sourceId) ? 'carries' : 'not-ticked'
}

/** The one warning to show for a carry state, or null. */
export function carryMessage(state) {
  if (state === 'not-ticked') return "Their consultation diagnostic won't carry across without this subject."
  if (state === 'cannot-include') return "Their consultation diagnostic won't carry across, because this subject can't be included from your account."
  return null
}

/** Whether some ticked subject still gets a new 20-question diagnostic (the carried one doesn't). */
export function needsOwnDiagnostic(ticked, carriedId) {
  return (ticked || []).some(id => id !== carriedId)
}
