/**
 * Spaced review: every answer sets a question's next_review for the student
 * (record_answer_for). Once that time has passed the question is "due back",
 * and practice sessions open with it. The student may skip a due review (it
 * stays due), which is why a held question that's due can be let go
 * (routes/answers.ts, /answers/present).
 */

/** Whether a struggle_profiles row is due back: answered before, and its review time has passed. */
export function isDueReview(
  row: { attempts?: number | null; next_review?: string | null } | null | undefined,
  now = Date.now(),
): boolean {
  const at = row?.next_review ? Date.parse(row.next_review) : NaN;
  return !!row && Number(row.attempts) > 0 && Number.isFinite(at) && at <= now;
}
