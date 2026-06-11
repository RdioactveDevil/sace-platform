// Managed curricula cache — populated from DB on admin dashboard mount.
// Keys: curriculum names (e.g. "Year 9 Biology").
// Values: arrays of { code, name, topicName }.
let _managedTopicsCache = {}

export async function refreshManagedTopicsCache(fetcher) {
  try {
    _managedTopicsCache = await fetcher()
  } catch (e) {
    console.warn('[adminTopics] Could not load managed curricula topics:', e)
  }
}

export function getManagedSubjectNames() {
  return Object.keys(_managedTopicsCache)
}

/**
 * Returns topics for a subject. DB cache is the only source.
 * @param {string} subjectId  curriculum name or subject id
 * @returns {{ code: string, name: string, topicName?: string }[]}
 */
export function getTopicsBySubject(subjectId) {
  return _managedTopicsCache[subjectId] || []
}

/**
 * Reverse lookup: topic name → topic code.
 * @param {string} subject
 * @param {string} topicName
 * @returns {string|null}
 */
export function getTopicCodeByName(subject, topicName) {
  const topics = getTopicsBySubject(subject)
  if (!topics || !topicName) return null
  const norm = topicName.trim().toLowerCase()
  const match = topics.find(t => t.name.trim().toLowerCase() === norm)
  return match?.code ?? null
}
