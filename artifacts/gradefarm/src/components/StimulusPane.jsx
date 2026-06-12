// Renders GAMSAT-style stimulus material: a labelled passage plus any
// combination of figures (graphs, tables, images). Designed to sit in the
// left pane of the split-screen exam layout — independently scrollable.

import { THEMES } from '../lib/theme'
import GraphView from './GraphView'
import TableView from './TableView'
import DiagramView from './DiagramView'
import MathText from './MathText'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_M = "'JetBrains Mono', monospace"

export default function StimulusPane({ stimulus, theme = 'dark' }) {
  const t = THEMES[theme]
  if (!stimulus) return null

  const { title, text, graph, table_data, diagram, image_url, figures = [] } = stimulus

  // Normalise: allow either a `figures` array or top-level graph/table_data fields.
  const allFigures = figures.length > 0
    ? figures
    : [
        graph      && { type: 'graph',    data: graph,      caption: graph.caption },
        table_data && { type: 'table',    data: table_data, caption: table_data.caption },
        diagram    && { type: 'diagram',  data: diagram },
        image_url  && { type: 'image',    data: image_url },
      ].filter(Boolean)

  return (
    <div style={{ fontFamily: FONT_B, height: '100%' }}>
      {title && (
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: t.textFaint, marginBottom: 14,
        }}>
          {title}
        </div>
      )}

      {text && (
        <div style={{
          fontSize: 14, color: t.text, lineHeight: 1.85,
          marginBottom: allFigures.length ? 22 : 0,
          whiteSpace: 'pre-wrap',
          fontFamily: "'Georgia', serif",
        }}>
          <MathText text={text} />
        </div>
      )}

      {allFigures.map((fig, i) => (
        <div key={i} style={{ marginBottom: 18 }}>
          {fig.type === 'graph' && (
            <>
              <GraphView graph={fig.data} theme={theme} />
              {fig.caption && (
                <FigCaption t={t}>{fig.caption}</FigCaption>
              )}
            </>
          )}
          {fig.type === 'table' && (
            <TableView table={fig.data} theme={theme} />
          )}
          {fig.type === 'diagram' && (
            <>
              <DiagramView diagram={fig.data} theme={theme} />
              {fig.caption && <FigCaption t={t}>{fig.caption}</FigCaption>}
            </>
          )}
          {fig.type === 'image' && (
            <>
              <img
                src={fig.data}
                alt={fig.caption || 'Figure'}
                style={{ width: '100%', borderRadius: 10, display: 'block', marginBottom: fig.caption ? 6 : 0 }}
              />
              {fig.caption && <FigCaption t={t}>{fig.caption}</FigCaption>}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function FigCaption({ t, children }) {
  return (
    <div style={{
      fontSize: 11, color: t.textFaint, fontStyle: 'italic', lineHeight: 1.5,
      marginTop: 4, paddingTop: 4, borderTop: `1px solid ${t.border}`,
      fontFamily: "'Georgia', serif",
    }}>
      {children}
    </div>
  )
}
