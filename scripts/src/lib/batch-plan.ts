/**
 * What a batch run (Admin → Exam papers → the "Ingest exam paper" Action)
 * does with each paper in the batch:
 *   - load:      read it and save its questions;
 *   - skip:      --resume, and this batch already loaded it with the review
 *                step (its result says reviewed), so a stopped or timed-out
 *                run carries on where it left off;
 *   - duplicate: another paper in the batch has the same label. Questions are
 *                stored by label and number, so the second would overwrite the
 *                first: neither is loaded until the labels are fixed.
 */
export type BatchPaper = { source?: string; kind?: string; publisher?: string; year?: number | string; paper?: string; pdf?: string };
export type BatchResult = { status?: string; mode?: string; reviewed?: boolean } | undefined;
export type Step = { index: number; label: string; action: "load" | "skip" | "duplicate"; reason: string };

/** "VCAA 2023 Exam 2" or "NEAP 2024 Trial Exam 2", as questions are labelled. */
export function batchLabel(p: BatchPaper): string {
  return p.source || [p.publisher, p.year, p.kind === "commercial" ? "Trial" : "", p.paper].filter(Boolean).join(" ");
}

export function planBatch(papers: BatchPaper[], results: Record<string, BatchResult>, opts: { resume: boolean; apply: boolean }): Step[] {
  const count = new Map<string, number>();
  for (const p of papers) count.set(batchLabel(p), (count.get(batchLabel(p)) || 0) + 1);
  return papers.map((p, index) => {
    const label = batchLabel(p);
    if ((count.get(label) || 0) > 1) {
      return { index, label, action: "duplicate" as const, reason: `${count.get(label)} papers in this batch are labelled "${label}": each would overwrite the others' questions. Fix the publisher or paper so each label is different.` };
    }
    const r = results[String(index)];
    if (opts.resume && opts.apply && r?.status === "saved" && r.mode === "apply" && r.reviewed) {
      return { index, label, action: "skip" as const, reason: "already loaded for review by this batch" };
    }
    return { index, label, action: "load" as const, reason: "" };
  });
}
