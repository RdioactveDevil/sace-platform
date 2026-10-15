// Topic configuration for the active subject. Topics come from the
// `curricula` → `curriculum_topics` → `curriculum_subtopics` tables (see
// useCurriculumTopicConfig); nothing here is subject-specific.

/**
 * Macro groups + normaliser for subjects whose topic keys are exactly the strings
 * in `topicList` (managed curricula, Mathematical Methods, Biology tiles, etc.).
 */
export function buildGenericTopicConfig(topicList, groupLabel = 'Topics') {
  const topics = [...new Set((topicList || []).filter(Boolean))]
  const lowerToCanon = new Map(topics.map((t) => [String(t).trim().toLowerCase(), t]))

  function normFn(raw) {
    if (!raw) return null
    const key = String(raw).trim().toLowerCase()
    return lowerToCanon.get(key) ?? null
  }

  return {
    macroGroups: [{ id: 'g1', num: 1, label: groupLabel, topics }],
    normFn,
  }
}

function curriculumGroupLabel(displayName) {
  if (!displayName) return 'Topics'
  const stripped = String(displayName).replace(/\s+Stage\s*[12]\s*$/i, '').trim()
  return stripped || 'Topics'
}

/**
 * Resolves topic normalisation and macro groups for the **active subject**.
 * Topics come from the subject tile (DB curriculum); there are no hard-coded
 * per-subject topic lists any more.
 */
export function getTopicConfigForSubject(subject) {
  const topics = Array.isArray(subject?.topics) ? subject.topics : []
  const label = subject?.id?.startsWith('curriculum_')
    ? curriculumGroupLabel(subject.name)
    : subject?.name || 'Topics'
  return buildGenericTopicConfig(topics, label)
}

/**
 * Build a two-level topic config from DB-loaded macro groups.
 * Each group's label = curriculum topic (e.g. "Functions");
 * each group's topics[] = curriculum subtopic names (e.g. "Exponential functions").
 * HomeScreen uses q.subtopic (not q.topic) as the selectable leaf when isTwoLevel=true.
 */
export function buildCurriculumTopicConfig(macroGroups) {
  const allSubtopics = macroGroups.flatMap(g => g.topics)
  const lowerToCanon = new Map(allSubtopics.map(s => [String(s).trim().toLowerCase(), s]))
  return {
    macroGroups,
    normFn: (raw) => {
      if (!raw) return null
      return lowerToCanon.get(String(raw).trim().toLowerCase()) ?? null
    },
    isTwoLevel: true,
  }
}
