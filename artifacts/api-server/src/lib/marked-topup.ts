/**
 * Written-answer top-ups (POST /api/marked/top-up). When a student has used
 * up the written-answer questions in a subtopic, more are written for them in
 * the background, within a daily allowance (migration
 * 20261115000000_marked_topups.sql). These are the rules for when that
 * happens; the route does the database work.
 */

/** Written-answer questions a student can have written for them in a day, unless the subject says otherwise. */
export const DEFAULT_MARKED_TOPUP_DAILY_LIMIT = 6;

/**
 * More are written once the student has this many or fewer unanswered in the
 * subtopic. The app asks at 1 left, so a written answer is ready by the time
 * they finish the last one; the server allows a little slack because the app
 * also counts a reworded copy of a question they've done as done.
 */
export const MARKED_TOPUP_LOW_WATER = 2;

/** Unanswered questions sent back, at most, when there's no need to write more. */
export const MARKED_TOPUP_SERVE_MAX = 6;

/** The daily allowance from curricula.features.marked_topup_daily_limit (0 turns top-ups off). */
export function markedTopupLimit(features: Record<string, unknown> | null | undefined): number {
  const n = features?.marked_topup_daily_limit;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_MARKED_TOPUP_DAILY_LIMIT;
}

/** The subject's subtopic with this name (ignoring case and spacing), or null. */
export function findSubtopic<T extends { id: string; name: string | null }>(subtopics: T[] | null | undefined, name: string): T | null {
  const key = (s: string | null | undefined) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const want = key(name);
  if (!want) return null;
  return (subtopics ?? []).find((s) => key(s.name) === want) ?? null;
}

export type TopupPlan =
  /** The subtopic has no written-answer questions: top-ups only refill, they don't start written answers somewhere new. */
  | { action: "none" }
  /** Enough left unanswered: send those back (the app may not have them yet) and write nothing. */
  | { action: "serve"; ids: string[] }
  /** Used up: write more. */
  | { action: "generate" };

/**
 * What to do for a student in one subtopic, from the written-answer questions
 * there (newest first is best, as those are the ones the app is most likely
 * to be missing) and the ids of the ones they've answered.
 */
export function planMarkedTopup(bank: { id: string }[], answered: ReadonlySet<string>): TopupPlan {
  if (!bank.length) return { action: "none" };
  const unanswered = bank.filter((q) => !answered.has(q.id)).map((q) => q.id);
  if (unanswered.length > MARKED_TOPUP_LOW_WATER) return { action: "serve", ids: unanswered.slice(0, MARKED_TOPUP_SERVE_MAX) };
  return { action: "generate" };
}

/** A difficulty for the generator: 1–5, or 'mixed' for anything else. */
export function topupDifficulty(raw: unknown): number | "mixed" {
  const d = Number(raw);
  return raw === "mixed" || raw === null || raw === undefined || raw === "" || !(d >= 1 && d <= 5) ? "mixed" : Math.round(d);
}
