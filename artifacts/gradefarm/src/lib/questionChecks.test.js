import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkQuestion, reviewFlags, reviewState, isReviewed, needsAttention, reviewSummary, paperStatus } from './questionChecks.js'

const codes = (q) => checkQuestion(q).map(f => `${f.code}${f.where ? `:${f.where}` : ''}`)
const ext = (question, parts, extra = {}) => ({ id: 'x', question_type: 'extended', exam_section: 'B', question, parts, ...extra })
const part = (label, text, marks, extra = {}) => ({ label, text, marks, level: 1, ...extra })

test('a clean question has no flags', () => {
  const q = ext('Two students are calibrating a calorimeter.', [part('a', 'What temperature change did they observe?', 4), part('b', 'Justify the decision.', 1)], { review: { printed_marks: 5 } })
  assert.deepEqual(codes(q), [])
})

test('marks that do not add up to the printed total', () => {
  const q = ext('Stem.', [part('a', 'One.', 2), part('b', 'Two.', 2)], { review: { printed_marks: 9 } })
  assert.deepEqual(codes(q), ['marks_mismatch'])
  // No printed total recorded (papers loaded before this check): nothing to compare.
  assert.deepEqual(codes(ext('Stem.', [part('a', 'One.', 2)])), [])
})

test('text printed twice (paper 1, Q4 and Q7)', () => {
  // A labelled part repeating the stem's sentence.
  const q4 = ext('On the energy profile diagram above, sketch how the catalyst would alter the reaction pathway.',
    [part('a', 'On the energy profile diagram above, sketch how the catalyst would alter the reaction pathway.', 1)])
  assert.ok(codes(q4).includes('repeated_text:a'))
  // The same long sentence twice inside the stem.
  const s = 'The molecule C2H5ClO has multiple isomers and you should use it to show the difference.'
  assert.ok(codes(ext(`${s}\n${s}`, [part('', '', 6)])).includes('repeated_text'))
  // A single unlabelled part repeating the stem is printed once, so it isn't flagged.
  assert.deepEqual(codes(ext(s, [part('', s, 6)])), [])
})

test('a figure the text points to but that is missing (paper 1, Q5c)', () => {
  const q = ext('The functional groups are shown in Figure 21.', [
    part('a', 'Identify the nutrient group.', 3),
    part('c', 'Describe the chemistry of the major digestion product of the nutrient represented in Figure 22.', 2),
  ], { image_url: 'https://x/fig21.png' })
  // Figure 21 is on the question; part c's "Figure 22" has no figure on or before it… but the stem's does.
  // A question figure covers any reference, so only a reference with no figure anywhere is flagged.
  assert.deepEqual(codes(q), [])
  const none = ext('Consider the cell.', [part('a', 'Indicate the polarity of each electrode in the circles provided in the diagram above.', 1)])
  assert.deepEqual(codes(none), ['figure_missing:a'])
  assert.deepEqual(codes(ext('The graph below shows the results.', [part('a', 'Explain.', 2)])), ['figure_missing'])
  // A table written into the text is the "table below".
  assert.deepEqual(codes(ext('The table below lists the viscosities.\n\n| compound | cP |\n|---|---|\n| octane | 0.74 |', [part('', '', 5)])), [])
  // A figure on an earlier part covers a later "diagram above".
  const later = ext('Stem.', [part('a', 'Use the diagram below.', 1, { image_url: 'https://x/a.png' }), part('b', 'Label the diagram above.', 1)])
  assert.deepEqual(codes(later), [])
})

test('a reference to another question by number (paper 1, MC Q4)', () => {
  const mc = { id: 'm', question_type: 'mcq', exam_section: 'A', question: 'Use the following information to answer Questions 3 and 4.\n3.40 g of biscuit was burnt.', options: ['a', 'b', 'c', 'd'], answer_index: 0, image_url: 'https://x/y.png' }
  assert.deepEqual(codes(mc), ['other_question'])
  assert.match(checkQuestion(mc)[0].message, /"Questions 3 and 4"/)
  // "part a.iii" stays inside the question: fine.
  assert.deepEqual(codes(ext('Stem.', [part('a', 'Explain the voltage calculated in part a.iii.', 2)])), [])
})

test('page headers and footers in the text', () => {
  assert.deepEqual(codes(ext('A cell. SECTION B – Question 1 – continued', [part('a', 'Explain.', 1)])), ['furniture_in_text'])
  assert.deepEqual(codes(ext('Stem.', [part('a', 'Describe. TURN OVER', 1)])), ['furniture_in_text:a'])
  assert.deepEqual(codes(ext('Continued heating of the mixture gives a gas.', [part('a', 'Name it.', 1)])), [])
})

test('parts with marks but no question, or a question with no marks', () => {
  const q = ext('Stem.', [part('a', '', 2), part('b', 'Explain.', 0)])
  assert.deepEqual(codes(q), ['empty_part:a', 'no_marks:b'])
  // A part that only introduces its sub-parts has no marks of its own.
  const intro = ext('Stem.', [part('b', 'By using a catalyst…', 0), { ...part('i', 'Indicate.', 1), level: 2 }])
  assert.deepEqual(codes(intro), [])
})

test('multiple choice with too few or repeated options', () => {
  const mc = (options, answer_index = 0) => ({ question_type: 'mcq', exam_section: 'A', question: 'Which?', options, answer_index })
  assert.deepEqual(codes(mc(['a', 'b', 'c', 'd'])), [])
  assert.deepEqual(codes(mc(['a', 'b', 'c'])), ['options'])
  assert.deepEqual(codes(mc(['a', 'b', 'b', 'd'])), ['options'])
  assert.deepEqual(codes(mc(['a', 'b', 'c', 'd'], 4)), ['options'])
  assert.deepEqual(codes(mc('["a","b","c","d"]')), [])
})

test('review flags join what the ingest found in the crops with the text checks', () => {
  const q = ext('Stem.', [part('a', 'Use the graph below.', 1, { image_url: 'u' })], {
    review_status: 'pending',
    review: { flags: [{ code: 'figure_cut_off', where: 'a', message: 'Part a\'s figure may be cut off.' }] },
  })
  assert.deepEqual(reviewFlags(q).map(f => f.code), ['figure_cut_off'])
  assert.equal(reviewState(q), 'pending')
  assert.equal(isReviewed(q), false)
  assert.equal(reviewState({ ...q, review_status: 'approved' }), 'approved')
  // Loaded before reviews existed: live, as they were.
  assert.equal(reviewState({ question: 'x' }), 'approved')
  assert.equal(isReviewed({ question: 'x' }), true)
  assert.equal(isReviewed({ review_status: 'rejected' }), false)
})

test('which questions need an admin, and a paper\'s review summary', () => {
  const clean = (id, extra) => ({ id, question_type: 'mcq', exam_section: 'A', question: 'Which?', options: ['a', 'b', 'c', 'd'], answer_index: 1, ...extra })
  const bad = (id, extra) => clean(id, { options: ['a', 'b'], ...extra })
  const qs = [
    clean('1', { review_status: 'pending' }), bad('2', { review_status: 'pending' }),
    clean('3'), bad('4'), bad('5', { review_status: 'approved' }), bad('6', { review_status: 'rejected' }),
  ]
  assert.deepEqual(qs.map(q => needsAttention(q)), [true, true, false, true, false, false])
  assert.deepEqual(reviewSummary(qs), { pending: 2, flagged: 2, rejected: 1, attention: 3, cleanPending: ['1'] })
})

test('a paper is checked when every question is approved or rejected', () => {
  const q = (review_status, reviewed_at = null, reviewed_by = null) => ({ review_status, reviewed_at, reviewed_by })
  assert.deepEqual(paperStatus([]), { state: 'unchecked', checked: 0, total: 0, lastAt: null, lastBy: null })
  // Loaded before reviews existed, or waiting: not checked.
  assert.equal(paperStatus([q(null), q('pending')]).state, 'unchecked')
  const part = paperStatus([q('approved', '2026-11-18T01:00:00Z', 'u1'), q('pending'), q(null)])
  assert.deepEqual([part.state, part.checked, part.total], ['partway', 1, 3])
  const done = paperStatus([q('approved', '2026-11-18T01:00:00Z', 'u1'), q('rejected', '2026-11-18T03:00:00Z', 'u2'), q('approved', '2026-11-18T02:00:00Z', 'u1')])
  assert.deepEqual(done, { state: 'checked', checked: 3, total: 3, lastAt: '2026-11-18T03:00:00Z', lastBy: 'u2' })
})
