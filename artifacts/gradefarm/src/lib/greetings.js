// The Learn screen's heading: a different one each time it opens, picked at
// random from the lines below. Some use the student's first name, the time of
// day (Adelaide) or the subject; a line whose details are missing isn't used.

const ASK = [
  () => 'What are you stuck on?',
  ({ name }) => name && `What should we figure out, ${name}?`,
  ({ name, partOfDay }) => name && partOfDay && `Good ${partOfDay}, ${name}`,
  ({ name }) => name && `Ready when you are, ${name}.`,
  ({ subject }) => subject && `What's on your mind in ${subject}?`,
  () => 'Got a question? Fire away.',
  () => 'Which question is bugging you?',
  () => "Let's untangle something.",
  ({ lateNight }) => lateNight && 'Late night study session? Let’s make it quick.',
  ({ weekend }) => weekend && 'Weekend study. Let’s make it count.',
]

const LESSON = [
  () => 'What should we learn today?',
  ({ name }) => name && `Pick a topic, ${name}. Ten minutes is all it takes.`,
  () => 'What do you want to get better at?',
  ({ subject }) => subject && `Let's learn something new in ${subject}.`,
  () => 'Which topic should we master next?',
  ({ name, partOfDay }) => name && partOfDay && `Good ${partOfDay}, ${name}. What shall we learn?`,
]

/** Hour (0–23) and weekday (0 = Sunday) in Adelaide. */
function adelaideNow(now) {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Adelaide', hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(now)
  const hour = Number(parts.find(p => p.type === 'hour')?.value)
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find(p => p.type === 'weekday')?.value)
  return { hour: Number.isFinite(hour) ? hour : 12, day }
}

/**
 * A subject's name short enough for a heading: "VCE Mathematical Methods
 * Units 1 and 2" → "Mathematical Methods", "SACE Stage 2 Chemistry" →
 * "Chemistry". null when it's still long, so lines that use it are skipped.
 */
export function shortSubjectName(name) {
  const short = String(name || '')
    .replace(/^\s*(VCE|SACE|HSC|QCE|WACE|NCEA|IB|NAPLAN)\b\s*/i, '')
    .replace(/^\s*(Stage|Year)\s*\d+\s*/i, '')
    .replace(/\s*[,(–-]?\s*(Units?\s*\d.*|Stage\s*\d.*|Year\s*\d.*|\(.*\))\s*$/i, '')
    .trim()
  return short && short.length <= 22 ? short : null
}

/** The details the lines can use. */
export function greetingContext({ displayName, subjectName, now = new Date() } = {}) {
  const name = String(displayName || '').trim().split(/\s+/)[0] || null
  const { hour, day } = adelaideNow(now)
  const partOfDay = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 22 ? 'evening' : null
  return {
    name,
    subject: shortSubjectName(subjectName),
    partOfDay,
    lateNight: hour >= 22 || hour < 4,
    weekend: day === 0 || day === 6,
  }
}

/** Every heading that fits, for `mode` 'ask' or 'lesson'. */
export function greetingOptions(mode, ctx) {
  return (mode === 'lesson' ? LESSON : ASK).map(line => line(ctx)).filter(Boolean)
}

/** One heading at random. */
export function pickGreeting(mode, ctx, rand = Math.random) {
  const options = greetingOptions(mode, ctx)
  return options[Math.floor(rand() * options.length) % options.length] || (mode === 'lesson' ? 'What should we learn today?' : 'What are you stuck on?')
}
