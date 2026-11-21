import { test } from 'node:test'
import assert from 'node:assert/strict'
import { curriculumToYearGroups, dbDiagnosticSubject } from './diagnosticSubjects.js'

const ALL = ['primary', 'junior', 'stage1', 'stage2']

test('VCE unit pairs map to Year 11 and Year 12', () => {
  for (const l of ['Units 1/2', 'Units 1 & 2', 'Unit 1/2', 'units 1 and 2', 'VCE Units 1-2']) assert.deepEqual(curriculumToYearGroups(l), ['stage1'], l)
  for (const l of ['Units 3/4', 'VCE Units 3 and 4', 'Units 3&4']) assert.deepEqual(curriculumToYearGroups(l), ['stage2'], l)
})

test('stage and year labels keep their mapping', () => {
  assert.deepEqual(curriculumToYearGroups('Stage 2'), ['stage2'])
  assert.deepEqual(curriculumToYearGroups('Year 11'), ['stage1'])
  assert.deepEqual(curriculumToYearGroups('Year 9'), ['junior'])
  assert.deepEqual(curriculumToYearGroups('Year 10'), ['junior'])
})

test('unrecognised or empty labels show under every year level', () => {
  assert.deepEqual(curriculumToYearGroups('IB HL'), ALL)
  assert.deepEqual(curriculumToYearGroups(''), ALL)
  assert.deepEqual(curriculumToYearGroups(undefined), ALL)
})

test('a database curriculum keeps its topic names and id', () => {
  const s = dbDiagnosticSubject({ id: 'c1', name: 'VCE Mathematical Methods', level_label: 'Units 1/2', topicNames: ['Functions', 'Calculus'] })
  assert.deepEqual(s, { id: 'db_c1', curriculumId: 'c1', name: 'VCE Mathematical Methods', yearGroups: ['stage1'], topics: ['Functions', 'Calculus'], isWriting: false, fromDb: true })
})
