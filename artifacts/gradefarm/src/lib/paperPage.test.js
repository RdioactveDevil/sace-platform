import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paperPath, paperLabelFromPath, draftQuestion, changedFigures, orderPapers, originalNumber, previewSrc, isPendingImage } from './paperPage.js'

test('a paper has its own address, and the label comes back out of it', () => {
  assert.equal(paperPath('c1', 'NEAP 2023 Trial Exam'), '/admin/subjects/c1/papers/NEAP%202023%20Trial%20Exam')
  assert.equal(paperPath('c1', 'A+ 2024 Trial Exam / 2'), '/admin/subjects/c1/papers/A%2B%202024%20Trial%20Exam%20%2F%202')
  assert.equal(paperLabelFromPath('A%2B%202024%20Trial%20Exam%20%2F%202'), 'A+ 2024 Trial Exam / 2')
  assert.equal(paperLabelFromPath('%E0%A4%A'), null)
})

test('the preview numbers a question as on the original paper', () => {
  assert.equal(originalNumber({ source_question: '4' }), '4')
  assert.equal(originalNumber({ source_question: 'Q12' }), '12')
  assert.equal(originalNumber({}), '?')
})

test('an unsaved edit is what the preview shows', () => {
  const mc = { id: 'm', question_type: 'mcq', exam_section: 'A', question: 'Old?', options: ['a', 'b', 'c', 'd'], answer_index: 0, image_url: 'https://x/old.png', source_question: '3' }
  const d = draftQuestion(mc, { question: 'New?', options: ['w', 'x', 'y', 'z'], answerIndex: 2, solution: 's', image_url: null })
  assert.deepEqual([d.id, d.question, d.options, d.answer_index, d.solution, d.image_url, d.source_question], ['m', 'New?', ['w', 'x', 'y', 'z'], 2, 's', null, '3'])
  // No figure in the draft (an editor without figure slots): the saved figure stays.
  assert.equal(draftQuestion(mc, { question: 'New?', options: ['a', 'b'], answerIndex: 0, solution: '' }).image_url, 'https://x/old.png')

  const ext = { id: 'e', question_type: 'extended', exam_section: 'B', question: 'Stem', parts: [{ label: 'a', text: 'x', marks: 2 }], total_marks: 2 }
  const de = draftQuestion(ext, { question: 'New stem', parts: [{ label: 'a', text: 'y', marks: 3, image_url: 'blob:abc#/exam-papers/' }, { label: 'b', text: 'z', marks: 1 }], image_url: 'https://x/q.png' })
  assert.deepEqual([de.question, de.total_marks, de.parts[0].image_url, de.image_url], ['New stem', 4, 'blob:abc#/exam-papers/', 'https://x/q.png'])
  assert.equal(draftQuestion(ext, null), ext)
})

test('the figures an edit changed, by where they are', () => {
  const q = { image_url: 'https://x/q.png', parts: [{ label: 'a', image_url: 'https://x/a.png' }, { label: 'b', image_url: null }] }
  assert.deepEqual(changedFigures(q, { image_url: 'https://x/q.png', parts: [{ label: 'a', image_url: 'https://x/a.png' }, { label: 'b', image_url: null }] }), [])
  assert.deepEqual(changedFigures(q, { image_url: null, parts: [{ label: 'a', image_url: 'blob:1' }, { label: 'b', image_url: 'blob:2' }] }), ['', 'a', 'b'])
  // An editor without figure slots doesn't change the question's figure.
  assert.deepEqual(changedFigures(q, { parts: [{ label: 'a', image_url: 'https://x/a.png' }, { label: 'b', image_url: null }] }), [])
})

test('an unsaved crop previews at the size it will print', () => {
  // The printed paper sizes images from a path with /exam-papers/ at 3 px per point.
  assert.equal(previewSrc('blob:http://x/1', 'crop'), 'blob:http://x/1#/exam-papers/')
  assert.equal(previewSrc('blob:http://x/2', 'upload'), 'blob:http://x/2')
  assert.equal(isPendingImage('blob:http://x/1#/exam-papers/'), true)
  assert.equal(isPendingImage('https://x/a.png'), false)
  assert.equal(isPendingImage(null), false)
})

test('unfinished papers first, and the filter', () => {
  const p = (key, state) => ({ key, status: { state } })
  const papers = [p('a', 'checked'), p('b', 'unchecked'), p('c', 'partway'), p('d', 'checked'), p('e', 'unchecked')]
  assert.deepEqual(orderPapers(papers, 'all').map(x => x.key), ['c', 'b', 'e', 'a', 'd'])
  assert.deepEqual(orderPapers(papers, 'unchecked').map(x => x.key), ['b', 'e'])
  assert.deepEqual(orderPapers(papers, 'checked').map(x => x.key), ['a', 'd'])
  assert.deepEqual(orderPapers(papers, 'partway').map(x => x.key), ['c'])
})
