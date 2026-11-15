import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guessResourceType } from './resourceTypes.js'

test('a reference file\'s type is guessed from its name', () => {
  assert.equal(guessResourceType('2023 VCAA Methods Exam 2.pdf'), 'exam')
  assert.equal(guessResourceType('Chemistry trial paper 2022.pdf'), 'practice_test')
  assert.equal(guessResourceType('Topic test - quadratics.pdf'), 'practice_test')
  assert.equal(guessResourceType('SAT task 3.pdf'), 'assessment')
  assert.equal(guessResourceType('Redox summary notes.pdf'), 'notes')
  assert.equal(guessResourceType('Cambridge Methods 1&2 Chapter 4.pdf'), 'textbook')
  assert.equal(guessResourceType('scan0001.pdf', 'exam'), 'exam')
  assert.equal(guessResourceType('scan0001.pdf'), 'textbook')
})
