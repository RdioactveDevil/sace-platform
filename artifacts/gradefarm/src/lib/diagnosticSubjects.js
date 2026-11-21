// Subjects for the tutor's Diagnostic tab that come from the curriculum database.

const ALL_YEAR_GROUPS = ['primary', 'junior', 'stage1', 'stage2']

/**
 * Which year groups a curriculum's level label belongs to. VCE unit pairs
 * ("Units 1/2", "Units 3 and 4") count as Year 11 and Year 12. A label this
 * doesn't recognise shows under every year level rather than being hidden.
 */
export function curriculumToYearGroups(levelLabel) {
  const l = (levelLabel || '').toLowerCase()
  if (/units?\s*1\s*(\/|&|and|-)\s*2/.test(l)) return ['stage1']
  if (/units?\s*3\s*(\/|&|and|-)\s*4/.test(l)) return ['stage2']
  if (/stage\s*2|year\s*12\b/.test(l)) return ['stage2']
  if (/stage\s*1|year\s*11\b/.test(l)) return ['stage1']
  if (/year\s*(7|8|9|10)\b/.test(l)) return ['junior']
  if (/year\s*[1-6]\b/.test(l)) return ['primary']
  return [...ALL_YEAR_GROUPS]
}

/** A live curriculum as a Diagnostic-tab subject, with its topic names. */
export function dbDiagnosticSubject(c) {
  return {
    id: `db_${c.id}`,
    curriculumId: c.id,
    name: c.name,
    yearGroups: curriculumToYearGroups(c.level_label),
    topics: c.topicNames ?? [],
    isWriting: false,
    fromDb: true,
  }
}
