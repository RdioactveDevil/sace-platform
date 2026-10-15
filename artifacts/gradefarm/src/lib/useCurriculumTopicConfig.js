import { useState, useEffect } from 'react'
import { loadCurriculumMacroGroups } from './curriculaDb'
import { buildCurriculumTopicConfig, getTopicConfigForSubject } from './topicConfig'

/**
 * Hook that returns the topic config (macroGroups, normFn, isTwoLevel) for a subject.
 *
 * Priority order:
 *   1. DB-loaded curriculum (for subjects with curriculumName or curriculum_* id)
 *   2. getTopicConfigForSubject fallback (tile's topic list) — only when withFallback=true
 *   3. null — while DB is still loading, or for subjects with no config
 *
 * When isTwoLevel=true (DB-driven), q.subtopic is the selectable leaf;
 * callers should normalize q.subtopic rather than q.topic.
 *
 * @param {object} subject   subject tile (curriculumToSubjectTile or a Writing tile)
 * @param {{ withFallback?: boolean }} [opts]
 *   withFallback: if true, always returns something via getTopicConfigForSubject
 */
export function useCurriculumTopicConfig(subject, { withFallback = false } = {}) {
  const [dbConfig, setDbConfig] = useState(null)

  const curriculumName =
    subject?.curriculumName ||
    (subject?.id?.startsWith('curriculum_') ? subject.name : null)

  useEffect(() => {
    setDbConfig(null)
    if (!curriculumName) return
    let cancelled = false
    loadCurriculumMacroGroups(curriculumName)
      .then(groups => {
        if (!cancelled && groups) setDbConfig(buildCurriculumTopicConfig(groups))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [curriculumName])

  if (dbConfig) return dbConfig

  // Still loading DB config — callers with withFallback=true get a temporary fallback
  // instead of null so destructuring { normFn } doesn't crash during the async load
  if (curriculumName) {
    if (withFallback) return getTopicConfigForSubject(subject)
    return null
  }

  // No DB config — use the tile's topic list if requested
  if (withFallback) return getTopicConfigForSubject(subject)
  return null
}
