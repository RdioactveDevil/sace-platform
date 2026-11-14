// "Explain with": how Titan pitches its explanations. Plain (null), one of the
// built-in styles, or a custom analogy the student types ("cooking",
// "Minecraft", "netball"). The value is kept as `interests` on the chat.

export const ANALOGY_STYLES = [
  { id: 'sport',  label: 'sport' },
  { id: 'gaming', label: 'gaming' },
  { id: 'music',  label: 'music' },
]

const GUIDES = {
  sport:  'Use sport analogies — AFL, cricket, soccer, basketball — fitted to the idea at hand (e.g. a ratio as a win–loss record, equilibrium as a tied game).',
  gaming: 'Use gaming analogies — quests, characters, health points, levelling up — fitted to the idea at hand.',
  music:  'Use music analogies — songs, instruments, rhythm, volume — fitted to the idea at hand (e.g. fractions as beats in a bar).',
}

export const MAX_ANALOGY_LENGTH = 40

/**
 * A custom analogy as the student typed it, made safe to put in Titan's
 * instructions: one line of letters, numbers, spaces and a little
 * punctuation, at most MAX_ANALOGY_LENGTH characters. '' when nothing is left.
 */
export function cleanAnalogy(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} '’&,.+-]/gu, '')
    .trim()
    .slice(0, MAX_ANALOGY_LENGTH)
    .trim()
}

/** Whether `interests` is a custom analogy (not plain and not a built-in style). */
export function isCustomAnalogy(interests) {
  return !!interests && !GUIDES[interests]
}

/** The teaching-style line for Titan's chat instructions. */
export function analogyInstruction(interests) {
  if (!interests) return 'Explain concepts in plain, direct language. Use clear real-world scenarios and concrete examples, but avoid analogies and thematic metaphors entirely.'
  if (GUIDES[interests]) return GUIDES[interests]
  const custom = cleanAnalogy(interests)
  if (!custom) return analogyInstruction(null)
  return `The student asked for analogies from: ${custom}. Use ideas from that, fitted to the concept at hand, where they genuinely make it clearer. Keep the subject content accurate, and drop an analogy rather than stretch it.`
}

/** The style line for a guided lesson's instructions. */
export function lessonAnalogyLine(interests) {
  if (!interests) return 'Use plain, direct language with concrete examples; no analogies.'
  const custom = GUIDES[interests] ? interests : cleanAnalogy(interests)
  return custom ? `Use ${custom} analogies where they genuinely help.` : 'Use plain, direct language with concrete examples; no analogies.'
}

/** How the "Explain it …" control reads: "simply", "with sport", "with cooking". */
export function analogyLabel(interests) {
  if (!interests) return 'simply'
  return `with ${GUIDES[interests] ? interests : cleanAnalogy(interests) || 'an analogy'}`
}
