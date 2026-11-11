import { useState } from 'react'
import { THEMES } from '../../lib/theme'

const N = 12
export const FLOOD_MOVES = 22
// Colours that differ in lightness as well as hue, each with a mark so they
// can be told apart without colour.
const SWATCHES = [
  { color: '#e2b54c', mark: '●', name: 'Gold' },
  { color: '#5bb98c', mark: '▲', name: 'Green' },
  { color: '#7fa7d9', mark: '■', name: 'Blue' },
  { color: '#e5736f', mark: '◆', name: 'Red' },
  { color: '#a89ad9', mark: '★', name: 'Purple' },
]

const newBoard = () => Array.from({ length: N * N }, () => Math.floor(Math.random() * SWATCHES.length))

/** Fill the region joined to the top-left cell with `colour`. Returns a new grid. */
export function flood(grid, colour) {
  const from = grid[0]
  if (from === colour) return grid
  const next = grid.slice()
  const stack = [0]
  const seen = new Set([0])
  while (stack.length) {
    const i = stack.pop()
    next[i] = colour
    const x = i % N
    const y = Math.floor(i / N)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue
      const j = ny * N + nx
      if (!seen.has(j) && grid[j] === from) { seen.add(j); stack.push(j) }
    }
  }
  return next
}

/**
 * Colour Flood: change the colour of the top-left patch to swallow its
 * neighbours, and fill the whole board in FLOOD_MOVES moves or fewer. Reports
 * the moves used on a win (lower is better).
 */
export default function ColourFlood({ theme = 'dark', onResult }) {
  const t = THEMES[theme]
  const [grid, setGrid] = useState(newBoard)
  const [moves, setMoves] = useState(0)
  const won = grid.every(v => v === grid[0])
  const lost = !won && moves >= FLOOD_MOVES

  const pick = (colour) => {
    if (won || lost || colour === grid[0]) return
    const next = flood(grid, colour)
    const m = moves + 1
    setGrid(next)
    setMoves(m)
    if (next.every(v => v === next[0])) onResult?.(m)
  }
  const again = () => {
    setMoves(0)
    setGrid(newBoard())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%' }}>
      <p style={{ margin: 0, fontSize: 14, color: t.textSub, textAlign: 'center' }}>Pick colours to grow the top-left patch. Fill the board in {FLOOD_MOVES} moves.</p>
      <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))`, width: 'min(360px, 100%)', aspectRatio: '1', borderRadius: 12, overflow: 'hidden' }}>
        {grid.map((v, i) => <div key={i} style={{ background: SWATCHES[v].color }} />)}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: won ? t.success : lost ? t.danger : t.text }}>
        {won ? `Filled in ${moves} moves!` : lost ? 'Out of moves.' : `${moves} / ${FLOOD_MOVES} moves`}
      </div>
      {won || lost ? (
        <button type="button" onClick={again} style={{ minHeight: 44, padding: '0 20px', borderRadius: 10, border: `1px solid ${t.borderMid}`, background: 'transparent', color: t.text, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>New board</button>
      ) : (
        <div role="group" aria-label="Colours" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {SWATCHES.map((s, i) => (
            <button key={s.name} type="button" onClick={() => pick(i)} aria-label={s.name} disabled={i === grid[0]}
              style={{ width: 52, height: 52, borderRadius: 12, border: `2px solid ${i === grid[0] ? t.text : 'transparent'}`, background: s.color, color: '#18181b', fontSize: 20, cursor: i === grid[0] ? 'default' : 'pointer', opacity: i === grid[0] ? 0.55 : 1 }}>
              {s.mark}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export const COLOUR_FLOOD = {
  id: 'colour-flood',
  name: 'Colour Flood',
  blurb: 'Grow one patch of colour until it fills the whole board.',
  lowerIsBetter: true,
  format: (v) => `${v} moves`,
  Component: ColourFlood,
}
