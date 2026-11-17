import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, formatResult, CalcError } from './calculator.js'

const ev = (s, o) => evaluate(s, o)
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`)

test('order of operations and brackets', () => {
  assert.equal(ev('2+3*4'), 14)
  assert.equal(ev('(2+3)*4'), 20)
  assert.equal(ev('2^3^2'), 512)
  assert.equal(ev('-2^2'), -4)
  assert.equal(ev('2^-1'), 0.5)
  assert.equal(ev('10-4-3'), 3)
  assert.equal(ev('12/4/3'), 1)
  assert.equal(ev('3 × 4 ÷ 2 − 1'), 5)
})

test('implied multiplication', () => {
  near(ev('2π'), 2 * Math.PI)
  assert.equal(ev('3(4+1)'), 15)
  assert.equal(ev('(1+2)(3)'), 9)
  assert.equal(ev('2sin(30)'), 1)
  assert.equal(ev('5Ans', { ans: 2 }), 10)
  assert.equal(ev('ans + 1', { ans: 2 }), 3)
  near(ev('2PI'), 2 * Math.PI)
})

test('functions, in degrees by default, with or without brackets', () => {
  assert.equal(ev('sin(30)'), 0.5)
  assert.equal(ev('sin 30'), 0.5)
  assert.equal(ev('cos(60)'), 0.5)
  assert.equal(ev('tan(45)'), 1)
  near(ev('sin⁻¹(0.5)'), 30)
  near(ev('asin(1)'), 90)
  near(ev('sin(PI/2)'.replace('PI', 'π'), { deg: false }), 1)
  assert.throws(() => ev('tan(90)'), CalcError)
  assert.equal(ev('√16'), 4)
  assert.equal(ev('√(9)+1'), 4)
  assert.equal(ev('∛27'), 3)
  assert.equal(ev('log(1000)'), 3)
  near(ev('log(8, 2)'), 3)
  assert.equal(ev('ln(e)'), 1)
  assert.equal(ev('nCr(5, 2)'), 10)
  assert.equal(ev('nPr(5, 2)'), 20)
})

test('postfix operators and scientific notation', () => {
  assert.equal(ev('5!'), 120)
  assert.equal(ev('50%'), 0.5)
  assert.equal(ev('3²'), 9)
  assert.equal(ev('2³'), 8)
  assert.equal(ev('4⁻¹'), 0.25)
  near(ev('6.02E23 * 2'), 1.204e24)
  near(ev('1.6E-19'), 1.6e-19)
  near(ev('0.40 * 2.5 * 44.0'), 44)
})

test('chemistry-style working', () => {
  near(ev('-log(1.0E-3)'), 3)
  near(ev('10^-2.5'), 0.0031622776601683794)
  near(ev('8.314 * 298 / 100'), 24.77572)
})

test('bad input is a syntax error, undefined maths a math error, never code', () => {
  for (const s of ['', '2+', '*3', 'alert(1)', '2..3', '2 3', 'constructor', 'x+1']) assert.throws(() => ev(s), /Syntax error/, s)
  for (const s of ['1/0', 'sqrt(-1)', '(-1)!', '171!', 'ln(0)']) assert.throws(() => ev(s), /Math error/, s)
  assert.equal(ev('(2+3'), 5) // a missing last bracket is closed for them
})

test('results show 10 significant figures, and scientific notation when large or small', () => {
  assert.equal(formatResult(0.1 + 0.2).text, '0.3')
  assert.equal(formatResult(1 / 3).text, '0.3333333333')
  assert.deepEqual(formatResult(6.022e23), { text: '6.022E23', mantissa: '6.022', exponent: '23' })
  assert.deepEqual(formatResult(1.6e-19), { text: '1.6E-19', mantissa: '1.6', exponent: '-19' })
  assert.equal(formatResult(0).text, '0')
  assert.equal(formatResult(-2500).text, '-2500')
})
