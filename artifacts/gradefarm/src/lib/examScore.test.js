import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { predictScore, readiness, percentileLabel } from './examScore.js'

describe('predictScore', () => {
  test('ucat scales 0–100% into ~1300–2900', () => {
    assert.equal(predictScore('ucat', 0).label, '~1300')
    assert.equal(predictScore('ucat', 100).label, '~2900')
    assert.equal(predictScore('ucat', 50).label, '~2100')
  })
  test('gamsat scales into ~50–90', () => {
    assert.equal(predictScore('gamsat', 0).label, '~50')
    assert.equal(predictScore('gamsat', 100).label, '~90')
  })
  test('selective scales into /120', () => {
    assert.equal(predictScore('selective', 100).label, '120/120')
    assert.equal(predictScore('selective', 50).label, '60/120')
  })
  test('default returns the raw percentage', () => {
    assert.equal(predictScore('mixed-mock', 73).label, '73%')
  })
  test('clamps out-of-range input', () => {
    assert.equal(predictScore('ucat', 150).label, '~2900')
    assert.equal(predictScore('gamsat', -20).label, '~50')
  })
})

describe('readiness', () => {
  test('bands', () => {
    assert.equal(readiness(90).label, 'Exam-ready')
    assert.equal(readiness(72).label, 'Strong')
    assert.equal(readiness(60).label, 'On track')
    assert.equal(readiness(45).label, 'Developing')
    assert.equal(readiness(20).label, 'Needs work')
  })
})

describe('percentileLabel', () => {
  test('too few attempts', () => {
    assert.match(percentileLabel(90, 3), /Not enough/)
    assert.match(percentileLabel(null, 100), /Not enough/)
  })
  test('mid and top phrasing', () => {
    assert.match(percentileLabel(82, 50), /Better than 82%/)
    assert.match(percentileLabel(95, 50), /Better than 95%/)
    assert.match(percentileLabel(30, 50), /Top 70%/)
  })
})
