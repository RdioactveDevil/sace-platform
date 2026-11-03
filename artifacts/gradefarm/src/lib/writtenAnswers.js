// Helpers for showing an AI-marked written answer.

/**
 * Where each quoted piece of evidence sits in the answer, as non-overlapping
 * [start, end, pointIndex] ranges in reading order. Quotes that can't be found
 * as written (case aside) aren't highlighted.
 */
export function evidenceRanges(answer, marks) {
  const lower = String(answer || '').toLowerCase()
  const found = []
  for (const m of marks || []) {
    if (!(m.awarded > 0) || !m.evidence) continue
    const needle = m.evidence.toLowerCase()
    let from = 0
    let at = -1
    // Skip past a range already taken by an earlier mark point.
    while ((at = lower.indexOf(needle, from)) !== -1) {
      const end = at + needle.length
      if (!found.some(([s, e]) => at < e && end > s)) break
      from = at + 1
    }
    if (at !== -1) found.push([at, at + needle.length, m.point])
  }
  return found.sort((a, b) => a[0] - b[0])
}
