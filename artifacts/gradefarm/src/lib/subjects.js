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

/** Admin curriculum wizard + detail: SACE stages and Australian year levels. */
export const COHORT_LEVEL_OPTIONS = [
  'Stage 1',
  'Stage 2',
  'Year 7',
  'Year 8',
  'Year 9',
  'Year 10',
  'Year 11',
  'Year 12',
]

/**
 * Derive "Stage 1", "Stage 2", or "Year N" from a legacy `curricula.name` when `level_label` is empty.
 * @param {string} fullName
 * @returns {string}
 */
export function inferCohortLabelFromCurriculumName(fullName) {
  if (!fullName || typeof fullName !== 'string') return ''
  const mStage = fullName.match(/\bStage\s*([12])\b/i)
  if (mStage) return `Stage ${mStage[1]}`
  const mYear = fullName.match(/\bYear\s*(\d{1,2})\b/i)
  if (mYear) return `Year ${mYear[1]}`
  return ''
}

/**
 * Stage / year shown on live curriculum tiles (Subject Picker, onboarding).
 * @param {string} fullName  `curricula.name` (canonical `questions.subject`)
 * @param {string} [levelLabel] `curricula.level_label`
 * @returns {string}
 */
export function effectiveCohortStageForLiveCurriculum(fullName, levelLabel) {
  const fromCol = (levelLabel || '').trim()
  if (fromCol) return fromCol
  return inferCohortLabelFromCurriculumName(fullName)
}

/**
 * Build canonical `curricula.name` / `questions.subject` from title + cohort (matches AC year ordering vs SACE).
 * @param {string} title short subject title, e.g. "Mathematical Methods"
 * @param {string} levelLabel one of COHORT_LEVEL_OPTIONS
 * @returns {string}
 */
export function buildCanonicalCurriculumName(title, levelLabel) {
  const t = String(title || '').trim().replace(/\s+/g, ' ')
  const lv = String(levelLabel || '').trim()
  if (!t) throw new Error('Subject title is required')
  if (!lv) throw new Error('Cohort level is required')
  if (/^year\s*\d+/i.test(lv)) {
    const yn = lv.match(/\d+/)
    return `Year ${yn ? yn[0] : ''} ${t}`.replace(/\s+/g, ' ').trim()
  }
  if (/^stage\s*[12]$/i.test(lv)) {
    const sn = lv.match(/[12]/i)
    return `${t} Stage ${sn ? sn[0] : ''}`.replace(/\s+/g, ' ').trim()
  }
  return `${t} ${lv}`
}
