import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isEnglishOnly, shortAnswerRequests, pickShortAnswers, buildTimedTest } from './timedDiagnostic.js'

const sa = (marks, topic, difficulty = 'moderate', n = Math.random()) => ({ type: 'marked', marks, topic, difficulty, question: `q${n}`, id: 0 })
const sum = qs => qs.reduce((s, q) => s + q.marks, 0)

test('isEnglishOnly matches the server rule', () => {
  assert.equal(isEnglishOnly([{ name: 'English' }]), true)
  assert.equal(isEnglishOnly([{ name: 'Creative Writing' }]), true)
  assert.equal(isEnglishOnly([{ name: 'Mathematics' }]), false)
  assert.equal(isEnglishOnly([{ name: 'English' }, { name: 'Physics' }]), false)
})

test('pickShortAnswers hits the target and covers each topic', () => {
  const marks = [6, 5, 5, 4, 4, 4, 3, 3, 2]
  const topics = ['A', 'A', 'B', 'B', 'C', 'C', 'A', 'B', 'C']
  const c = marks.map((m, i) => sa(m, topics[i], i % 2 ? 'exam' : 'moderate', i))
  const picked = pickShortAnswers(c)
  assert.equal(sum(picked), 30)
  assert.deepEqual([...new Set(picked.map(q => q.topic))].sort(), ['A', 'B', 'C'])
  const firstExam = picked.findIndex(q => q.difficulty === 'exam')
  assert.ok(picked.slice(firstExam).every(q => q.difficulty === 'exam'))
})

test('pickShortAnswers returns null when impossible', () => {
  assert.equal(pickShortAnswers(Array.from({ length: 8 }, (_, i) => sa(4, 'A', 'moderate', i))), null)
})

test('shortAnswerRequests covers all topics', () => {
  const topics = ['T1', 'T2', 'T3'].map(t => ({ topic: t, subtopicIds: [1, 2, 3, 4].map(i => `${t}-s${i}`) }))
  const r = shortAnswerRequests({ curriculumId: 'c', topics }, 5)
  assert.equal(r.length, 5)
  assert.deepEqual([...new Set(r.map(x => x.topic))].sort(), ['T1', 'T2', 'T3'])
  assert.ok(r.every(x => x.count === 3 && x.subtopicId))
})

const mcq = (i, difficulty) => ({ type: 'multiple_choice', marks: 1, difficulty, question: `m${i}`, id: 0 })

test('buildTimedTest survives a failed request and renumbers', async () => {
  let calls = 0
  const progress = []
  const out = await buildTimedTest(
    { yearLevel: 'Year 9', subject: { name: 'Maths', topics: [] }, scopeTopics: ['A', 'B', 'C'] },
    {
      generateMcq: async () => ({ questions: Array.from({ length: 22 }, (_, i) => mcq(i, ['exam', 'easy', 'moderate'][i % 3])) }),
      generateShortAnswers: async ({ topic }) => {
        if (++calls === 2) throw new Error('boom')
        return { questions: [sa(4, topic, 'moderate'), sa(5, topic, 'exam'), sa(3, topic, 'moderate')] }
      },
      onProgress: p => progress.push(p),
    })
  assert.equal(out.length - out.filter(q => q.type === 'marked').length, 20)
  assert.equal(sum(out.filter(q => q.type === 'marked')), 30)
  assert.deepEqual(out.map(q => q.id), out.map((_, i) => i + 1))
  const rank = { easy: 0, moderate: 1, exam: 2 }
  const mc = out.slice(0, 20)
  assert.ok(mc.every((q, i) => i === 0 || rank[mc[i - 1].difficulty] <= rank[q.difficulty]))
  assert.ok(progress.length > 2)
  assert.equal(progress.at(-1).mcq, 'done')
  assert.equal(progress.at(-1).shortDone, progress.at(-1).shortTotal)
})

test('buildTimedTest throws the exact message when 30 marks never appear', async () => {
  await assert.rejects(
    buildTimedTest(
      { yearLevel: 'Year 9', subject: { name: 'Maths' }, scopeTopics: ['A'] },
      {
        generateMcq: async () => ({ questions: Array.from({ length: 20 }, (_, i) => mcq(i, 'easy')) }),
        generateShortAnswers: async () => ({ questions: [sa(4, 'A')] }),
      }),
    { message: "Couldn't put together 30 marks of short answers. Try again." })
})
