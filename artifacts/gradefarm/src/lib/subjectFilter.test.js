import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitsStudent, subjectBoard, subjectYear, stateLabel, stateBoard, schoolStage } from './subjectFilter.js'

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

test('a Year 9 student in Victoria sees VCE and Years 9 to 11 only', () => {
  const me = { state: 'VIC', year: 9 }
  assert.equal(fitsStudent(vceMethods12, me), true)
  assert.equal(fitsStudent(vceMethods34, me), false) // Year 12: more than 2 above
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

test("other states see neither board; outside Australia sees both", () => {
  assert.equal(fitsStudent(saceChem, { state: 'NSW', year: 11 }), false)
  assert.equal(fitsStudent(vceMethods12, { state: 'NSW', year: 11 }), false)
  assert.equal(fitsStudent(y10Maths, { state: 'NSW', year: 10 }), true)
  assert.equal(fitsStudent(saceChem, { state: 'INTL', year: 11 }), true)
  assert.equal(fitsStudent(vceMethods12, { state: 'INTL', year: 11 }), true)
})

test('years below theirs, or more than 2 above, are hidden', () => {
  assert.equal(fitsStudent(y10Maths, { state: 'SA', year: 8 }), true)
  assert.equal(fitsStudent(y10Maths, { state: 'SA', year: 7 }), false)
  assert.equal(fitsStudent(y6English, { state: 'SA', year: 7 }), false)
  assert.equal(fitsStudent(saceChem, { state: 'SA', year: 10 }), true)
  assert.equal(fitsStudent(saceChem, { state: 'SA', year: 9 }), false)
})

test('with no state or year nothing is hidden', () => {
  for (const s of [vceMethods12, saceChem, y6English, selective]) assert.equal(fitsStudent(s, {}), true)
  assert.equal(fitsStudent(saceChem, { year: 10 }), true) // no state: no board filter
  assert.equal(fitsStudent(vceMethods12, { state: 'SA' }), false)
})

test('state labels', () => {
  assert.equal(stateLabel('VIC'), 'Victoria')
  assert.equal(stateLabel('nope'), '')
})

test('subjects sort into primary, middle and high school', () => {
  assert.equal(schoolStage(y6English), 'primary')
  assert.equal(schoolStage(y10Maths), 'middle')
  assert.equal(schoolStage(selective), 'middle')
  assert.equal(schoolStage(vceMethods12), 'high')
  assert.equal(schoolStage(vceMethods34), 'high')
  assert.equal(schoolStage(saceChem), 'high')
  assert.equal(schoolStage({ name: 'SACE Specialist Mathematics Stage 1', stage: 'Year 11' }), 'high')
  assert.equal(schoolStage({ name: 'Year 7 Science', stage: 'Year 7' }), 'middle')
  assert.equal(schoolStage({ name: 'Reading', stage: 'Foundation' }), 'primary')
  assert.equal(schoolStage({ name: 'Debating', stage: '' }), 'other')
})

test('only Victoria and South Australia have a board of their own', () => {
  assert.equal(stateBoard('VIC'), 'vce')
  assert.equal(stateBoard('SA'), 'sace')
  assert.equal(stateBoard('NSW'), null)
  assert.equal(stateBoard(null), null)
})
