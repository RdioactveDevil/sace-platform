/**
 * Fixing many of a subject's questions at once (POST /api/admin/questions/bulk,
 * the Questions page inside a subject in Admin). This checks the request; the
 * route does the work.
 */

export const BULK_ACTIONS = ["move", "difficulty", "hide", "unhide", "delete"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

/** Most questions one request can change. */
export const BULK_MAX_IDS = 1000;

export type BulkRequest = {
  action: BulkAction;
  curriculumId: string;
  ids: string[];
  /** move: the subtopic (of this subject) the questions go to. */
  subtopicId?: string;
  /** difficulty: 1 to 5. */
  difficulty?: number;
};

export function parseBulkRequest(body: unknown): BulkRequest | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const action = b.action as BulkAction;
  if (!BULK_ACTIONS.includes(action)) return { error: `action must be one of ${BULK_ACTIONS.join(", ")}` };
  if (typeof b.curriculumId !== "string" || !b.curriculumId) return { error: "curriculumId required" };
  if (!Array.isArray(b.ids)) return { error: "ids must be a list of question ids" };
  const ids = [...new Set(b.ids.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 200))];
  if (!ids.length) return { error: "Pick at least one question" };
  if (ids.length > BULK_MAX_IDS) return { error: `Up to ${BULK_MAX_IDS} questions at a time` };
  const out: BulkRequest = { action, curriculumId: b.curriculumId, ids };
  if (action === "move") {
    if (typeof b.subtopicId !== "string" || !b.subtopicId) return { error: "Pick the subtopic to move them to" };
    out.subtopicId = b.subtopicId;
  }
  if (action === "difficulty") {
    const d = Number(b.difficulty);
    if (!Number.isInteger(d) || d < 1 || d > 5) return { error: "Difficulty must be 1 to 5" };
    out.difficulty = d;
  }
  return out;
}

/** The concept tag questions are grouped by (as generated questions get it). */
export const conceptTag = (subject: string, topic: string, subtopic: string) => `${subject}|${topic}|${subtopic}`.toLowerCase();

/** Lists of at most `size`, for `.in()` filters that would make the URL too long. */
export function chunks<T>(list: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
