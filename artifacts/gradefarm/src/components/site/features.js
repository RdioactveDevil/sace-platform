// The features on /features, in order, with the slug each one has in the URL
// (/features#spaced-repetition). The homepage's What's inside cards link here.
export const FEATURES = [
  { slug: 'infinite-questions', name: 'Infinite Questions' },
  { slug: 'adaptive-difficulty', name: 'Adaptive Difficulty' },
  { slug: 'comeback-mode', name: 'Comeback Mode' },
  { slug: 'spaced-repetition', name: 'Spaced Repetition' },
  { slug: 'exam-builder', name: 'The Exam Builder' },
  { slug: 'examiner-marking', name: 'Examiner Marking' },
  { slug: 'titan', name: 'Your Tutor, Titan AI' },
  { slug: 'exam-grade-questions', name: 'Exam-Grade Questions' },
  { slug: 'ranks-and-leagues', name: 'Ranks & Leagues' },
]

export const FEATURE_SLUGS = FEATURES.map(f => f.slug)

/** The feature index for a URL hash ("#comeback-mode"), or 0. */
export function featureFromHash(hash) {
  const i = FEATURE_SLUGS.indexOf(String(hash || '').replace(/^#/, ''))
  return i < 0 ? 0 : i
}
