import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draftKey, loadDraft, saveDraft, missingRequired, toPayload } from './questionnaireForm.js'

const q = {
  intro: '',
  items: [
    { id: 's1', type: 'section', label: 'About you' },
    { id: 'a', type: 'short', label: 'Goal', required: true },
    { id: 'b', type: 'long', label: 'Notes' },
    { id: 'c', type: 'one', label: 'Year', required: true, options: [{ id: 'o1', label: '11' }, { id: 'o2', label: '12', flag: true }], other: true },
    { id: 'd', type: 'many', label: 'Subjects', required: true, options: [{ id: 'm1', label: 'Maths' }, { id: 'm2', label: 'Physics' }], other: true },
    { id: 'e', type: 'one', label: 'Pace', options: [{ id: 'p1', label: 'Slow' }] },
  ],
}

function memoryStorage() {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)) }, removeItem: k => { m.delete(k) } }
}
const throwing = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }

test('draftKey is per token', () => {
  assert.equal(draftKey('abc'), 'gf-questionnaire-draft-abc')
  assert.notEqual(draftKey('abc'), draftKey('abd'))
})

test('a draft round-trips', () => {
  const s = memoryStorage()
  const state = { a: 'Get an A', c: { choice: 'other', other: 'Year 10' } }
  saveDraft('t', state, s)
  assert.deepEqual(loadDraft('t', s), state)
  assert.deepEqual(loadDraft('other', s), {})
})

test('blocked storage never throws', () => {
  assert.deepEqual(loadDraft('t', throwing), {})
  assert.doesNotThrow(() => saveDraft('t', { a: 'x' }, throwing))
})

test('a corrupt draft loads as empty', () => {
  const s = memoryStorage()
  s.setItem(draftKey('t'), '{nope')
  assert.deepEqual(loadDraft('t', s), {})
  s.setItem(draftKey('t'), '"a string"')
  assert.deepEqual(loadDraft('t', s), {})
})

test('missingRequired lists required questions left blank, skipping sections', () => {
  assert.deepEqual(missingRequired(q, {}), ['a', 'c', 'd'])
  assert.deepEqual(missingRequired(q, { a: '   ', c: { choice: 'o1', other: '' }, d: { picked: ['m1'], otherOn: false, other: '' } }), ['a'])
  assert.deepEqual(missingRequired(q, { a: 'x', c: { choice: 'o2' }, d: { picked: [], otherOn: true, other: 'Chemistry' } }), [])
})

test('Other chosen with empty text counts as missing', () => {
  assert.deepEqual(missingRequired(q, { a: 'x', c: { choice: 'other', other: '  ' }, d: { picked: [], otherOn: true, other: '' } }), ['c', 'd'])
})

test('toPayload matches the shapes the server accepts', () => {
  const state = {
    a: '  Get an A  ',
    b: '',
    c: { choice: 'other', other: ' Year 10 ' },
    d: { picked: ['m2', 'm1'], otherOn: true, other: ' Chem ' },
    e: { choice: 'p1' },
  }
  assert.deepEqual(toPayload(q, state), {
    a: 'Get an A',
    c: { choice: 'other', other: 'Year 10' },
    d: ['m2', 'm1', { other: 'Chem' }],
    e: 'p1',
  })
})

test('toPayload leaves out blanks and unticked Other, and plain choices stay ids', () => {
  assert.deepEqual(toPayload(q, { a: 'x', c: { choice: 'o1', other: 'stale' }, d: { picked: ['m1'], otherOn: false, other: 'stale' } }), {
    a: 'x', c: 'o1', d: ['m1'],
  })
  assert.deepEqual(toPayload(q, { c: { choice: 'other', other: '' }, d: { picked: [], otherOn: true, other: '' } }), {})
})

test('toPayload drops choices the form no longer offers', () => {
  assert.deepEqual(toPayload(q, { c: { choice: 'gone' }, d: { picked: ['gone', 'm1'] } }), { d: ['m1'] })
})
