// Single source of truth for all subjects offered on the platform.
// `available` = questions exist and are live.
// `comingSoon` = planned but not yet launched.

/** Picker `id` → Supabase `questions.subject` (see getQuestions in db.js). */
export const QUESTIONS_SUBJECT_BY_ID = {
  chemistry_s1: 'Chemistry Stage 1',
  chemistry_s2: 'Chemistry Stage 2',
  maths_y7: 'Year 7 Mathematics',
  english_y7: 'Year 7 English',
  maths_y10: 'Year 10 Mathematics',
}

export const ALL_SUBJECTS = [
  {
    id: 'chemistry_s1',
    name: 'Chemistry',
    stage: 'Stage 1',
    icon: '⚗️',
    color: '#f1be43',
    topics: ['Atomic Structure', 'Bonding', 'Quantities', 'Periodic Table', 'Solutions', 'Acid–Base', 'Redox'],
    questionCount: 50,
    available: true,
  },
  {
    id: 'chemistry_s2',
    name: 'Chemistry',
    stage: 'Stage 2',
    icon: '⚗️',
    color: '#f1be43',
    topics: ['Monitoring the Environment', 'Chemical Processes', 'Organic Chemistry', 'Managing Resources'],
    questionCount: 15,
    available: true,
  },
  {
    id: 'biology_s1',
    name: 'Biology',
    stage: 'Stage 1',
    icon: '🧬',
    color: '#10b981',
    topics: ['Cells', 'Genetics', 'Evolution', 'Ecosystems'],
    questionCount: 0,
    available: false,
    comingSoon: true,
  },
  {
    id: 'biology_s2',
    name: 'Biology',
    stage: 'Stage 2',
    icon: '🧬',
    color: '#10b981',
    topics: ['DNA & Proteins', 'Cellular Processes', 'Evolution', 'Biodiversity'],
    questionCount: 0,
    available: false,
    comingSoon: true,
  },
  {
    id: 'physics_s1',
    name: 'Physics',
    stage: 'Stage 1',
    icon: '⚛️',
    color: '#f59e0b',
    topics: ['Motion', 'Forces', 'Energy', 'Waves'],
    questionCount: 0,
    available: false,
    comingSoon: true,
  },
  {
    id: 'physics_s2',
    name: 'Physics',
    stage: 'Stage 2',
    icon: '⚛️',
    color: '#f59e0b',
    topics: ['Motion', 'Electricity', 'Waves', 'Modern Physics'],
    questionCount: 0,
    available: false,
    comingSoon: true,
  },
  {
    id: 'maths_methods_s2',
    name: 'Mathematical Methods',
    stage: 'Stage 2',
    icon: '∫',
    color: '#6366f1',
    topics: ['Differentiation', 'Integration', 'Functions', 'Probability'],
    questionCount: 0,
    available: false,
    comingSoon: true,
  },
  {
    id: 'english_s2',
    name: 'English Literary Studies',
    stage: 'Stage 2',
    icon: '📖',
    color: '#ec4899',
    topics: ['Close Analysis', 'Essay Writing', 'Comparative Study'],
    questionCount: 0,
    available: false,
    comingSoon: true,
  },
  {
    id: 'maths_y7',
    name: 'Mathematics',
    stage: 'Year 7',
    icon: '📐',
    color: '#6366f1',
    topics: ['Number', 'Algebra', 'Measurement', 'Space', 'Statistics', 'Probability'],
    questionCount: 36,
    available: true,
  },
  {
    id: 'english_y7',
    name: 'English',
    stage: 'Year 7',
    icon: '📝',
    color: '#ec4899',
    topics: ['Language', 'Literature', 'Literacy'],
    questionCount: 18,
    available: true,
  },
  {
    id: 'maths_y10',
    name: 'Mathematics',
    stage: 'Year 10',
    icon: '📐',
    color: '#8b5cf6',
    topics: ['Number', 'Algebra', 'Functions & Graphs', 'Measurement', 'Geometry', 'Statistics', 'Probability'],
    questionCount: 217,
    available: true,
  },
  {
    id: 'writing_y56',
    name: 'Writing',
    stage: 'Year 5–6',
    icon: '✏️',
    color: '#14b8a6',
    type: 'writing',
    topics: ['Narrative', 'Persuasive'],
    questionCount: 0,
    available: true,
  },
  {
    id: 'writing_y78',
    name: 'Writing',
    stage: 'Year 7–8',
    icon: '✏️',
    color: '#14b8a6',
    type: 'writing',
    topics: ['Narrative', 'Persuasive'],
    questionCount: 0,
    available: true,
  },
  {
    id: 'writing_y910',
    name: 'Writing',
    stage: 'Year 9–10',
    icon: '✏️',
    color: '#14b8a6',
    type: 'writing',
    topics: ['Narrative', 'Persuasive'],
    questionCount: 0,
    available: true,
  },
]

// ── Managed curricula use the full DB name (e.g. "Mathematical Methods Stage 2") but
//    `stage` was left blank, so UI fallbacks like `|| 'Stage 1'` showed the wrong year.

const TRAILING_SACE_STAGE_RE = /\s+Stage\s*(1|2)\s*$/i

/** @param {string} [fullName] */
export function parseTrailingSaceStage(fullName) {
  if (!fullName || typeof fullName !== 'string') return ''
  const m = fullName.match(TRAILING_SACE_STAGE_RE)
  if (!m) return ''
  return m[1] === '2' ? 'Stage 2' : 'Stage 1'
}

/** @param {string} [fullName] */
export function stripTrailingSaceStage(fullName) {
  if (!fullName || typeof fullName !== 'string') return ''
  const s = fullName.replace(TRAILING_SACE_STAGE_RE, '').trim()
  return s || fullName.trim()
}

/** Stage label for headers and chips when `subject.stage` is missing. */
export function subjectStageForUi(subject) {
  if (!subject) return 'Stage 1'
  if (subject.stage) return subject.stage
  return parseTrailingSaceStage(subject.name) || 'Stage 1'
}

/** Name line without duplicating a trailing "Stage N" when we also show stage separately. */
export function subjectNameForUi(subject) {
  if (!subject) return 'Chemistry'
  const parsed = parseTrailingSaceStage(subject.name)
  const st = subject.stage
  if (parsed && (!st || st === parsed)) {
    const stripped = stripTrailingSaceStage(subject.name)
    if (stripped) return stripped
  }
  return subject.name || 'Chemistry'
}

/**
 * True if a saved subscription row covers this subject tile.
 * Aligns `stage: ''` in the DB with `stage` parsed from the curriculum name.
 */
export function subscriptionMatchesSubject(subscriptionRow, subjectTile) {
  if (!subscriptionRow || !subjectTile) return false
  if (subscriptionRow.subject_name !== subjectTile.name) return false
  const parsed = parseTrailingSaceStage(subjectTile.name)
  const a = subscriptionRow.stage || parsed || ''
  const b = subjectTile.stage || parsed || ''
  return a === b
}

/** Compact label for a saved subscription / onboarding row. */
export function subjectRowSummary(saved) {
  if (!saved) return ''
  const tile = { name: saved.subject_name, stage: saved.stage }
  return `${subjectNameForUi(tile)} ${subjectStageForUi(tile)}`.trim()
}
