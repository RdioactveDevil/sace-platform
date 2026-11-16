import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupLoadedPapers } from './examPapers.js'

const q = (id, source, section, n, extra = {}) => ({ id, source, exam_section: section, source_question: n, question_type: section === 'B' ? 'extended' : 'mcq', created_at: '2026-11-01T00:00:00Z', ...extra })

test('loaded questions group into papers in exam order, newest paper first', () => {
  const papers = groupLoadedPapers([
    q('a10', 'VCAA 2023 Exam 2', 'A', '10', { source_year: 2023 }),
    q('a2', 'VCAA 2023 Exam 2', 'A', '2', { source_year: 2023 }),
    q('b1', 'VCAA 2023 Exam 2', 'B', '1', { source_year: 2023, total_marks: 9 }),
    q('t1', 'Insight 2024 Trial Exam 2', 'A', '1', { source_year: 2024, source_kind: 'commercial' }),
  ])
  assert.deepEqual(papers.map(p => p.label), ['Insight 2024 Trial Exam 2', 'VCAA 2023 Exam 2'])
  const vcaa = papers[1]
  assert.deepEqual(vcaa.a.map(x => x.id), ['a2', 'a10'])
  assert.deepEqual(vcaa.b.map(x => x.id), ['b1'])
  assert.equal(vcaa.marks, 11)
  assert.equal(vcaa.kind, 'past')
  assert.equal(papers[0].kind, 'trial')
})
