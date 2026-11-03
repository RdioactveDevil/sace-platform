import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chemTextParts } from './chemText.js'

const show = (s) => chemTextParts(s).map(([k, t]) => (k === 'sub' ? `_${t}` : k === 'sup' ? `^${t}` : t)).join('')

test('formulas get subscripts and charges get superscripts', () => {
  assert.equal(show('Concentration of Fe2+ (ppm)'), 'Concentration of Fe^2+ (ppm)')
  assert.equal(show('H2O'), 'H_2O')
  assert.equal(show('SO42-'), 'SO_4^2−')
  assert.equal(show('NH4+'), 'NH_4^+')
  assert.equal(show('NO3-'), 'NO_3^−')
  assert.equal(show('O2-'), 'O^2−')
  assert.equal(show('Cr2O72-'), 'Cr_2O_7^2−')
  assert.equal(show('[Fe2+]'), '[Fe^2+]')
  assert.equal(show('mol L^-1'), 'mol L^−1')
  assert.equal(show('Absorbance'), 'Absorbance')
  assert.equal(show('Time'), 'Time')
  assert.equal(show('A'), 'A')
})
