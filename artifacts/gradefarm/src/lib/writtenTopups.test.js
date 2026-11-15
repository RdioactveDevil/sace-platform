import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writtenTopupSubtopic } from './writtenTopups.js'

const w = (id, subtopic) => ({ id, subtopic, question_type: 'marked' })
const m = (id, subtopic) => ({ id, subtopic, question_type: 'mcq' })

const bank = [
  w('r1', 'Redox'), w('r2', 'Redox'), w('r3', 'Redox'),
  w('e1', 'Equilibrium'),
  m('a1', 'Acids'), m('a2', 'Acids'),
]
const availableExcept = (...done) => q => !done.includes(q.id)

test('asks once the subtopic just practised is down to its last written answer', () => {
  // Two of three Redox written answers done: ask.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('r1', 'r2'), lastAnswered: bank[1] }), 'Redox')
  // Only one done: two left, not yet.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('r1'), lastAnswered: bank[0] }), null)
})

test('a multiple-choice answer alone never asks', () => {
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('r1', 'r2', 'a1'), lastAnswered: bank[4] }), null)
})

test('a whole-subject session does not refill subtopics nobody is working on', () => {
  // Equilibrium has one written answer left, but the student is doing Redox.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('r1'), lastAnswered: bank[0] }), null)
})

test('a picked subtopic with none left asks straight away', () => {
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('e1'), picked: ['Equilibrium'] }), 'Equilibrium')
  // One still left in a picked subtopic: wait until it's done.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept(), picked: ['Equilibrium'] }), null)
})

test('subtopics with no written answers are never started', () => {
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('a1', 'a2'), picked: ['Acids'] }), null)
})

test('skipped subtopics are left alone, and the emptiest one goes first', () => {
  const isAvailable = availableExcept('r1', 'r2', 'e1')
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable, picked: ['Equilibrium'], lastAnswered: bank[1] }), 'Equilibrium')
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable, picked: ['Equilibrium'], lastAnswered: bank[1], skip: new Set(['Equilibrium']) }), 'Redox')
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable, picked: ['Equilibrium'], lastAnswered: bank[1], skip: new Set(['Equilibrium', 'Redox']) }), null)
})
