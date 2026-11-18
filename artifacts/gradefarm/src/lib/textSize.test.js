import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSized, resizeSelection, stripSizeTags } from './textSize.js'

const at = (text, word) => [text.indexOf(word), text.indexOf(word) + word.length]

test('size tags give their words a scale and are removed', () => {
  const parts = parseSized('Find <big>$\\frac{1}{2}$ of it</big> now')
  assert.deepEqual(parts.map(p => [p.type, p.content, p.scale]), [
    ['text', 'Find ', undefined],
    ['math', '\\frac{1}{2}', 1.2],
    ['text', ' of it', 1.2],
    ['text', ' now', undefined],
  ])
})

test('tags nest, and bare maths beside a tag is still found', () => {
  const parts = parseSized('Simplify <big><big>\\frac{x^2-4}{x-2}</big></big>.')
  const math = parts.find(p => p.type === 'math')
  assert.equal(math.content, '\\frac{x^2-4}{x-2}')
  assert.equal(math.scale, 1.44)
  assert.ok(!parts.some(p => p.content.includes('<')))
})

test('unpaired tags are left as written', () => {
  assert.equal(parseSized('a <big>b').map(p => p.content).join(''), 'a <big>b')
  assert.equal(parseSized('a </big>b<big>').map(p => p.content).join(''), 'a </big>b<big>')
})

test('text without tags parses as before; x < 5 is not a tag', () => {
  assert.deepEqual(parseSized('x < 5 and y > 2'), [{ type: 'text', content: 'x < 5 and y > 2' }])
  assert.equal(stripSizeTags('a <big>b</big> <small>c</small>'), 'a b c')
})

test('Bigger wraps the selected words and keeps them selected', () => {
  const t = 'Dilute acid was added'
  const r = resizeSelection(t, ...at(t, 'acid'), 1)
  assert.equal(r.value, 'Dilute <big>acid</big> was added')
  assert.equal(r.value.slice(r.start, r.end), 'acid')
  const again = resizeSelection(r.value, r.start, r.end, 1)
  assert.equal(again.value, 'Dilute <big><big>acid</big></big> was added')
})

test('Smaller after Bigger undoes it instead of stacking', () => {
  const t = 'Dilute <big>acid</big> was added'
  const r = resizeSelection(t, ...at(t, 'acid'), -1)
  assert.equal(r.value, 'Dilute acid was added')
  assert.equal(r.value.slice(r.start, r.end), 'acid')
  const tagged = resizeSelection(t, ...at(t, '<big>acid</big>'), -1)
  assert.equal(tagged.value, 'Dilute acid was added')
})

test('there is a limit each way', () => {
  const t = '<big><big><big>x</big></big></big>'
  assert.ok(resizeSelection(t, ...at(t, 'x'), 1).error)
  const s = '<small><small>x</small></small>'
  assert.ok(resizeSelection(s, ...at(s, 'x'), -1).error)
})

test('an equation selected without its $ signs is sized whole, with them', () => {
  const t = 'Find $\\frac{1}{2}$ now'
  const r = resizeSelection(t, ...at(t, '\\frac{1}{2}'), 1)
  assert.equal(r.value, 'Find <big>$\\frac{1}{2}$</big> now')
  const d = 'So\n$$x^2$$\nthen'
  assert.equal(resizeSelection(d, ...at(d, 'x^2'), 1).value, 'So\n<big>$$x^2$$</big>\nthen')
})

test('part of an equation is sized with LaTeX, stepping and undoing', () => {
  const t = '$x = \\frac{1}{2}$'
  const r = resizeSelection(t, ...at(t, '\\frac{1}{2}'), 1)
  assert.equal(r.value, '$x = {\\large \\frac{1}{2}}$')
  assert.equal(r.value.slice(r.start, r.end), '\\frac{1}{2}')
  const r2 = resizeSelection(r.value, r.start, r.end, 1)
  assert.equal(r2.value, '$x = {\\Large \\frac{1}{2}}$')
  const back = resizeSelection(resizeSelection(r2.value, r2.start, r2.end, -1).value, r.start, r.end, -1)
  assert.equal(back.value, t)
})

test('a selection half in and half out of an equation, or nothing selected, says why', () => {
  const t = 'Find $x + 1$ now'
  assert.ok(resizeSelection(t, t.indexOf('Find'), t.indexOf('+'), 1).error)
  assert.ok(resizeSelection(t, 3, 3, 1).error)
  assert.ok(resizeSelection('a   b', 1, 4, 1).error)
})

test('a formula selected without its \\ce{ } is sized whole; part of one says why', () => {
  const t = 'Dilute $\\ce{H2SO4}$ was added'
  assert.equal(resizeSelection(t, ...at(t, 'H2SO4'), 1).value, 'Dilute <big>$\\ce{H2SO4}$</big> was added')
  const r = '$\\ce{SO2 + H2O -> H2SO3}$'
  assert.ok(resizeSelection(r, ...at(r, 'H2O'), 1).error)
  assert.equal(resizeSelection(r, ...at(r, '\\ce{SO2 + H2O -> H2SO3}'), 1).value, '<big>' + r + '</big>')
})
