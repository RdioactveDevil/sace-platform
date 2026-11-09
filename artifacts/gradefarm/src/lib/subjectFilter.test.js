import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitsStudent, subjectBoard, subjectYear, stateLabel } from './subjectFilter.js'

const vceMethods12 = { name: 'VCE Mathematical Methods Units 1 and 2', stage: 'Year 11' }
const vceMethods34 = { name: 'VCE Mathematical Methods', stage: 'Units 3 & 4' }
const saceChem = { name: 'Chemistry Stage 2', stage: 'Stage 2' }
const y6English = { name: 'Year 6 English', stage: 'Year 6' }
const y10Maths = { name: 'Year 10 Mathematics', stage: 'Year 10' }
const selective = { name: 'Selective Mathematics', stage: 'Selective Entry' }

test('boards and years are read from the subject', () => {
  assert.equal(subjectBoard(vceMethods12), 'vce')
  assert.equal(subjectBoard(saceChem), 'sace')
  assert.equal(subjectBoard(y6English), null)
  assert.equal(subjectYear(vceMethods12), 11)
  assert.equal(subjectYear(vceMethods34), 12)
  assert.equal(subjectYear({ name: 'VCE Physics', stage: 'Units 1 & 2' }), 11)
  assert.equal(subjectYear(saceChem), 12)
  assert.equal(subjectYear(y6English), 6)
  assert.equal(subjectYear(selective), null)
})

test('a Year 9 student in Victoria sees VCE and Year 9+ subjects only', () => {
  const me = { state: 'VIC', year: 9 }
  assert.equal(fitsStudent(vceMethods12, me), true)
  assert.equal(fitsStudent(vceMethods34, me), true)
  assert.equal(fitsStudent(y10Maths, me), true)
  assert.equal(fitsStudent(saceChem, me), false)
  assert.equal(fitsStudent(y6English, me), false)
  assert.equal(fitsStudent(selective, me), true)
})

test('a South Australian student is not shown VCE subjects', () => {
  const me = { state: 'SA', year: 11 }
  assert.equal(fitsStudent(saceChem, me), true)
  assert.equal(fitsStudent(vceMethods12, me), false)
})

test('other states see both boards; years far above are hidden', () => {
  assert.equal(fitsStudent(saceChem, { state: 'NSW', year: 11 }), true)
  assert.equal(fitsStudent(vceMethods12, { state: 'NSW', year: 11 }), true)
  assert.equal(fitsStudent(saceChem, { state: 'NSW', year: 6 }), false)
})

test('with no state or year nothing is hidden', () => {
  for (const s of [vceMethods12, saceChem, y6English, selective]) assert.equal(fitsStudent(s, {}), true)
  assert.equal(fitsStudent(saceChem, { year: 9 }), true)
  assert.equal(fitsStudent(vceMethods12, { state: 'SA' }), false)
})

test('state labels', () => {
  assert.equal(stateLabel('VIC'), 'Victoria')
  assert.equal(stateLabel('nope'), '')
})
