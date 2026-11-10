import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseWorking, serializeWorking, isMathWorking, newLine, workingRows } from './mathWorking.js'

const strip = lines => lines.map(({ kind, value }) => ({ kind, value }))

describe('maths working', () => {
  test('round-trips maths and words, one per line', () => {
    const answer = "$f'(x) = 3x^2 - 12$\nStationary points where f'(x) = 0\n$x = \\pm 2$"
    const lines = parseWorking(answer)
    assert.deepEqual(strip(lines), [
      { kind: 'math', value: "f'(x) = 3x^2 - 12" },
      { kind: 'text', value: "Stationary points where f'(x) = 0" },
      { kind: 'math', value: 'x = \\pm 2' },
    ])
    assert.equal(serializeWorking(lines), answer)
  })

  test('an empty answer starts with one empty maths line', () => {
    assert.deepEqual(strip(parseWorking('')), [{ kind: 'math', value: '' }])
    assert.deepEqual(strip(parseWorking(null)), [{ kind: 'math', value: '' }])
  })

  test('blank lines are left out of the answer', () => {
    const lines = [newLine('math', ' x = 1 '), newLine('math', ''), newLine('text', '   '), newLine('text', 'so x is 1  ')]
    assert.equal(serializeWorking(lines), '$x = 1$\nso x is 1')
  })

  test('every line gets its own id', () => {
    const [a, b] = parseWorking('$1$\n$2$')
    assert.notEqual(a.id, b.id)
  })

  test('isMathWorking spots a maths line', () => {
    assert.equal(isMathWorking('$x = 2$\nso x is 2'), true)
    assert.equal(isMathWorking('The answer is $x = 2$ because…'), false)
    assert.equal(isMathWorking('H2SO4 + 2NaOH'), false)
    assert.equal(isMathWorking(''), false)
  })

  test('workingRows credits each row its mark points', () => {
    const answer = '$a = 1$\n\nso b\n$b = 2$'
    // "a = 1" sits in row 0; "b\n$b" spans rows 2 and 3.
    const ranges = [[1, 6, 0], [11, 15, 1]]
    assert.deepEqual(workingRows(answer, ranges), [
      { text: '$a = 1$', points: [0] },
      { text: 'so b', points: [1] },
      { text: '$b = 2$', points: [1] },
    ])
    assert.deepEqual(workingRows('$x$', []), [{ text: '$x$', points: [] }])
  })
})
