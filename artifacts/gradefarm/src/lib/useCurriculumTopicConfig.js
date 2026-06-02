import { useState, useEffect } from 'react'
import { loadCurriculumMacroGroups } from './curriculaDb'
import { buildCurriculumTopicConfig, getTopicConfigForSubject } from './saceTopics'
import { getY7TopicConfig } from './australianCurriculumTopics'

/**
 * Hook that returns the topic config (macroGroups, normFn, isTwoLevel) for a subject.
 *
 * Priority order:
 *   1. DB-loaded curriculum (for subjects with curriculumName or curriculum_* id)
 *   2. Hardcoded Y7/Y10 config (stable, matches existing question tags)
 *   3. getTopicConfigForSubject fallback (Chemistry etc.) — only when withFallback=true
 *   4. null — while DB is still loading, or for subjects with no config
 *
 * When isTwoLevel=true (DB-driven), q.subtopic is the selectable leaf;
 * callers should normalize q.subtopic rather than q.topic.
 *
 * @param {object} subject   subject tile from ALL_SUBJECTS or dynamic curricula
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

  // Stable hardcoded configs for Y7 Maths, Y7 English, Y10 Maths
  const hardcoded = getY7TopicConfig(subject?.id)
  if (hardcoded) return hardcoded

  // Still loading DB config — return null so callers can show a loading state
  if (curriculumName) return null

  // No DB or hardcoded config — use Chemistry/generic fallback if requested
  if (withFallback) return getTopicConfigForSubject(subject)
  return null
}
