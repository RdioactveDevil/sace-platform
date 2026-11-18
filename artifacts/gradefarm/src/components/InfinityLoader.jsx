import { INFINITY_VIEWBOX, infinityPath } from '../lib/infinityPath'

const PATH = infinityPath()
const GOLD = '#f1be43'

// One copy of the animation, however many loaders are on screen. With reduced
// motion the stroke doesn't travel: the whole ∞ shows and gently pulses.
const CSS = `
@keyframes gf-inf-run { to { stroke-dashoffset: -100; } }
@keyframes gf-inf-pulse { 50% { opacity: 0.45; } }
.gf-inf-run { animation: gf-inf-run 1.5s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .gf-inf-run { animation: gf-inf-pulse 2s ease-in-out infinite; stroke-dasharray: none; }
}
`

/**
 * The app's loading indicator: an ∞ with a stroke running round it.
 * size: its width in px (it's half as tall). color: the moving stroke.
 * track: the faint ∞ underneath (defaults to the colour, faded).
 * label: what's loading, for screen readers; omit it (or pass null) when the
 * words beside it already say, so it isn't read twice.
 */
export default function InfinityLoader({ size = 44, color = GOLD, track = null, label = 'Loading', style }) {
  const stroke = 7
  return (
    <svg
      viewBox={INFINITY_VIEWBOX}
      width={size}
      height={size / 2}
      {...(label ? { role: 'status', 'aria-label': label } : { 'aria-hidden': true })}
      style={{ display: 'block', overflow: 'visible', ...style }}
    >
      <style>{CSS}</style>
      <path d={PATH} fill="none" stroke={track || color} strokeOpacity={track ? 1 : 0.18} strokeWidth={stroke} strokeLinejoin="round" />
      <path className="gf-inf-run" d={PATH} pathLength="100" fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray="30 70" />
    </svg>
  )
}
