// The shape of a plan picked on the pricing page (lib/pendingCheckout.js).

/**
 * A plan as { subjects: [{ curriculumId, name, level }], interval: 'week' | 'month' },
 * from a plan or a single subject (what was saved before plans had several).
 */
export function normalizePlan(p) {
  if (!p) return null
  const subjects = (Array.isArray(p.subjects) ? p.subjects : p.curriculumId ? [p] : [])
    .filter(s => s && s.curriculumId)
    .map(s => ({ curriculumId: s.curriculumId, name: s.name, level: s.level || '' }))
  return subjects.length ? { subjects, interval: p.interval === 'month' ? 'month' : 'week' } : null
}
