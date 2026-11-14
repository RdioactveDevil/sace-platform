import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_BOARD, HISTORY_LIMIT, boardReducer, widthAt, smoothPoints, strokePath, strokeHit, inkBottom,
  displayText, typedLines, insertSnippet, checkWorkingSystem, checkWorkingMessage, roughWorkFileName, inkColor,
} from './roughWork.js'

const stroke = (id, points, extra = {}) => ({ id, type: 'stroke', color: 'ink', size: 3, points, ...extra })
const text = (id, x, y, t, math = false) => ({ id, type: 'text', color: 'ink', x, y, text: t, math })

test('each change is one undo step, and redo puts it back', () => {
  let s = boardReducer(EMPTY_BOARD, { type: 'add', item: stroke('a', [{ x: 0, y: 0 }]) })
  s = boardReducer(s, { type: 'add', item: text('b', 0, 10, 'n = 0.25') })
  assert.deepEqual(s.items.map(i => i.id), ['a', 'b'])
  s = boardReducer(s, { type: 'undo' })
  assert.deepEqual(s.items.map(i => i.id), ['a'])
  s = boardReducer(s, { type: 'redo' })
  assert.deepEqual(s.items.map(i => i.id), ['a', 'b'])
  // A new change after an undo drops what could have been redone.
  s = boardReducer(boardReducer(s, { type: 'undo' }), { type: 'clear' })
  assert.deepEqual(s.items, [])
  assert.equal(s.future.length, 0)
  assert.deepEqual(boardReducer(s, { type: 'undo' }).items.map(i => i.id), ['a'])
})

test('changes that change nothing are not undo steps', () => {
  const s = boardReducer(EMPTY_BOARD, { type: 'add', item: text('t', 0, 0, 'hi') })
  assert.equal(boardReducer(s, { type: 'update', id: 't', patch: { text: 'hi' } }), s)
  assert.equal(boardReducer(s, { type: 'remove', ids: ['nope'] }), s)
  assert.equal(boardReducer(EMPTY_BOARD, { type: 'clear' }), EMPTY_BOARD)
  assert.equal(boardReducer(EMPTY_BOARD, { type: 'undo' }), EMPTY_BOARD)
  const moved = boardReducer(s, { type: 'update', id: 't', patch: { x: 20 } })
  assert.equal(moved.items[0].x, 20)
  assert.equal(moved.past.length, 2)
})

test('history is capped', () => {
  let s = EMPTY_BOARD
  for (let i = 0; i < HISTORY_LIMIT + 10; i++) s = boardReducer(s, { type: 'add', item: stroke(`s${i}`, [{ x: i, y: i }]) })
  assert.equal(s.past.length, HISTORY_LIMIT)
})

test('a pen presses thicker; a mouse or finger draws an even line', () => {
  assert.equal(widthAt(0.9, 3, false), 3)
  assert.ok(widthAt(1, 3, true) > widthAt(0.2, 3, true))
  assert.equal(widthAt(0, 3, true), widthAt(0.5, 3, true)) // no reading → middle
})

test('strokes are smoothed into a closed outline with round ends', () => {
  assert.equal(smoothPoints([{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 5, y: 0 }]).length, 2)
  assert.equal(strokePath(stroke('e', [])), '')
  assert.match(strokePath(stroke('d', [{ x: 1, y: 1 }])), /^M.*a.*Z$/)
  const d = strokePath(stroke('l', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 5 }]))
  assert.match(d, /^M[-\d.]+ [-\d.]+L/)
  assert.ok(!d.includes('NaN'))
})

test('the eraser finds strokes it touches', () => {
  const s = stroke('a', [{ x: 0, y: 0 }, { x: 100, y: 0 }])
  assert.ok(strokeHit(s, 50, 6, 5))
  assert.ok(!strokeHit(s, 50, 20, 5))
  assert.ok(strokeHit(stroke('d', [{ x: 10, y: 10 }]), 12, 12, 2))
})

test('the board grows to fit the ink', () => {
  assert.equal(inkBottom([]), 0)
  assert.equal(inkBottom([stroke('a', [{ x: 0, y: 40 }, { x: 0, y: 90 }]), text('t', 0, 100, 'a\nb')]), 148)
})

test('maths boxes show each line as maths; typed lines go to Titan in reading order', () => {
  assert.equal(displayText(text('t', 0, 0, 'plain $x$')), 'plain $x$')
  assert.equal(displayText(text('m', 0, 0, '\\frac{4.0}{16}\n\n= 0.25', true)), '$\\displaystyle \\frac{4.0}{16}$\n\n$\\displaystyle = 0.25$')
  const lines = typedLines([text('b', 0, 200, 'second'), text('a2', 80, 5, 'right'), text('a1', -80, 0, 'left'), text('m', 0, 300, 'x^2\n=4', true), text('e', 0, 50, '  ')])
  assert.deepEqual(lines, ['left', 'right', 'second', '$x^2$\n$=4$'])
})

test('maths buttons insert at the cursor and leave it inside the braces', () => {
  assert.deepEqual(insertSnippet('n = ', 4, 4, '\\frac{|}{}'), { text: 'n = \\frac{}{}', caret: 10 })
  assert.deepEqual(insertSnippet('ab', 1, 2, '\\pi '), { text: 'a\\pi ', caret: 5 })
})

test("Titan's check never gives the answer away before the student answers", () => {
  const before = checkWorkingSystem({ questionSection: 'Question: Q', answered: false, firstName: 'Dev' })
  assert.match(before, /helping Dev/)
  assert.match(before, /Question: Q/)
  assert.match(before, /NOT answered yet/)
  assert.doesNotMatch(checkWorkingSystem({ answered: true }), /NOT answered/)
  const msg = checkWorkingMessage({ mediaType: 'image/jpeg', base64: 'abc' }, ['$x^2$'])
  assert.equal(msg[0].type, 'image')
  assert.equal(msg[0].source.data, 'abc')
  assert.match(msg[1].text, /\$x\^2\$/)
  assert.deepEqual(checkWorkingMessage(null, []), [{ type: 'text', text: 'Can you check my working?' }])
})

test('file names and ink colours', () => {
  assert.equal(roughWorkFileName('Stoichiometry: moles & mass', new Date(2026, 10, 4)), 'rough-work-stoichiometry-moles-mass-2026-11-04.png')
  assert.equal(roughWorkFileName('', new Date(2026, 0, 9)), 'rough-work-2026-01-09.png')
  const t = { text: '#fff', goldText: '#e2b54c' }
  assert.equal(inkColor('ink', t), '#fff')
  assert.equal(inkColor('gold', t), '#e2b54c')
  assert.equal(inkColor('blue', t, 'light'), '#2563eb')
})
