import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Renders a string that may contain inline LaTeX math ($...$) or display
 * math ($$...$$). Everything outside delimiters is plain text.
 *
 * Examples that will render with KaTeX:
 *   "Calculate $K_{eq} = \frac{[C]}{[A][B]^2}$ for the reaction."
 *   "$$\Delta G = \Delta H - T\Delta S$$"
 *
 * Existing questions that use Unicode (N₂, ⇌, →) render as-is — no change.
 */
export default function MathText({ text = '', style = {} }) {
  if (!text || typeof text !== 'string') return null
  if (!text.includes('$')) return <span style={style}>{text}</span>

  // Split on $$...$$ first (display), then $...$ (inline)
  const parts = []
  let remaining = text
  const pattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g
  let lastIndex = 0
  let match

  pattern.lastIndex = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    const raw = match[0]
    const isDisplay = raw.startsWith('$$')
    const latex = isDisplay ? raw.slice(2, -2) : raw.slice(1, -1)
    parts.push({ type: 'math', content: latex, display: isDisplay })
    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return (
    <span style={style}>
      {parts.map((part, i) => {
        if (part.type === 'text') return <span key={i}>{part.content}</span>
        try {
          const html = katex.renderToString(part.content, {
            throwOnError: false,
            displayMode: part.display,
            strict: false,
          })
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: html }}
              style={part.display ? { display: 'block', textAlign: 'center', margin: '8px 0' } : {}}
            />
          )
        } catch {
          // Fallback: render raw delimiters if KaTeX fails
          return <span key={i}>{part.display ? `$$${part.content}$$` : `$${part.content}$`}</span>
        }
      })}
    </span>
  )
}
