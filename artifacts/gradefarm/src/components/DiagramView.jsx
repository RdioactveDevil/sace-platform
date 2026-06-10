// Renders an AI-authored vector diagram attached to a question.
//
// The SVG is rendered as a sandboxed `data:` image (an <img> data-URI cannot
// execute scripts, fetch external resources, or touch the DOM), and we strip
// the obvious script vectors defensively before encoding. diagram shape:
//   { svg: "<svg ...>...</svg>", caption?: "..." }   (or a raw SVG string)

function sanitizeSvg(svg) {
  return String(svg)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '')
}

export default function DiagramView({ diagram, theme }) {
  const raw = typeof diagram === 'string' ? diagram : diagram?.svg
  if (!raw || !/<svg[\s>]/i.test(raw)) return null

  const caption = typeof diagram === 'object' ? diagram?.caption : null
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(sanitizeSvg(raw))}`
  const isDark = theme === 'dark'

  return (
    <div style={{
      margin: '0 0 18px',
      borderRadius: 12,
      overflow: 'hidden',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`,
      background: isDark ? '#0f1430' : '#f8fafc',
      padding: 12,
    }}>
      <img src={uri} alt={caption || 'Question diagram'} style={{ display: 'block', width: '100%', maxHeight: 340, objectFit: 'contain' }} />
      {caption && (
        <div style={{ marginTop: 8, fontSize: 12, color: isDark ? 'rgba(255,255,255,0.45)' : '#64748b', textAlign: 'center' }}>{caption}</div>
      )}
    </div>
  )
}
