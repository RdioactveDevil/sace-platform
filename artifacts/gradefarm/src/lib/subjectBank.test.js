import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bankForSubject, emptyBank, storedBank, NO_QUESTIONS } from './subjectBank.js'

const vce = [{ id: 'v1', subtopic: 'Division of polynomials and the remainder theorem' }]
const spec = [{ id: 's1', subtopic: 'Permutations' }]

test('a bank shows under the subject it was loaded for', () => {
  assert.equal(bankForSubject(storedBank('curriculum_spec', spec), 'curriculum_spec'), spec)
})

test("another subject's bank never shows under the chosen subject", () => {
  // The bug: Specialist Maths picked, VCE Methods' questions still in state.
  assert.equal(bankForSubject(storedBank('curriculum_vce', vce), 'curriculum_spec'), NO_QUESTIONS)
})

test('no subject chosen, or nothing loaded, shows no questions', () => {
  assert.equal(bankForSubject(storedBank('curriculum_spec', spec), null), NO_QUESTIONS)
  assert.equal(bankForSubject(emptyBank(), 'curriculum_spec'), NO_QUESTIONS)
  assert.equal(bankForSubject(undefined, 'curriculum_spec'), NO_QUESTIONS)
})
