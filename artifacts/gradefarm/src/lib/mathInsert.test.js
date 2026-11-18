import { test } from 'node:test'
import assert from 'node:assert/strict'
import { insertSnippet, insideMath, SNIPPETS } from './mathInsert.js'

const fraction = SNIPPETS.find(s => s.id === 'fraction')
const formula = SNIPPETS.find(s => s.id === 'formula')
const times = SNIPPETS.find(s => s.id === 'times')

test('inside maths: an odd number of unescaped dollars before the cursor', () => {
  assert.equal(insideMath('Find $x', 7), true)
  assert.equal(insideMath('Find $x$ and', 12), false)
  assert.equal(insideMath('Costs \\$5 and $y', 16), true)
  assert.equal(insideMath('$$\\frac{1}{2}', 13), true)
})

test('a snippet outside maths is wrapped in $…$, with the cursor in its first slot', () => {
  const r = insertSnippet('Find ', 5, 5, fraction)
  assert.equal(r.value, 'Find $\\frac{}{}$')
  assert.equal(r.value.slice(0, r.caret), 'Find $\\frac{')
})

test('inside maths it is inserted as it is', () => {
  const r = insertSnippet('$x = $', 5, 5, fraction)
  assert.equal(r.value, '$x = \\frac{}{}$')
  assert.equal(r.caret, 11)
})

test('selected text goes into the first slot, the cursor after it', () => {
  const r = insertSnippet('Dilute H2SO4 was added', 7, 12, formula)
  assert.equal(r.value, 'Dilute $\\ce{H2SO4}$ was added')
  assert.equal(r.value.slice(0, r.caret), 'Dilute $\\ce{H2SO4')
})

test('a symbol with no slot leaves the cursor after it', () => {
  const r = insertSnippet('$2 3$', 3, 3, times)
  assert.equal(r.value, '$2 \\times 3$')
  assert.equal(r.value.slice(0, r.caret), '$2 \\times ')
})

test('every snippet has a label, code and a valid slot marker', () => {
  for (const s of SNIPPETS) {
    assert.ok(s.id && s.label && s.title && typeof s.code === 'string', s.id)
    assert.ok((s.code.match(/\|/g) || []).length <= 1, `${s.id}: one slot at most`)
  }
})
