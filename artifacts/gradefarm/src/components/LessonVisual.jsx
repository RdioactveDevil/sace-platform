// A table, graph or diagram on a guided-lesson card (see lib/lessonVisuals.js),
// drawn with the question bank's renderers. Saved lessons come from the
// student's own row, so the spec is checked again here, and a figure that
// still fails to draw is left out rather than breaking the card.

import { Component } from 'react'
import { THEMES } from '../lib/theme'
import { cleanVisual } from '../lib/lessonVisuals'
import TableView from './TableView'
import GraphView from './GraphView'
import DiagramView from './DiagramView'
import MathText from './MathText'

class SkipOnError extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}

// Table headers are small upper-case labels in TableView; maths in them keeps its case and size.
const cell = (v) => <span style={{ textTransform: 'none', fontSize: 13 }}><MathText text={String(v)} /></span>

export default function LessonVisual({ visual, theme = 'dark' }) {
  const v = cleanVisual(visual)
  if (!v) return null
  const t = THEMES[theme] || THEMES.dark
  // Table and graph captions go underneath here, so maths in them is typeset.
  const caption = v.caption && <div style={{ marginTop: -10, marginBottom: 18, fontSize: 12, color: t.textMuted, textAlign: 'center', maxWidth: v.type === 'graph' ? 520 : undefined }}><MathText text={v.caption} /></div>
  let body
  if (v.type === 'table') {
    const { caption: _c, ...table } = v
    body = <><TableView table={table} theme={theme} renderCell={cell} />{caption}</>
  } else if (v.type === 'graph') {
    body = <><GraphView graph={v} theme={theme} />{caption}</>
  } else {
    const { caption, ...figure } = v
    body = <DiagramView diagram={{ figure, ...(caption && { caption }) }} theme={theme} />
  }
  return (
    <SkipOnError>
      {/* The renderers leave 18px below themselves; the card's own spacing is used instead. */}
      <div style={{ display: 'flow-root', marginBottom: -18 }}>{body}</div>
    </SkipOnError>
  )
}
