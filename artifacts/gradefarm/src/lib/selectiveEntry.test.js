import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { gradeResponse } from './questionTypes.js'
import {
  SELECTIVE_COMPONENTS,
  WRITING_TASKS,
  getComponent,
  buildPracticePaper,
  buildMockPaper,
} from './selectiveEntry.js'

// The intended correct response for a question, derived from its answer key.
function correctResponse(q) {
  switch (q.question_type) {
    case 'numeric': return String(q.answer)
    case 'order': return q.items
    case 'multi_select': return q.answer_indices
    default: return q.answer_index // mcq
  }
}

describe('selective entry content', () => {
  test('has the four multiple-choice components', () => {
    assert.deepEqual(
      SELECTIVE_COMPONENTS.map((c) => c.id),
      ['reading', 'verbal', 'numerical', 'maths'],
    )
  })

  test('every component has questions with unique ids', () => {
    const ids = new Set()
    for (const c of SELECTIVE_COMPONENTS) {
      assert.ok(c.questions.length >= 5, `${c.id} should have several questions`)
      for (const q of c.questions) {
        assert.ok(!ids.has(q.id), `duplicate question id ${q.id}`)
        ids.add(q.id)
      }
    }
  })

  test('every question grades its own answer key as correct', () => {
    for (const c of SELECTIVE_COMPONENTS) {
      for (const q of c.questions) {
        assert.ok(
          gradeResponse(q, correctResponse(q)),
          `${q.id} answer key should grade as correct`,
        )
      }
    }
  })

  test('mcq answer_index is within range', () => {
    for (const c of SELECTIVE_COMPONENTS) {
      for (const q of c.questions) {
        if ((q.question_type ?? 'mcq') === 'mcq') {
          assert.ok(
            q.answer_index >= 0 && q.answer_index < q.options.length,
            `${q.id} answer_index out of range`,
          )
        }
      }
    }
  })
})

describe('paper builders', () => {
  test('practice paper is one timed section for the component', () => {
    const paper = buildPracticePaper('verbal')
    assert.equal(paper.sections.length, 1)
    assert.equal(paper.sections[0].id, 'verbal')
    assert.ok(paper.sections[0].durationSec > 0)
    assert.equal(paper.sections[0].questions.length, getComponent('verbal').questions.length)
  })

  test('unknown component yields null', () => {
    assert.equal(buildPracticePaper('nope'), null)
    assert.equal(getComponent('nope'), null)
  })

  test('mock paper has one section per component, all timed', () => {
    const paper = buildMockPaper()
    assert.equal(paper.sections.length, SELECTIVE_COMPONENTS.length)
    for (const s of paper.sections) {
      assert.ok(s.durationSec > 0)
      assert.ok(s.questions.length > 0)
    }
  })
})

describe('writing tasks', () => {
  test('expose creative and persuasive tasks on the selective_vic subject', () => {
    assert.deepEqual(WRITING_TASKS.map((w) => w.id), ['vse_creative', 'vse_persuasive'])
    assert.ok(WRITING_TASKS.every((w) => w.subject === 'selective_vic'))
  })
})
