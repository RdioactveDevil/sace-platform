import { test } from 'node:test'
import assert from 'node:assert/strict'
import { infinityPath } from './infinityPath.js'

const coords = (d) => [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])])

test('the ∞ is one closed path that starts and ends at its crossing', () => {
  const d = infinityPath(64)
  const pts = coords(d)
  assert.equal(pts.length, 65)
  assert.ok(d.startsWith('M50.00 25.00') && d.endsWith('Z'))
  assert.deepEqual(pts[0], pts[pts.length - 1])
})

test('it fits its 100 × 50 box with room for the stroke, two loops either side of the middle', () => {
  const pts = coords(infinityPath())
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  assert.ok(Math.min(...xs) >= 5 && Math.max(...xs) <= 95)
  assert.ok(Math.min(...ys) >= 5 && Math.max(...ys) <= 45)
  assert.ok(pts.some(([x]) => x < 20) && pts.some(([x]) => x > 80))
})
