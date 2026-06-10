import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeExprVariable, makeEvalFn } from './graphExpr.js'

test('rewrites a lone non-x variable to x', () => {
  // The radioactive-decay model from the failing question, written in t.
  assert.equal(
    normalizeExprVariable('1200 * (1/3)^(t/5)'),
    '1200 * (1/3)^(x/5)',
  )
  assert.equal(normalizeExprVariable('2*n + 1'), '2*x + 1')
  assert.equal(normalizeExprVariable('P^2'), 'x^2')
})

test('leaves expressions already in x untouched', () => {
  assert.equal(normalizeExprVariable('x**2 - 4'), 'x**2 - 4')
  assert.equal(normalizeExprVariable('-x**2 + 3*x + 4'), '-x**2 + 3*x + 4')
})

test('does not touch Math functions or constants', () => {
  assert.equal(normalizeExprVariable('Math.sqrt(x)'), 'Math.sqrt(x)')
  assert.equal(normalizeExprVariable('exp(x) + PI'), 'exp(x) + PI')
  // A lone t alongside reserved names is still the only variable.
  assert.equal(normalizeExprVariable('exp(t/5)'), 'exp(x/5)')
})

test('does not rewrite scientific-notation number literals', () => {
  // 1e5 is a number, not a variable named e5.
  assert.equal(normalizeExprVariable('1e5 * x'), '1e5 * x')
})

test('bails out when several distinct variables appear', () => {
  // Ambiguous — leave it alone rather than guess.
  assert.equal(normalizeExprVariable('a*t + b'), 'a*t + b')
})

test('makeEvalFn evaluates a t-based decay curve', () => {
  const fn = makeEvalFn('1200 * (1/3)^(t/5)')
  assert.ok(fn)
  assert.equal(fn(0), 1200)
  // After 5 years, one third remains.
  assert.ok(Math.abs(fn(5) - 400) < 1e-9)
  // After 10 years, a ninth remains.
  assert.ok(Math.abs(fn(10) - 1200 / 9) < 1e-9)
})

test('makeEvalFn still handles caret and x expressions', () => {
  const fn = makeEvalFn('x^2 - 4')
  assert.equal(fn(0), -4)
  assert.equal(fn(3), 5)
})
