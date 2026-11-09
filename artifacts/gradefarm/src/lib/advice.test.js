import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutNotes, mergeLineRects, noteSize, handPath } from './advice.js'

test('notes go above their target when there is room', () => {
  const [p] = layoutNotes([{ x: 40, y: 60, w: 100, h: 20, nw: 120, nh: 24 }], 600)
  assert.deepEqual(p, { x: 30, y: 34, above: true, fits: true })
})

test('a second note near the first never overlaps it, and stays close to its target', () => {
  const [a, b] = layoutNotes([
    { x: 0, y: 60, w: 100, h: 20, nw: 200, nh: 24 },
    { x: 140, y: 60, w: 60, h: 20, nw: 120, nh: 24 },
  ], 600)
  assert.deepEqual(a, { x: 0, y: 34, above: true, fits: true })
  const clear = b.x >= a.x + 200 || b.y >= a.y + 24
  assert.ok(clear, `second note at ${b.x},${b.y}`)
  assert.ok(Math.abs(b.x + 60 - 170) <= 60, `second note far from its target: ${b.x}`)
})

test('a note with no room above goes below', () => {
  const [p] = layoutNotes([{ x: 10, y: 4, w: 80, h: 20, nw: 100, nh: 24 }], 600)
  assert.equal(p.above, false)
  assert.equal(p.y, 32)
})

test('notes stay inside the width', () => {
  const [p] = layoutNotes([{ x: 560, y: 80, w: 30, h: 20, nw: 150, nh: 24 }], 600)
  assert.equal(p.x, 450)
})

test('notes keep off every line of the question, and say when there is no clear spot', () => {
  // Lines 40px apart: a 24px note fits in the gap above its line, a 44px (wrapped) one doesn't.
  const lines = [{ x: 0, y: 0, w: 600, h: 20 }, { x: 0, y: 40, w: 600, h: 20 }, { x: 0, y: 80, w: 600, h: 20 }]
  const [small] = layoutNotes([{ x: 100, y: 40, w: 100, h: 20, nw: 120, nh: 16 }], 600, lines)
  assert.equal(small.fits, true)
  assert.ok(small.y >= 20 && small.y + 16 <= 44, `small note at y ${small.y}`)
  const [big] = layoutNotes([{ x: 100, y: 40, w: 100, h: 20, nw: 120, nh: 44 }], 600, lines)
  assert.equal(big.fits, false)
})

test('line rectangles merge per line', () => {
  const lines = mergeLineRects([
    { left: 0, right: 50, top: 10, bottom: 30, width: 50, height: 20 },
    { left: 50, right: 90, top: 11, bottom: 30, width: 40, height: 19 },
    { left: 0, right: 30, top: 60, bottom: 80, width: 30, height: 20 },
  ])
  assert.deepEqual(lines, [{ left: 0, top: 10, width: 90, height: 20 }, { left: 0, top: 60, width: 30, height: 20 }])
})

test('helpers are deterministic', () => {
  assert.equal(handPath('circle', 3), handPath('circle', 3))
  assert.notEqual(handPath('circle', 3), handPath('circle', 4))
  assert.ok(noteSize('= 0.0500 L').w > 40)
})
