/**
 * Changing a loaded exam question's set (questions that share information;
 * migration 20261118000002_question_sets.sql) from Admin → a paper's page:
 * linking, unlinking, and the shared information and figure kept on a set's
 * first question. Only the fields sent change; null clears one.
 */
export type SetUpdate = Partial<{ set_key: string | null; set_position: number | null; shared_info: string | null; shared_image_url: string | null }>;

export function parseSetUpdate(body: unknown): { update: SetUpdate } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const update: SetUpdate = {};
  if ("set_key" in b) {
    if (b.set_key !== null && (typeof b.set_key !== "string" || !b.set_key.trim() || b.set_key.length > 200)) return { error: "set_key must be text or null" };
    update.set_key = b.set_key === null ? null : (b.set_key as string).trim();
  }
  if ("set_position" in b) {
    const p = b.set_position;
    if (p !== null && !(Number.isInteger(p) && (p as number) >= 1 && (p as number) <= 20)) return { error: "set_position must be a whole number from 1 to 20, or null" };
    update.set_position = p as number | null;
  }
  if ("shared_info" in b) {
    if (b.shared_info !== null && typeof b.shared_info !== "string") return { error: "shared_info must be text or null" };
    const t = typeof b.shared_info === "string" ? b.shared_info.slice(0, 8000).trim() : null;
    update.shared_info = t || null;
  }
  if ("shared_image_url" in b) {
    const u = b.shared_image_url;
    if (u !== null && (typeof u !== "string" || !/^https:\/\//i.test(u.trim()))) return { error: "shared_image_url must be an https link or null" };
    update.shared_image_url = u === null ? null : (u as string).trim();
  }
  // Unlinking clears both, so no question is left half in a set.
  const keyCleared = "set_key" in update && update.set_key === null;
  const positionCleared = "set_position" in update && update.set_position === null;
  if (keyCleared !== positionCleared) return { error: "Unlinking clears set_key and set_position together" };
  if (!Object.keys(update).length) return { error: "Nothing to change" };
  return { update };
}
