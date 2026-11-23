// Helpers for the tutor's report of a timed (50 mark / 50 minute) diagnostic.

/** A report entry for a marked question, in the shape the bank's mark-by-mark components read; null when it has no mark points. */
export function markedResult(qr) {
  if (!qr || !Array.isArray(qr.points) || qr.points.length === 0) return null
  return { marks: qr.points, awarded: qr.marks_awarded ?? 0, total: qr.marks_possible ?? 0, summary: qr.feedback || '' }
}

/** Marks in Part 1 (multiple choice) and Part 2 (short answer): { part1, part1Max, part2, part2Max }. */
export function partScores(questions, questionResults) {
  const byId = new Map((questionResults || []).map(qr => [String(qr.id), qr]))
  const out = { part1: 0, part1Max: 0, part2: 0, part2Max: 0 }
  for (const q of questions || []) {
    const qr = byId.get(String(q.id))
    const possible = Number(qr?.marks_possible ?? q.marks ?? q.total_marks ?? 0) || 0
    const awarded = Number(qr?.marks_awarded) || 0
    if (q.type === 'multiple_choice') { out.part1 += awarded; out.part1Max += possible }
    else { out.part2 += awarded; out.part2Max += possible }
  }
  return out
}

/** Whole minutes between start and submit (at least 1); null when either is missing or the order is wrong. */
export function timeTakenMinutes(startedAt, completedAt) {
  const s = Date.parse(startedAt), c = Date.parse(completedAt)
  if (!Number.isFinite(s) || !Number.isFinite(c) || c < s) return null
  return Math.max(1, Math.round((c - s) / 60000))
}
