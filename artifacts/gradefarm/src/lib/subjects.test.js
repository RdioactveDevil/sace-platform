import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCanonicalCurriculumName, stripLevelFromTitle } from './subjects.js'

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
