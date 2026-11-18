import MathText from './MathText'
import { THEMES } from '../lib/theme'

/**
 * The information a question shares with others in its set (lib/questionSets.js),
 * shown above the question when it is asked on its own (practice, the exam
 * simulator). Nothing for a question not in a set.
 */
export default function SharedInfoBox({ q, theme = 'dark' }) {
  if (!q?.shared_info && !q?.shared_image_url) return null
  const t = THEMES[theme] || THEMES.dark
  return (
    <div role="note" aria-label="Information for this question" style={{
      borderLeft: `3px solid ${t.accent}`, background: t.bgSubtle, borderRadius: 10, padding: '12px 14px', marginBottom: 16,
      color: t.text, fontSize: 15, lineHeight: 1.65,
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: t.textMuted, marginBottom: 6 }}>Use this information</div>
      {q.shared_info && <MathText text={q.shared_info} />}
      {q.shared_image_url && (
        <img src={q.shared_image_url} alt="Figure for this information" style={{ display: 'block', width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 8, marginTop: q.shared_info ? 10 : 0, background: '#fff' }} />
      )}
    </div>
  )
}
