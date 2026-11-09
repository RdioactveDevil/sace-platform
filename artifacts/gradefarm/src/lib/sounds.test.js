import { test } from 'node:test'
import assert from 'node:assert/strict'
import { answerSound, applySoundsSetting, finishSound, isCelebration, isStreakMilestone, playSound, soundsEnabled } from './sounds.js'

test('streak milestones are 3, 5 and every 5 after', () => {
  const hits = Array.from({ length: 21 }, (_, i) => i).filter(isStreakMilestone)
  assert.deepEqual(hits, [3, 5, 10, 15, 20])
})

test('answers: wrong, right, or a streak milestone', () => {
  assert.equal(answerSound(false, 0), 'wrong')
  assert.equal(answerSound(true, 1), 'correct')
  assert.equal(answerSound(true, 3), 'streak')
  assert.equal(answerSound(true, 4), 'correct')
  assert.equal(answerSound(true, 10), 'streak')
})

test('finishing: perfect, complete, or nothing when nothing was answered', () => {
  assert.equal(finishSound(3, 3), 'perfect')
  assert.equal(finishSound(2, 3), 'complete')
  assert.equal(finishSound(0, 0), null)
})

test('confetti for all right, or 70%+ over three or more', () => {
  assert.equal(isCelebration(1, 1), true)
  assert.equal(isCelebration(7, 10), true)
  assert.equal(isCelebration(6, 10), false)
  assert.equal(isCelebration(1, 2), false)
  assert.equal(isCelebration(0, 0), false)
})

test('outside a browser it stays quiet and on by default', () => {
  assert.equal(soundsEnabled(), true)
  assert.doesNotThrow(() => playSound('correct'))
})

test('the account setting switches sounds off only when it is false', () => {
  applySoundsSetting(false)
  assert.equal(soundsEnabled(), false)
  assert.doesNotThrow(() => playSound('correct'))
  applySoundsSetting(undefined)
  assert.equal(soundsEnabled(), true)
  applySoundsSetting(null)
  assert.equal(soundsEnabled(), true)
  applySoundsSetting(true)
  assert.equal(soundsEnabled(), true)
})
