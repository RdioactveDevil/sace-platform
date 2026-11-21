import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newItem, newOption, moveItem, changeType, answerText, isFlagged, newId, questionCount, cloneQuestionnaire, BASIC_QUESTIONNAIRE } from './questionnaireEdit.js'

const q = {
  id: 'q', type: 'one', label: 'Pick', other: true,
  options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta', flag: true }],
}
const many = { ...q, type: 'many' }

test('newId is 8 url-safe characters and never reserved', () => {
  const ids = new Set()
  for (let i = 0; i < 200; i++) {
    const id = newId()
    assert.match(id, /^[A-Za-z0-9_-]{8}$/)
    assert.ok(!['__proto__', 'constructor', 'prototype'].includes(id))
    ids.add(id)
  }
  assert.equal(ids.size, 200)
})

test('newItem makes an item of the type; choice types start with two options', () => {
  const s = newItem('short')
  assert.equal(s.type, 'short')
  assert.equal(s.label, '')
  assert.equal(s.options, undefined)
  assert.ok(s.id)
  const o = newItem('one')
  assert.equal(o.options.length, 2)
  assert.notEqual(o.options[0].id, o.options[1].id)
  assert.equal(newItem('many').type, 'many')
  assert.equal(newItem('section').type, 'section')
})

test('newOption has an id and an empty label', () => {
  const o = newOption()
  assert.ok(o.id)
  assert.equal(o.label, '')
  assert.equal(o.flag, undefined)
})

test('moveItem moves by one and stops at the ends, without changing the input', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
  assert.deepEqual(moveItem(items, 1, -1).map(i => i.id), [2, 1, 3])
  assert.deepEqual(moveItem(items, 1, 1).map(i => i.id), [1, 3, 2])
  assert.deepEqual(moveItem(items, 0, -1).map(i => i.id), [1, 2, 3])
  assert.deepEqual(moveItem(items, 2, 1).map(i => i.id), [1, 2, 3])
  assert.deepEqual(items.map(i => i.id), [1, 2, 3])
})

test('changeType keeps the label, adds options for a choice and drops them otherwise', () => {
  const toLong = changeType(q, 'long')
  assert.equal(toLong.label, 'Pick')
  assert.equal(toLong.type, 'long')
  assert.equal(toLong.options, undefined)
  assert.equal(toLong.other, undefined)
  const toMany = changeType(q, 'many')
  assert.equal(toMany.options.length, 2)
  assert.equal(toMany.other, true)
  const fromShort = changeType({ id: 's', type: 'short', label: 'Why', required: true }, 'one')
  assert.equal(fromShort.options.length, 2)
  assert.equal(fromShort.required, true)
  const toSection = changeType({ ...q, required: true, help: 'h' }, 'section')
  assert.equal(toSection.required, undefined)
  assert.equal(toSection.options, undefined)
})

test('answerText shows text, the chosen option, Other and joined many', () => {
  assert.equal(answerText({ type: 'short' }, 'hello'), 'hello')
  assert.equal(answerText(q, 'a'), 'Alpha')
  assert.equal(answerText(q, { choice: 'other', other: 'Pilot' }), 'Other: Pilot')
  assert.equal(answerText(many, ['a', 'b']), 'Alpha, Beta')
  assert.equal(answerText(many, ['a', { other: 'Pilot' }]), 'Alpha, Other: Pilot')
  assert.equal(answerText(q, undefined), '')
  assert.equal(answerText(q, 'gone'), '')
})

test('isFlagged is true only for a flagged option that was chosen', () => {
  assert.equal(isFlagged(q, 'b'), true)
  assert.equal(isFlagged(q, 'a'), false)
  assert.equal(isFlagged(q, { choice: 'other', other: 'x' }), false)
  assert.equal(isFlagged(many, ['a', 'b']), true)
  assert.equal(isFlagged(many, ['a', { other: 'b' }]), false)
  assert.equal(isFlagged({ type: 'short' }, 'b'), false)
  assert.equal(isFlagged(q, undefined), false)
})

test('questionCount skips section headings', () => {
  assert.equal(questionCount({ items: [{ type: 'section' }, { type: 'short' }, { type: 'one' }] }), 2)
  assert.equal(questionCount(null), 0)
})

test('cloneQuestionnaire is a deep copy', () => {
  const copy = cloneQuestionnaire({ intro: 'hi', items: [{ id: 'a', type: 'one', label: 'x', options: [{ id: 'o', label: 'y' }] }] })
  copy.items[0].options[0].label = 'changed'
  assert.equal(BASIC_QUESTIONNAIRE.items.length, 5)
  const again = cloneQuestionnaire(BASIC_QUESTIONNAIRE)
  again.items[0].label = 'changed'
  assert.equal(BASIC_QUESTIONNAIRE.items[0].label, 'What school do you attend?')
})
