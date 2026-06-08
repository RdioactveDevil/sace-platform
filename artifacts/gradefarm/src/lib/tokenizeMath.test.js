import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenizeMath, applyOutsideMath } from './tokenizeMath.js'

const math = (tokens) => tokens.filter((t) => t.type === 'math').map((t) => t.content)
const texts = (tokens) => tokens.filter((t) => t.type === 'text').map((t) => t.content)

test('pairs math that starts with a number (the broken explanation case)', () => {
  // This is the exact shape that rendered as garbage before the fix:
  // every $ after "$92" was mis-paired, leaking \times into prose and
  // capturing ", so" / "giving" as italic math.
  const input =
    'Using $a_n = a_1 + (n-1)d$: $92 = 8 + (n-1) \\times 6$, so $84 = 6(n-1)$, ' +
    'giving $n - 1 = 14$ and $n = 15$. There are $15$ terms.'

  const tokens = tokenizeMath(input)

  assert.deepEqual(math(tokens), [
    'a_n = a_1 + (n-1)d',
    '92 = 8 + (n-1) \\times 6',
    '84 = 6(n-1)',
    'n - 1 = 14',
    'n = 15',
    '15',
  ])
  // Prose stays prose.
  assert.ok(texts(tokens).join('').includes(', so '))
  assert.ok(texts(tokens).join('').includes(' terms.'))
})

test('real currency is NOT treated as math', () => {
  const tokens = tokenizeMath('Item A is $5 and item B is $10 total.')
  assert.equal(math(tokens).length, 0)
  assert.equal(texts(tokens).join(''), 'Item A is $5 and item B is $10 total.')
})

test('display math $$...$$ is captured', () => {
  const tokens = tokenizeMath('Result: $$x = \\frac{1}{2}$$ done')
  assert.deepEqual(
    tokens.map((t) => [t.type, t.content, t.display ?? null]),
    [
      ['text', 'Result: ', null],
      ['math', 'x = \\frac{1}{2}', true],
      ['text', ' done', null],
    ],
  )
})

test('escaped dollar is literal', () => {
  const tokens = tokenizeMath('Pay \\$5 now')
  assert.equal(math(tokens).length, 0)
  assert.equal(texts(tokens).join(''), 'Pay $5 now')
})

test('unterminated $ stays literal', () => {
  const tokens = tokenizeMath('A lone $ sign and $x = 1$')
  assert.deepEqual(math(tokens), ['x = 1'])
})

test('inline math does not span newlines', () => {
  const tokens = tokenizeMath('cost $5\nand $x=1$')
  assert.deepEqual(math(tokens), ['x=1'])
})

test('applyOutsideMath leaves math untouched', () => {
  const out = applyOutsideMath('a $x^2$ b $y^2$', (s) => s.toUpperCase())
  assert.equal(out, 'A $x^2$ B $y^2$')
})
