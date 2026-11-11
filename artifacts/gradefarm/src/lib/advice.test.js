import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutNotes, mergeLineRects, noteSize, handPath, NOTE_GAP, MAX_REACH } from './advice.js'

test('notes go above their target when there is room', () => {
  const [p] = layoutNotes([{ x: 40, y: 60, w: 100, h: 20, nw: 120, nh: 24 }], 600)
  assert.deepEqual(p, { x: 30, y: 60 - 24 - NOTE_GAP - 1, above: true, fits: true })
})

test('a second note near the first never overlaps it, and stays close to its target', () => {
  const [a, b] = layoutNotes([
    { x: 0, y: 60, w: 100, h: 20, nw: 200, nh: 24 },
    { x: 140, y: 60, w: 60, h: 20, nw: 120, nh: 24 },
  ], 600)
  assert.deepEqual(a, { x: 0, y: 60 - 24 - NOTE_GAP - 1, above: true, fits: true })
  const clear = b.x >= a.x + 200 || b.y >= a.y + 24
  assert.ok(clear, `second note at ${b.x},${b.y}`)
  assert.ok(Math.abs(b.x + 60 - 170) <= 60, `second note far from its target: ${b.x}`)
})

test('a note with no room above goes below', () => {
  const [p] = layoutNotes([{ x: 10, y: 4, w: 80, h: 20, nw: 100, nh: 24 }], 600)
  assert.equal(p.above, false)
  assert.equal(p.y, 24 + NOTE_GAP + 1)
})

test('notes stay inside the width', () => {
  const [p] = layoutNotes([{ x: 560, y: 80, w: 30, h: 20, nw: 150, nh: 24 }], 600)
  assert.equal(p.x, 450)
})

test('notes keep off every line of the question, and say when there is no clear spot', () => {
  // Lines 50px apart (a 30px gap): a 16px note fits in the gap above its line, a 44px (wrapped) one doesn't.
  const lines = [{ x: 0, y: 0, w: 600, h: 20 }, { x: 0, y: 50, w: 600, h: 20 }, { x: 0, y: 100, w: 600, h: 20 }]
  const [small] = layoutNotes([{ x: 100, y: 50, w: 100, h: 20, nw: 120, nh: 16 }], 600, lines)
  assert.equal(small.fits, true)
  assert.ok(small.y >= 20 + NOTE_GAP && small.y + 16 <= 50 - NOTE_GAP, `small note at y ${small.y}`)
  const [big] = layoutNotes([{ x: 100, y: 50, w: 100, h: 20, nw: 120, nh: 44 }], 600, lines)
  assert.equal(big.fits, false)
})

test('a note never touches the next line, even by a pixel', () => {
  // A 23px gap and a 22px note: the old layout let it sit on the line below.
  const lines = [{ x: 0, y: 0, w: 600, h: 24 }, { x: 0, y: 47, w: 600, h: 24 }, { x: 0, y: 94, w: 120, h: 24 }]
  const placed = layoutNotes([{ x: 0, y: 47, w: 60, h: 24, nw: 200, nh: 22 }], 600, lines)
  assert.equal(placed[0].fits, false)
})

test('a note too far from its words is listed instead of drawn with a long arrow', () => {
  // The only free room is at the far end of the line.
  const lines = [{ x: 0, y: 0, w: 600, h: 20 }, { x: 0, y: 60, w: 600, h: 20 }]
  const blockers = [{ x: 0, y: 30, w: 400, h: 20 }]
  const [p] = layoutNotes([{ x: 0, y: 60, w: 40, h: 20, nw: 150, nh: 20, rects: [{ x: 0, y: 60, w: 40, h: 20 }] }, { x: 0, y: 30, w: 400, h: 20, nw: 1, nh: 1, rects: blockers }], 600, lines)
  assert.ok(!p.fits || p.x - 40 <= MAX_REACH, `note at x ${p.x}`)
})

test('line rectangles merge per line', () => {
  const lines = mergeLineRects([
    { left: 0, right: 50, top: 10, bottom: 30, width: 50, height: 20 },
    { left: 50, right: 90, top: 11, bottom: 30, width: 40, height: 19 },
    { left: 0, right: 30, top: 60, bottom: 80, width: 30, height: 20 },
  ])
  assert.deepEqual(lines, [{ left: 0, top: 10, width: 90, height: 20 }, { left: 0, top: 60, width: 30, height: 20 }])
})

test('maths taller than its words stays on the same line', () => {
  // Words at 40–60 and maths at 36–64: one line, not two.
  const lines = mergeLineRects([
    { left: 0, top: 40, width: 50, height: 20 },
    { left: 60, top: 36, width: 80, height: 28 },
    { left: 0, top: 100, width: 30, height: 20 },
  ], { overlap: true })
  assert.deepEqual(lines, [{ left: 0, top: 36, width: 140, height: 28 }, { left: 0, top: 100, width: 30, height: 20 }])
})

test('helpers are deterministic', () => {
  assert.equal(handPath('circle', 3), handPath('circle', 3))
  assert.notEqual(handPath('circle', 3), handPath('circle', 4))
  assert.ok(noteSize('= 0.0500 L').w > 40)
})
