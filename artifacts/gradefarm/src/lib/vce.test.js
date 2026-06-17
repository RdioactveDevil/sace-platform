import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { gradeResponse } from './questionTypes.js'
import { VCE_SUBJECTS, VCE_LEVEL_LABEL, vceBuiltInSubjects, vceCurriculaSeed } from './vce.js'

function correctResponse(q) {
  switch (q.question_type) {
    case 'numeric': return String(q.answer)
    case 'order': return q.items
    case 'multi_select': return q.answer_indices
    default: return q.answer_index
  }
}

describe('vce content', () => {
  test('ships the four core Units 3 & 4 subjects', () => {
    assert.deepEqual(VCE_SUBJECTS.map((s) => s.id), ['chemistry', 'physics', 'biology', 'methods'])
  })

  test('all question ids are unique and every subject has questions', () => {
    const ids = new Set()
    for (const s of VCE_SUBJECTS) {
      assert.ok(s.questions.length >= 5, `${s.id} should have several questions`)
      for (const q of s.questions) {
        assert.ok(!ids.has(q.id), `duplicate question id ${q.id}`)
        ids.add(q.id)
      }
    }
  })

  test('every question grades its own answer key as correct', () => {
    for (const s of VCE_SUBJECTS) {
      for (const q of s.questions) {
        assert.ok(gradeResponse(q, correctResponse(q)), `${q.id} answer key should grade as correct`)
      }
    }
  })

  test('every question maps to a declared topic + subtopic with valid difficulty', () => {
    for (const s of VCE_SUBJECTS) {
      const topicMap = new Map(s.topics.map((t) => [t.name, t.subtopics]))
      for (const q of s.questions) {
        assert.ok(topicMap.has(q.topic), `${q.id} topic "${q.topic}" not declared on ${s.id}`)
        assert.ok(topicMap.get(q.topic).includes(q.subtopic), `${q.id} subtopic "${q.subtopic}" not under its topic`)
        assert.ok(Number.isInteger(q.difficulty) && q.difficulty >= 1 && q.difficulty <= 5, `${q.id} bad difficulty`)
      }
    }
  })
})

describe('vce built-in subjects + seed', () => {
  test('built-in subjects are tagged at Units 3 & 4', () => {
    const subs = vceBuiltInSubjects()
    assert.equal(subs.length, 4)
    assert.ok(subs.every((s) => s.level === VCE_LEVEL_LABEL && s.name.startsWith('VCE')))
  })

  test('seed exposes one curriculum per subject with subject-tagged questions', () => {
    const seed = vceCurriculaSeed()
    assert.equal(seed.length, 4)
    for (const c of seed) {
      assert.ok(c.name && c.topics.length > 0)
      assert.ok(c.questions.every((q) => q.subject === c.name))
    }
  })
})
