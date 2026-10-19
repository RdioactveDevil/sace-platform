import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitMarkdownBlocks, splitRow, applyBold } from './markdownBlocks.js'
import { parseMathText } from './mathMarkup.js'

test('a pipe table with a separator row gets a header', () => {
  // From the live bank (ai_1781686743314_0mn9bh).
  const q = 'Which of the following is the standard deviation of $Z$?\n\n| $z$ | 2 | 4 | 6 |\n|-----|-------|-------|-------|\n| $P(Z=z)$ | 0.25 | 0.5 | 0.25 |\n\nRounded to two decimal places:'
  assert.deepEqual(splitMarkdownBlocks(q), [
    { type: 'text', content: 'Which of the following is the standard deviation of $Z$?' },
    { type: 'table', header: ['$z$', '2', '4', '6'], rows: [['$P(Z=z)$', '0.25', '0.5', '0.25']] },
    { type: 'text', content: 'Rounded to two decimal places:' },
  ])
})

test('a table without a separator is all body rows', () => {
  // An answer option from the live bank (ai_1792374321954_1f80q5); note the trailing space.
  assert.deepEqual(splitMarkdownBlocks('| $x$ | 0 | 1 | 2 | 3 | \n| $y$ | 1 | 3 | 5 | 7 |'), [
    { type: 'table', header: null, rows: [['$x$', '0', '1', '2', '3'], ['$y$', '1', '3', '5', '7']] },
  ])
})

test('pipes inside maths do not split cells', () => {
  assert.deepEqual(splitRow('| $|x - 2|$ | 3 |'), ['$|x - 2|$', '3'])
})

test('text that is not a table is left alone', () => {
  for (const s of ['No pipes here', 'Solve |x - 2| < 5', '|x| = 3\nso x = 3 or x = -3', '$|x|$ and $|y|$']) {
    assert.deepEqual(splitMarkdownBlocks(s), [{ type: 'text', content: s }])
  }
  assert.deepEqual(splitMarkdownBlocks(''), [])
})

test('**bold** is marked and its markers dropped', () => {
  const tokens = applyBold(parseMathText('**Sequence A:** $T(n) = 50 - 6n$ (rule)'))
  assert.deepEqual(tokens, [
    { type: 'text', content: 'Sequence A:', bold: true },
    { type: 'text', content: ' ' },
    { type: 'math', display: false, content: 'T(n) = 50 - 6n' },
    { type: 'text', content: ' (rule)' },
  ])
  // Bold can wrap maths.
  assert.deepEqual(applyBold(parseMathText('so **$x = 2$**')).map((t) => !!t.bold), [false, true])
  // An unpaired marker is left as written.
  assert.deepEqual(applyBold(parseMathText('2 ** 3')), [{ type: 'text', content: '2 ** 3' }])
})
