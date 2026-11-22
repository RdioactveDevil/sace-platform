/**
 * Loading a paper again: the questions an earlier load saved that this one
 * didn't find are taken away from students (rejected, not deleted, so an
 * admin can bring one back).
 *
 * The earlier load is found two ways: by this load's ids (ep_<sourceId>_…),
 * and by the paper's subject and label. A paper first loaded under another
 * label (Access papers were once saved as "VCAA <year> Exam" and relabelled
 * later) has other ids, and without the second lookup its copy stayed next to
 * the new one, every question twice.
 */
export type OldQuestion = { id: string; review_status: string | null };

export function staleQuestionIds(old: OldQuestion[], keep: Set<string>): string[] {
  const out = new Set<string>();
  for (const r of old) if (!keep.has(r.id) && r.review_status !== "rejected") out.add(r.id);
  return [...out];
}
