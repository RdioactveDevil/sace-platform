// Renders a structured table embedded in a question.
// table_data schema: { headers: string[], rows: (string|number)[][], caption?: string }

export default function TableView({ table, theme }) {
  const { headers = [], rows = [], caption } = table || {}
  if (!headers.length && !rows.length) return null

  const isDark = theme === 'dark'
  const borderColor  = isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'
  const headerBg     = isDark ? 'rgba(255,255,255,0.07)' : '#f1f5f9'
  const headerColor  = isDark ? '#94a3b8' : '#475569'
  const cellColor    = isDark ? 'rgba(255,255,255,0.85)' : '#1e293b'
  const rowAltBg     = isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'
  const captionColor = isDark ? 'rgba(255,255,255,0.35)' : '#94a3b8'
  const wrapBg       = isDark ? '#1e293b' : '#f8fafc'
  const wrapBorder   = isDark ? '#334155' : '#e2e8f0'

  return (
    <div style={{ margin: '0 0 18px', borderRadius: 10, overflow: 'hidden', border: `1px solid ${wrapBorder}`, background: wrapBg }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
          {headers.length > 0 && (
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: '9px 14px',
                      background: headerBg,
                      color: headerColor,
                      fontWeight: 700,
                      textAlign: 'center',
                      borderBottom: `1px solid ${borderColor}`,
                      borderRight: i < headers.length - 1 ? `1px solid ${borderColor}` : 'none',
                      whiteSpace: 'nowrap',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 1 ? rowAltBg : 'transparent' }}>
                {(Array.isArray(row) ? row : [row]).map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: '8px 14px',
                      color: cellColor,
                      textAlign: 'center',
                      borderBottom: ri < rows.length - 1 ? `1px solid ${borderColor}` : 'none',
                      borderRight: ci < (Array.isArray(row) ? row.length : 1) - 1 ? `1px solid ${borderColor}` : 'none',
                    }}
                  >
                    {cell ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption && (
        <div style={{ padding: '6px 14px 8px', color: captionColor, fontSize: 11, fontStyle: 'italic', textAlign: 'center' }}>
          {caption}
        </div>
      )}
    </div>
  )
}
