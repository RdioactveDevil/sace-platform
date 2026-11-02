import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizePlan } from './checkoutPlan.js'

test('a plan or a single subject becomes { subjects, interval }', () => {
  assert.deepEqual(normalizePlan({ curriculumId: 'a', name: 'Methods', level: 'Year 11' }), { subjects: [{ curriculumId: 'a', name: 'Methods', level: 'Year 11' }], interval: 'week' })
  assert.deepEqual(normalizePlan({ subjects: [{ curriculumId: 'a', name: 'A' }, { name: 'no id' }, { curriculumId: 'b', name: 'B', level: 'Year 6' }], interval: 'month' }),
    { subjects: [{ curriculumId: 'a', name: 'A', level: '' }, { curriculumId: 'b', name: 'B', level: 'Year 6' }], interval: 'month' })
  assert.equal(normalizePlan({ subjects: [] }), null)
  assert.equal(normalizePlan(null), null)
  assert.equal(normalizePlan({ subjects: [{ curriculumId: 'a' }], interval: 'year' }).interval, 'week')
})
