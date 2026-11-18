// The ∞ the loading indicator draws (components/InfinityLoader.jsx): a
// lemniscate of Bernoulli, x = cos t / (1 + sin²t), y = sin t cos t / (1 + sin²t),
// stretched a little taller so it reads at small sizes, as one closed SVG path
// in a 100 × 50 box with room for the stroke.

export const INFINITY_VIEWBOX = '0 0 100 50'

/** The ∞ as an SVG path: `points` straight segments, starting and ending at the crossing. */
export function infinityPath(points = 96) {
  const pt = (t) => {
    const s = Math.sin(t), c = Math.cos(t), d = 1 + s * s
    return [50 + 42 * (c / d), 25 + 42 * 1.25 * ((s * c) / d)]
  }
  // Start at the crossing (t = π/2) so the moving stroke never starts with a seam on a loop.
  const out = []
  for (let i = 0; i <= points; i++) {
    const [x, y] = pt(Math.PI / 2 + (2 * Math.PI * i) / points)
    out.push(`${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return `${out.join(' ')}Z`
}
