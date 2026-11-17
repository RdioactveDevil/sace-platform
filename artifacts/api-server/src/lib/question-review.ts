/**
 * Approving or rejecting questions loaded from exam papers (Admin → Exam
 * papers → Loaded papers). A pending or rejected question is kept from
 * students (questions_student, migration 20261118000000_question_review.sql).
 */

export type ReviewStatus = "pending" | "approved" | "rejected";
const STATUSES: ReviewStatus[] = ["pending", "approved", "rejected"];

/** Check { ids, status } from the admin page. */
export function parseReviewRequest(body: unknown): { ids: string[]; status: ReviewStatus } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!STATUSES.includes(b.status as ReviewStatus)) return { error: "status must be pending, approved or rejected" };
  if (!Array.isArray(b.ids) || !b.ids.length) return { error: "Pick at least one question" };
  const ids = [...new Set(b.ids.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 200))];
  if (ids.length !== b.ids.length && ids.length === 0) return { error: "Question IDs must be text" };
  if (ids.length > 1000) return { error: "Up to 1000 questions at a time" };
  return { ids, status: b.status as ReviewStatus };
}

type Flag = { code: string; where: string; message: string };

/**
 * A question's review after one of its figures was changed by hand (cropped
 * again, uploaded or removed): the crop checks on that figure (figure_* flags
 * at `where`, "" for the question's own figure) no longer apply.
 */
export function dropFigureFlags(review: unknown, where: string): Record<string, unknown> & { flags: Flag[] } {
  const r = (review && typeof review === "object" ? review : {}) as Record<string, unknown>;
  const flags = (Array.isArray(r.flags) ? r.flags : []) as Flag[];
  return { ...r, flags: flags.filter((f) => !(String(f?.code || "").startsWith("figure_") && String(f?.where || "") === where)) };
}
