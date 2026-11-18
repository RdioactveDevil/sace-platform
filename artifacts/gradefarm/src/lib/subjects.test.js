import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCanonicalCurriculumName, formatSubjectLabel, stripLevelFromTitle, usesMathAnswers } from './subjects.js'

test('does not repeat a year level typed into the title', () => {
  assert.equal(buildCanonicalCurriculumName('Year 6 English', 'Year 6'), 'Year 6 English')
  assert.equal(buildCanonicalCurriculumName('English Year 6', 'Year 6'), 'Year 6 English')
  assert.equal(buildCanonicalCurriculumName('year6 Mathematics', 'Year 6'), 'Year 6 Mathematics')
  assert.equal(buildCanonicalCurriculumName('English', 'Year 6'), 'Year 6 English')
})

test('does not repeat a SACE stage typed into the title', () => {
  assert.equal(buildCanonicalCurriculumName('Chemistry Stage 2', 'Stage 2'), 'Chemistry Stage 2')
  assert.equal(buildCanonicalCurriculumName('SACE Stage 2 Chemistry', 'Stage 2'), 'Chemistry Stage 2')
  assert.equal(buildCanonicalCurriculumName('Chemistry (Stage 2)', 'Stage 2'), 'Chemistry Stage 2')
})

test('only strips the matching level and never empties the title', () => {
  assert.equal(stripLevelFromTitle('Year 10 Maths', 'Year 6'), 'Year 10 Maths')
  assert.equal(stripLevelFromTitle('Year 6', 'Year 6'), 'Year 6')
  assert.equal(stripLevelFromTitle('Year 60 Club', 'Year 6'), 'Year 60 Club')
})

test('the maths answer box follows the subject switch, else maths subjects by name', () => {
  assert.equal(usesMathAnswers({ name: 'VCE Mathematical Methods Units 3 and 4', features: {} }), true)
  assert.equal(usesMathAnswers({ name: 'SACE Physics Stage 2', features: {} }), false)
  assert.equal(usesMathAnswers({ name: 'SACE Physics Stage 2', features: { math_answers: true } }), true)
  assert.equal(usesMathAnswers({ name: 'SACE Specialist Mathematics Stage 2', features: { math_answers: false } }), false)
  assert.equal(usesMathAnswers(null, 'Year 9 Mathematics'), true)
})

test('a subject is labelled by its name alone, as written in Admin', () => {
  assert.equal(formatSubjectLabel({ name: 'SACE Chemistry Stage 2', stage: 'Year 12' }), 'SACE Chemistry Stage 2')
  assert.equal(formatSubjectLabel({ name: 'VCE Mathematical Methods Units 1 and 2', stage: 'Year 11' }), 'VCE Mathematical Methods Units 1 and 2')
  assert.equal(formatSubjectLabel({ name: '  Year 6 English ', stage: 'Year 6' }), 'Year 6 English')
  assert.equal(formatSubjectLabel({}), '')
})
