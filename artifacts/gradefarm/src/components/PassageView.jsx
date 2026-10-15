import { THEMES } from '../lib/theme'

/**
 * The reading passage (or poem) a comprehension question refers to. Shown
 * above the question; scrolls on its own so long passages don't push the
 * answer options off screen.
 */
export default function PassageView({ passage, theme = 'dark' }) {
  if (!passage?.body) return null
  const t = THEMES[theme]
  const isPoem = passage.kind === 'poem'
  const paragraphs = String(passage.body).split(/\n\s*\n/)
  return (
    <div style={{
      marginBottom: 20, borderRadius: 12, border: `1px solid ${t.border}`,
      background: t.bg, padding: '16px 18px', maxHeight: '55vh', overflowY: 'auto',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        {isPoem ? 'Read the poem' : 'Read the passage'}
      </div>
      {passage.title && (
        <div style={{ fontSize: 16, fontWeight: 800, color: t.text, marginBottom: 10 }}>{passage.title}</div>
      )}
      {paragraphs.map((para, i) => (
        <p key={i} style={{
          margin: '0 0 12px', fontSize: 15, lineHeight: 1.75, color: t.text,
          whiteSpace: isPoem ? 'pre-line' : 'normal',
          fontStyle: isPoem ? 'italic' : 'normal',
        }}>
          {para}
        </p>
      ))}
    </div>
  )
}
