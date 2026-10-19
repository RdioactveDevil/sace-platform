import { THEMES } from '../lib/theme'

// A short first line with no closing punctuation (a "?" is fine) is a section heading
// ("Facing New Challenges\nIronically, the vault..."), which would otherwise
// run into the paragraph text.
function splitHeading(para) {
  const lines = para.split('\n')
  const first = lines[0].trim()
  const isHeading = first.length > 0 && first.length <= 70 && !/[.!,;:"'”’)…-]$/.test(first)
  if (!isHeading) return { heading: null, text: para }
  // Some passages wrap headings in Markdown bold.
  return { heading: first.replace(/^\*\*(.+)\*\*$/, '$1'), text: lines.slice(1).join('\n').trim() }
}

/**
 * The reading passage (or poem) a comprehension question refers to. Shown
 * above the question, or beside it (`fill`) when there is room; scrolls on its
 * own so long passages don't push the answer options off screen.
 */
export default function PassageView({ passage, theme = 'dark', fill = false }) {
  if (!passage?.body) return null
  const t = THEMES[theme]
  const isPoem = passage.kind === 'poem'
  const paragraphs = String(passage.body).split(/\n\s*\n/)
  return (
    <div style={{
      marginBottom: fill ? 0 : 20, borderRadius: fill ? 20 : 12, border: `1px solid ${t.border}`,
      background: fill ? t.bgCard : t.bg, padding: fill ? '24px 28px' : '16px 18px',
      maxHeight: fill ? 'calc(100vh - 200px)' : '55vh', overflowY: 'auto',
      boxShadow: fill ? t.shadowCard : undefined,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        {isPoem ? 'Read the poem' : 'Read the passage'}
      </div>
      {passage.title && (
        <div style={{ fontSize: fill ? 18 : 16, fontWeight: 800, color: t.text, marginBottom: 10 }}>{passage.title}</div>
      )}
      {paragraphs.map((para, i) => {
        const { heading, text } = isPoem ? { heading: null, text: para } : splitHeading(para)
        return (
          <div key={i}>
            {heading && (
              <div style={{ fontSize: 15, fontWeight: 800, color: t.text, margin: i ? '18px 0 6px' : '0 0 6px' }}>{heading}</div>
            )}
            {text && (
              <p style={{
                margin: '0 0 12px', fontSize: 15, lineHeight: 1.75, color: t.text,
                whiteSpace: isPoem ? 'pre-line' : 'normal',
                fontStyle: isPoem ? 'italic' : 'normal',
              }}>
                {text}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
