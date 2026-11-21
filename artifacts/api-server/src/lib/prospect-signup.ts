/**
 * Signing a prospect up after a consultation call: the invite remembers the
 * prospect's diagnostic (tutor_invites.source_diagnostic_id) and, on accept,
 * it becomes the student's diagnostic for that subject.
 */

/** How long an invite stays open after it was sent (or created, if never sent). */
export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AdoptionAction = "adopt" | "keep-existing" | "create";

/**
 * What to do about the diagnostic of each subject unlocked on accept.
 * `existing` is the curriculum ids the student already has a diagnostic for.
 * Only the source diagnostic's own subject is adopted, and only while it
 * belongs to no student.
 */
export function adoptionPlan(o: {
  unlockedIds: string[];
  source: { id: string; curriculum_id: string | null; student_id: string | null } | null;
  existing: string[];
}): Map<string, AdoptionAction> {
  const plan = new Map<string, AdoptionAction>();
  for (const id of o.unlockedIds) {
    if (o.existing.includes(id)) plan.set(id, "keep-existing");
    else if (o.source && o.source.student_id === null && o.source.curriculum_id === id) plan.set(id, "adopt");
    else plan.set(id, "create");
  }
  return plan;
}

export type SignupState = null | { status: "invited" | "signed_up"; studentName?: string };

/** A diagnostic's sign-up state from the invites that reference it. */
export function signupState(
  invites: Array<{ status: string; sent_at?: string | null; created_at?: string | null; student_name?: string | null }>,
  now: number,
): SignupState {
  const accepted = invites.find((i) => i.status === "accepted");
  if (accepted) return accepted.student_name ? { status: "signed_up", studentName: accepted.student_name } : { status: "signed_up" };
  const open = (i: { sent_at?: string | null; created_at?: string | null }) => {
    const from = i.sent_at ?? i.created_at;
    return !from || now - new Date(from).getTime() <= INVITE_TTL_MS;
  };
  if (invites.some((i) => i.status === "pending" && open(i))) return { status: "invited" };
  return null;
}
