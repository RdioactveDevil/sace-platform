import { BUILT_IN_CURRICULA } from './builtInCurricula'

// Flatten all subtopics for a given curriculum name into the { code, name, short? } format
// expected by the admin generate/review screens and australianCurriculumTopics.js.
function _flat(curriculumName) {
  const c = BUILT_IN_CURRICULA.find(c => c.name === curriculumName)
  return c ? c.topics.flatMap(t => t.subtopics) : []
}

// Named exports preserved for australianCurriculumTopics.js, vicMathsTopics.js, and tests.
export const S1_TOPICS              = _flat('Chemistry Stage 1')
export const S2_TOPICS              = _flat('Chemistry Stage 2')
export const Y7_MATHS_TOPICS        = _flat('Year 7 Mathematics')
export const Y7_ENGLISH_TOPICS      = _flat('Year 7 English')
export const Y10_MATHS_TOPICS       = _flat('Year 10 Mathematics')
export const MATHS_METHODS_S2_TOPICS = _flat('Mathematical Methods Stage 2')

// ── Managed curricula cache ───────────────────────────────────────────────────
// Populated by refreshManagedTopicsCache() called on admin dashboard mount.
// Keys are curriculum names (e.g. "Year 9 Biology").
// Values are arrays of { code, name, topicName }.
let _managedTopicsCache = {}

/**
 * Populate the managed topics cache from the DB.
 * Call once on admin dashboard mount and after a curriculum goes live.
 * @param {() => Promise<Object>} fetcher - loadManagedCurriculaTopics from curriculaDb.js
 */
export async function refreshManagedTopicsCache(fetcher) {
  try {
    _managedTopicsCache = await fetcher()
  } catch (e) {
    console.warn('[adminTopics] Could not load managed curricula topics:', e)
  }
}

/**
 * Returns all managed curriculum subject names currently in cache.
 * @returns {string[]}
 */
export function getManagedSubjectNames() {
  return Object.keys(_managedTopicsCache)
}

/**
 * Returns the topic list for a given subject ID or curriculum name.
 * DB-loaded managed cache is checked first; falls back to built-in data.
 * @param {string} subjectId  e.g. 'chemistry_s1', 'maths_y7', 'Mathematical Methods Stage 2'
 * @returns {{ code: string, name: string, short?: string }[]}
 */
export function getTopicsBySubject(subjectId) {
  if (_managedTopicsCache[subjectId]?.length) return _managedTopicsCache[subjectId]
  const curriculum = BUILT_IN_CURRICULA.find(
    c => c.subjectId === subjectId || c.name === subjectId || (c.aliases || []).includes(subjectId)
  )
  if (curriculum) return curriculum.topics.flatMap(t => t.subtopics)
  return []
}

/**
 * @param {'s1'|'s2'} stage
 * @param {string} code  e.g. '2.2'
 * @returns {{ code: string, name: string } | null}
 */
export function getTopicByCode(stage, code) {
  const list = stage === 's1' ? S1_TOPICS : S2_TOPICS
  return list.find(t => t.code === code) ?? null
}

/**
 * Returns the topic list as a numbered string for use in AI prompts.
 * @param {'s1'|'s2'} stage
 * @returns {string}
 */
export function topicsAsPromptList(stage) {
  const list = stage === 's1' ? S1_TOPICS : S2_TOPICS
  return list.map(t => `${t.code}: ${t.name}`).join('\n')
}

/**
 * Reverse lookup: given a subject label and a topic name (as stored in the
 * questions table), returns the topic code needed by the generate-questions API.
 * Returns null if no match is found.
 * @param {string} subject  e.g. 'Chemistry Stage 1', 'Year 7 Mathematics'
 * @param {string} topicName  the topic field from a questions row
 * @returns {string|null}
 */
export function getTopicCodeByName(subject, topicName) {
  const topics = getTopicsBySubject(subject)
  if (!topics || !topicName) return null
  const norm = topicName.trim().toLowerCase()
  const match = topics.find(t => t.name.trim().toLowerCase() === norm)
  return match?.code ?? null
}
