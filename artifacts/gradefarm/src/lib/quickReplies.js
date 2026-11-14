// Quick replies under Titan's latest message: 2–3 short things the student
// might say next, written by Titan for that reply. Titan adds them as a last
// line, [[replies: A | B | C]], which is taken out of the message before it
// is shown or saved; the chat shows them as tap-to-send chips.

/** The rule added to Titan's instructions. */
export const QUICK_REPLIES_RULE = `QUICK REPLIES:
- After your reply, add one final line exactly like: [[replies: First | Second | Third]]
- Give 2–3 short things the student might say next, in the student's own voice, each at most 6 words, fitting what you just said (e.g. after a question: "I'm not sure", "Give me a hint"; after an explanation: "Another example", "Why does that work?").
- Never put the answer to your own question in a reply. No maths notation or markdown in them.
- This line is hidden from the student and shown as buttons, so don't refer to it.`

const LINE = /\n?\s*\[\[\s*replies\s*:([^\]]*)\]\]\s*$/i
export const MAX_REPLIES = 3
export const MAX_REPLY_LENGTH = 40

/** One suggested reply made safe and short; '' when nothing usable is left. */
export function cleanReply(text) {
  const t = String(text ?? '')
    .replace(/[$*_`#<>[\]{}\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > MAX_REPLY_LENGTH ? '' : t
}

/**
 * Split Titan's reply into what to show and the quick replies.
 * → { text, replies } (replies is [] when there's no line or nothing usable).
 */
export function splitQuickReplies(reply) {
  const raw = typeof reply === 'string' ? reply : ''
  const m = raw.match(LINE)
  if (!m) return { text: raw, replies: [] }
  const seen = new Set()
  const replies = m[1].split('|').map(cleanReply).filter(r => {
    const k = r.toLowerCase()
    if (!r || seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, MAX_REPLIES)
  return { text: raw.slice(0, m.index).trimEnd(), replies }
}
