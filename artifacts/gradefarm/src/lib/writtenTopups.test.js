import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writtenTopupSubtopic } from './writtenTopups.js'

const w = (id, subtopic) => ({ id, subtopic, question_type: 'marked' })
const m = (id, subtopic) => ({ id, subtopic, question_type: 'mcq' })

const bank = [
  w('r1', 'Redox'), w('r2', 'Redox'), w('r3', 'Redox'),
  w('e1', 'Equilibrium'),
  m('a1', 'Acids'), m('a2', 'Acids'),
  m('rm1', 'Redox'), m('em1', 'Equilibrium'),
]
const q = id => bank.find(x => x.id === id)
const availableExcept = (...done) => x => !done.includes(x.id)

test('asks once the subtopic just practised is down to its last written answer', () => {
  // Two of three Redox written answers done: ask.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('r1', 'r2'), lastAnswered: q('r2') }), 'Redox')
  // Only one done: two left, not yet.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('r1'), lastAnswered: q('r1') }), null)
})

test('any question in a subtopic whose written answers are used up asks', () => {
  // A multiple-choice Redox question, and every Redox written answer done.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('r1', 'r2', 'r3', 'rm1'), lastAnswered: q('rm1') }), 'Redox')
  // One Redox written answer still to come: not yet.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('r1', 'r2', 'rm1'), lastAnswered: q('rm1') }), null)
})

test('a subtopic with no written answers never asks', () => {
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('a1'), lastAnswered: q('a1') }), null)
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('a1', 'a2'), picked: ['Acids'] }), null)
})

test('a whole-subject session leaves alone subtopics nobody is working on while others have some left', () => {
  // Equilibrium is used up, but the student is doing Redox, which has some left.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('e1', 'r1'), lastAnswered: q('r1') }), null)
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('e1') }), null)
})

test('a whole-subject session with no written answers left refills the subtopic last practised', () => {
  const isAvailable = availableExcept('r1', 'r2', 'r3', 'e1')
  const lastSeen = x => ({ r1: 100, r2: 300, e1: 200 })[x.id] || 0
  // Straight away, before anything is answered.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable, lastSeen }), 'Redox')
  // Redox came back empty this session: the next most recent.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable, lastSeen, skip: new Set(['Redox']) }), 'Equilibrium')
  // Both empty: stop.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable, lastSeen, skip: new Set(['Redox', 'Equilibrium']) }), null)
  // The subtopic of the question just answered still goes first.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('r1', 'r2', 'r3', 'e1', 'em1'), lastSeen, lastAnswered: q('em1') }), 'Equilibrium')
})

test('a picked subtopic with none left asks straight away', () => {
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('e1'), picked: ['Equilibrium'] }), 'Equilibrium')
  // One still left in a picked subtopic: wait until it's done.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept(), picked: ['Equilibrium'] }), null)
  // Subtopics outside the ones picked are never refilled.
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable: availableExcept('r1', 'r2', 'r3', 'e1'), picked: ['Acids'] }), null)
})

test('skipped subtopics are left alone, and the emptiest one goes first', () => {
  const isAvailable = availableExcept('r1', 'r2', 'e1')
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable, picked: ['Equilibrium', 'Redox'], lastAnswered: q('r2') }), 'Equilibrium')
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable, picked: ['Equilibrium', 'Redox'], lastAnswered: q('r2'), skip: new Set(['Equilibrium']) }), 'Redox')
  assert.equal(writtenTopupSubtopic({ questions: bank, isAvailable, picked: ['Equilibrium', 'Redox'], lastAnswered: q('r2'), skip: new Set(['Equilibrium', 'Redox']) }), null)
})
