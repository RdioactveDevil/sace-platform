/**
 * Whether a student gets a question's worked solution (POST /answers/solutions).
 *
 * - Tutors and admins: always.
 * - A question they've answered in practice: yes (practice already showed it).
 * - Otherwise only with a paid plan (any subscription but the free subject)
 *   that covers the question, and then for real past or trial paper
 *   questions and for questions in their own exam attempts.
 *
 * The free subject never gets past-paper solutions, and neither does an exam
 * attempt a free student made outside the app.
 */
export function solutionAllowed(c: { staff: boolean; answered: boolean; paid: boolean; pastPaper: boolean; inOwnAttempt: boolean }): boolean {
  if (c.staff || c.answered) return true;
  return c.paid && (c.pastPaper || c.inOwnAttempt);
}
