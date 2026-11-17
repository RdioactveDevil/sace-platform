import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chemTextParts, labelParts } from './chemText.js'

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

// Lesson figures are written by the model, which often puts LaTeX in labels.
// SVG can't run KaTeX, so the markup is turned into sub/superscripts here.
test('LaTeX in a label becomes sub/superscripts, never raw $ or backslashes', () => {
  assert.equal(show('CO$_2$'), 'CO_2')
  assert.equal(show('CH$_4$'), 'CH_4')
  assert.equal(show('N$_2$O'), 'N_2O')
  assert.equal(show('$\\ce{CO2}$'), 'CO_2')
  assert.equal(show('$\\ce{SO4^2-}$'), 'SO_4^2−')
  assert.equal(show('Rate (mol L$^{-1}$ s$^{-1}$)'), 'Rate (mol L^−1 s^−1)')
  assert.equal(show('$\\Delta H$ (kJ mol$^{-1}$)'), 'ΔH (kJ mol^−1)')
  assert.equal(show('Temperature ($^\\circ$C)'), 'Temperature (°C)')
  assert.equal(show('$\\text{Mass}$ (g)'), 'Mass (g)')
  assert.equal(show('$x^2$'), 'x^2')
})

test('plain labels keep the LaTeX conversion but not chemistry guesses', () => {
  const plain = (s) => labelParts(s).map(([k, t]) => (k === 'sub' ? `_${t}` : k === 'sup' ? `^${t}` : t)).join('')
  assert.equal(plain('CO$_2$'), 'CO_2')
  assert.equal(plain('Q1'), 'Q1')
  assert.equal(plain('$\\frac{1}{2}$'), '1/2')
  assert.equal(plain('Year 10'), 'Year 10')
})
