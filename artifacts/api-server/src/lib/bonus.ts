import { createHash } from "node:crypto";

/**
 * Bonus questions: about 1 in BONUS_EVERY new practice questions is worth 2×
 * XP when answered right (a wrong answer costs the usual amount). Which ones
 * is fixed per student and question, so /answers/present (which tells the app
 * to show the "Bonus question" chip) and /answers/check (which pays it) agree,
 * and reloading the page can't reroll it. The route also checks the question
 * is new to the student and is practice, not an assignment.
 */
export const BONUS_EVERY = 12;
export const BONUS_MULTIPLIER = 2;

/** Whether this student's copy of this question is a bonus one (before the "new to them" check). */
export function isBonusPick(userId: string, questionId: string): boolean {
  if (!userId || !questionId) return false;
  const h = createHash("sha256").update(`bonus:${userId}:${questionId}`).digest();
  return h.readUInt32BE(0) % BONUS_EVERY === 0;
}

/** XP for a bonus question: right answers are doubled; nothing else changes. */
export function bonusXP(xp: number): number {
  return xp > 0 ? xp * BONUS_MULTIPLIER : xp;
}
