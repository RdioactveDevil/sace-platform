// Managed curricula cache — populated from DB on admin dashboard mount.
// Keys: curriculum names (e.g. "Year 9 Biology").
// Values: arrays of { code, name, topicName }.
import { bankSubjectAliases, normalizeSubjectStorageKey } from './subjects.js'

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
 * Strip SACE / Stage N / Year N level tokens to the bare subject title, lower-cased.
 * Bridges spellings where the level appears on one side but not the other
 * (e.g. a question stored as "Mathematical Methods" vs a curriculum named
 * "Mathematical Methods Stage 2").
 */
function baseSubjectTitle(s) {
  return normalizeSubjectStorageKey(s)
    .replace(/^SACE\b/i, '')
    .replace(/\bStage\s*[12]\b/ig, '')
    .replace(/\bYear\s*\d{1,2}\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Resolve a `questions.subject` row spelling (e.g. "SACE Stage 2 Mathematical
 * Methods : ") to the managed curriculum name the topics cache is keyed by.
 * Question rows can store any alias spelling of the curriculum name, so an
 * exact key match isn't enough — compare the alias expansions of both sides.
 * @param {string} rawSubject
 * @returns {string|null} the cache key, or null when nothing matches
 */
export function resolveManagedSubjectName(rawSubject) {
  const raw = normalizeSubjectStorageKey(rawSubject).toLowerCase()
  if (!raw) return null
  const keys = Object.keys(_managedTopicsCache)

  // Fast path: exact (normalised) match.
  for (const key of keys) {
    if (normalizeSubjectStorageKey(key).toLowerCase() === raw) return key
  }

  // Alias match: intersect the spellings either side could appear under.
  const rawAliases = new Set(
    bankSubjectAliases(rawSubject, '').map(a => normalizeSubjectStorageKey(a).toLowerCase()),
  )
  rawAliases.add(raw)
  for (const key of keys) {
    const keyAliases = bankSubjectAliases(key, '').map(a => normalizeSubjectStorageKey(a).toLowerCase())
    if (keyAliases.some(a => rawAliases.has(a))) return key
  }

  // Base-title match: bridge a bare title to a "title Stage N" curriculum (or
  // vice versa) when the level token is present on only one side. Only used
  // when EXACTLY ONE managed curriculum shares the base title, so we never
  // mis-route a bare "Mathematical Methods" to the wrong stage when both
  // Stage 1 and Stage 2 are managed.
  const rawBase = baseSubjectTitle(rawSubject)
  if (rawBase) {
    const baseMatches = keys.filter(key => baseSubjectTitle(key) === rawBase)
    if (baseMatches.length === 1) return baseMatches[0]
  }
  return null
}

/**
 * Reverse lookup: topic name → topic code. Subject may be any alias spelling
 * of the curriculum name (question rows store legacy variants).
 * @param {string} subject
 * @param {string} topicName
 * @returns {string|null}
 */
export function getTopicCodeByName(subject, topicName) {
  const key = resolveManagedSubjectName(subject)
  const topics = key ? getTopicsBySubject(key) : []
  if (!topics.length || !topicName) return null
  const norm = topicName.trim().toLowerCase()
  const match = topics.find(t => t.name.trim().toLowerCase() === norm)
  return match?.code ?? null
}
