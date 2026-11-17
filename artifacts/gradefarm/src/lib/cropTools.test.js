import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampBox, tightenBox, CROP_SCALE } from './cropTools.js'

/** A white W×H greyscale page with black rectangles [x, y, w, h]. */
function page(W, H, rects) {
  const g = new Uint8Array(W * H).fill(255)
  for (const [x, y, w, h] of rects) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j * W + i] = 0
  return g
}

test('crops are made at the ingest\'s 3 pixels per point', () => {
  assert.equal(CROP_SCALE, 3)
})

test('a box is kept on the page and in whole pixels', () => {
  assert.deepEqual(clampBox({ left: -10.4, top: 5.6, width: 50, height: 2000 }, 100, 200), { left: 0, top: 6, width: 40, height: 194 })
  assert.deepEqual(clampBox({ left: 120, top: 10, width: 30, height: 30 }, 100, 200), { left: 100, top: 10, width: 0, height: 30 })
  // Dragged up and left: a negative size is the same box the other way round.
  assert.deepEqual(clampBox({ left: 60, top: 60, width: -20, height: -30 }, 100, 200), { left: 40, top: 30, width: 20, height: 30 })
})

test('tighten trims to the drawing and leaves a white margin of up to 9 px', () => {
  const W = 200, H = 200
  const g = page(W, H, [[60, 70, 50, 40]])
  // A loose box around the drawing: the margin is the ingest's 3 pt = 9 px.
  assert.deepEqual(tightenBox(g, W, H, { left: 20, top: 20, width: 160, height: 160 }), { left: 51, top: 61, width: 68, height: 58 })
  // Close to the box edge: the margin stops at the box the admin drew.
  assert.deepEqual(tightenBox(g, W, H, { left: 56, top: 66, width: 58, height: 48 }), { left: 56, top: 66, width: 58, height: 48 })
})

test('tighten never cuts ink and only grows into white', () => {
  const W = 200, H = 200
  // The drawing, and a line of text 4 px below it inside the box.
  const g = page(W, H, [[60, 70, 50, 40], [60, 114, 80, 3]])
  const box = tightenBox(g, W, H, { left: 20, top: 20, width: 160, height: 160 })
  // Both are ink inside the box, so both stay; the margin below the text is white.
  assert.equal(box.top, 61)
  assert.equal(box.top + box.height, 117 + 9)
  // Ink that touches the box edge stays touching it: nothing inside is cut.
  const edge = tightenBox(page(W, H, [[20, 50, 100, 30]]), W, H, { left: 20, top: 20, width: 160, height: 160 })
  assert.equal(edge.left, 20)
})

test('a stray speck is not a drawing, and an empty box is left as it is', () => {
  const W = 100, H = 100
  const box = { left: 10, top: 10, width: 80, height: 80 }
  assert.deepEqual(tightenBox(page(W, H, [[50, 50, 1, 1]]), W, H, box), box)
  assert.deepEqual(tightenBox(page(W, H, []), W, H, box), box)
})
