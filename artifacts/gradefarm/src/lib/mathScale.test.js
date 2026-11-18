import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MATH_SCALES, mathScaleOf, stepMathScale, mathScaleLabel } from './mathScale.js'

test('a question prints its maths at normal size unless a listed size is set', () => {
  assert.equal(mathScaleOf({}), 1)
  assert.equal(mathScaleOf({ math_scale: null }), 1)
  assert.equal(mathScaleOf(null), 1)
  assert.equal(mathScaleOf({ math_scale: 1.3 }), 1.3)
  assert.equal(mathScaleOf({ math_scale: '1.15' }), 1.15)
  assert.equal(mathScaleOf({ math_scale: 7 }), 1)
})

test('stepping goes through the listed sizes and stops at either end', () => {
  assert.equal(stepMathScale(1, 1), 1.15)
  assert.equal(stepMathScale(1.15, 1), 1.3)
  assert.equal(stepMathScale(1.5, 1), 1.5)
  assert.equal(stepMathScale(1.3, -1), 1.15)
  assert.equal(stepMathScale(1, -1), 1)
  assert.equal(stepMathScale(9, 1), 1.15)
  assert.equal(MATH_SCALES[0], 1)
})

test('sizes show as percentages', () => {
  assert.equal(mathScaleLabel(1), '100%')
  assert.equal(mathScaleLabel(1.15), '115%')
})
