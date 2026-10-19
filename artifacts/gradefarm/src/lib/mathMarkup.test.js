import { test } from 'node:test'
import assert from 'node:assert/strict'
import katex from 'katex'
import 'katex/contrib/mhchem/mhchem.js'
import {
  parseMathText,
  insertLineBreaks,
  repairControlEscapes,
  collapseOverEscapes,
  convertBracketDelimiters,
  restoreLiteralNewlines,
} from './mathMarkup.js'

const math = (tokens) => tokens.filter((t) => t.type === 'math').map((t) => t.content)
const texts = (tokens) => tokens.filter((t) => t.type === 'text').map((t) => t.content)

// Every math token must be something KaTeX can actually render.
function assertRenders(tokens) {
  for (const t of tokens.filter((x) => x.type === 'math')) {
    assert.doesNotThrow(
      () => katex.renderToString(t.content, { throwOnError: true, displayMode: t.display, strict: false }),
      `KaTeX failed on ${JSON.stringify(t.content)}`,
    )
  }
}

test('\\( \\) and \\[ \\] delimiters become inline and display math', () => {
  const inline = parseMathText('The derivative of \\(x^2\\) is \\( 2x \\).')
  assert.deepEqual(math(inline), ['x^2', '2x'])
  assert.deepEqual(texts(inline), ['The derivative of ', ' is ', '.'])

  const display = parseMathText('Solve: \\[ \\int_0^1 x^2\\,dx = \\frac{1}{3} \\]')
  assert.equal(display.length, 2)
  assert.equal(display[1].display, true)
  assert.equal(display[1].content.trim(), '\\int_0^1 x^2\\,dx = \\frac{1}{3}')
  assertRenders(display)
})

test('a \\\\[4pt] row break is not mistaken for a display delimiter', () => {
  const s = '$$\\begin{aligned} a &= 1 \\\\[4pt] b &= 2 \\end{aligned}$$'
  assert.equal(convertBracketDelimiters(s), s)
})

test('bare LaTeX commands outside delimiters are wrapped', () => {
  const t = parseMathText('Simplify \\frac{x^2-4}{x-2} to get x+2.')
  assert.deepEqual(math(t), ['\\frac{x^2-4}{x-2}'])
  assert.deepEqual(texts(t), ['Simplify ', ' to get x+2.'])

  assert.deepEqual(math(parseMathText('with mean \\mu = 5 and \\sigma = 2')), ['\\mu = 5', '\\sigma = 2'])
  assert.deepEqual(math(parseMathText('\\sqrt{16} = 4')), ['\\sqrt{16} = 4'])
  assert.deepEqual(math(parseMathText('There is a \\frac{1}{2} chance')), ['\\frac{1}{2}'])
})

test('bare LaTeX next to explicit $...$ is wrapped too', () => {
  const t = parseMathText('The answer is $\\frac{1}{2}$ and then 3 \\times 4 = 12.')
  assert.deepEqual(math(t), ['\\frac{1}{2}', '3 \\times 4 = 12'])
  assert.equal(t[t.length - 1].content, '.')
})

test('a bare \\begin...\\end environment stays in one display block', () => {
  const t = parseMathText('\\begin{aligned} y &= 2x \\\\\n y &= 3 \\end{aligned}')
  assert.equal(t.length, 1)
  assert.equal(t[0].display, true)
  assertRenders(t)
})

test('unknown backslash words are left as prose', () => {
  const s = 'Saved under C:\\Users\\bob for now'
  assert.deepEqual(parseMathText(s), [{ type: 'text', content: s }])
})

test('commands corrupted by JSON.parse are restored', () => {
  // What JSON.parse('"$\\frac{1}{2}$"') etc. produce when the model forgets to escape.
  assert.equal(repairControlEscapes('$\frac{1}{2}$'), '$\\frac{1}{2}$')
  assert.equal(repairControlEscapes('3 \times 4'), '3 \\times 4')
  assert.equal(repairControlEscapes('$\beta + \rho$'), '$\\beta + \\rho$')
  assert.equal(repairControlEscapes('$x \neq y$'), '$x \\neq y$')

  const t = parseMathText('$\frac{1}{2}$ and the ratio is \frac{a}{b}')
  assert.deepEqual(math(t), ['\\frac{1}{2}', '\\frac{a}{b}'])
  assertRenders(t)
})

test('real newlines are never turned into commands', () => {
  assert.equal(repairControlEscapes('Line one\nnot two'), 'Line one\nnot two')
  assert.equal(repairControlEscapes('$x$ is one\neq is two'), '$x$ is one\neq is two')
})

test('over-escaped commands are collapsed, row breaks are kept', () => {
  assert.equal(collapseOverEscapes('$\\\\frac{1}{2}$'), '$\\frac{1}{2}$')
  assert.equal(collapseOverEscapes('a \\\\ b'), 'a \\\\ b')
  assert.equal(collapseOverEscapes('a \\\\\\frac{1}{2}'), 'a \\\\\\frac{1}{2}')
  assertRenders(parseMathText('$\\\\frac{1}{2} \\\\times 3$'))
})

test('currency and escaped dollars stay as text', () => {
  assert.deepEqual(parseMathText('Cost is $5 and $10.'), [{ type: 'text', content: 'Cost is $5 and $10.' }])
  assert.deepEqual(parseMathText('Price: \\$5'), [{ type: 'text', content: 'Price: $5' }])
})

test('existing plain-text heuristics still apply', () => {
  assert.deepEqual(math(parseMathText('x^2 + 3x - 4 = 0')), ['x^2 + 3x - 4 = 0'])
  assert.deepEqual(math(parseMathText('SO2 + H2O → H2SO3')), ['\\ce{SO2 + H2O -> H2SO3}'])
  assert.deepEqual(math(parseMathText("If f(x)=xe^x, what is f''(x)?")), ['xe^x', "f''(x)"])
})

test('empty and non-string input yields no tokens', () => {
  assert.deepEqual(parseMathText(''), [])
  assert.deepEqual(parseMathText(null), [])
  assert.deepEqual(parseMathText(42), [])
})

test('numbered lists get line breaks, function arguments like T(1) do not', () => {
  assert.equal(insertLineBreaks('Steps: (1) add 2 (2) subtract 1'), 'Steps:\n(1) add 2\n(2) subtract 1')
  // From the live bank: splitting "$T(1) = 50$" across lines broke the $...$ pairing.
  const s = 'With $T(1) = 50$ the rule is $T(n) = 55 - 5n$, so $T(2) = 45$ and T(1) + T(2) = 95.'
  assert.equal(insertLineBreaks(s), s)
  assert.deepEqual(math(parseMathText(s)), ['T(1) = 50', 'T(n) = 55 - 5n', 'T(2) = 45'])
})

test('literal backslash-n from old generated questions becomes a line break', () => {
  // From the live bank: the question rendered "...\n\nWhich rule..." verbatim.
  const q = 'Look at this sequence: $3, 6, 9, 12, 15, \\ldots$\\n\\nWhich rule describes the $n$th term?'
  assert.deepEqual(texts(parseMathText(q)), ['Look at this sequence: ', '\n\nWhich rule describes the ', 'th term?'])
  assert.deepEqual(math(parseMathText(q)), ['3, 6, 9, 12, 15, \\ldots', 'n'])
  assert.equal(restoreLiteralNewlines('Step 1\\n2x = 4'), 'Step 1\n2x = 4')
  // Real \n-commands and \\ row breaks are left alone.
  assert.equal(restoreLiteralNewlines('$x \\neq 0$, $\\nabla f$, $\\nu$'), '$x \\neq 0$, $\\nabla f$, $\\nu$')
  assert.equal(restoreLiteralNewlines('$\\begin{matrix} a \\\\ b \\end{matrix}$'), '$\\begin{matrix} a \\\\ b \\end{matrix}$')
  assertRenders(parseMathText('$x \\neq 0$\\nso $x^2 > 0$'))
})
