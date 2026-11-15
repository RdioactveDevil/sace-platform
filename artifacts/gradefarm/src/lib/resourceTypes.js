// What a reference file is (Admin → a subject → Textbooks & resources).

/** A best guess at what a file is from its name; the admin can change it. */
export function guessResourceType(name, fallback = 'textbook') {
  const n = String(name || '').toLowerCase()
  if (/practice|trial|sample|quiz|\btest/.test(n)) return 'practice_test'
  if (/exam|paper|\b(19|20)\d{2}\b/.test(n)) return 'exam'
  if (/assessment|\bsat\b|\btask\b|\bsac\b/.test(n)) return 'assessment'
  if (/notes?\b|summary|cheat/.test(n)) return 'notes'
  if (/textbook|chapter|\bch\d|book/.test(n)) return 'textbook'
  return fallback
}
