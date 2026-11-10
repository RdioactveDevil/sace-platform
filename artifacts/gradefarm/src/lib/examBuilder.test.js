import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sectionOf, partsOf, marksOf, sourceLabel, bankSummary, examPool, pickExam, swapCandidate,
  examTotals, writingMinutes, formatMinutes, subjectCode, paginate, linesForMarks, BANK_SOURCE,
  splitAtFigure, wantsDrawing, figureSizeMm,
} from './examBuilder.js'

const mc = (id, extra = {}) => ({ id, question: `MC ${id}`, options: ['a', 'b', 'c', 'd'], answer_index: 0, question_type: 'mcq', topic: 'T1', ...extra })
const ext = (id, parts, extra = {}) => ({ id, question: `EXT ${id}`, question_type: 'extended', topic: 'T1', parts, ...extra })
const p = (label, marks) => ({ label, text: `part ${label}`, marks })

test('sections, parts and marks', () => {
  assert.equal(sectionOf(mc('1')), 'A')
  assert.equal(sectionOf(ext('2', [p('a', 2)])), 'B')
  assert.equal(sectionOf({ question: 'x', question_type: 'marked', total_marks: 3 }), 'B')
  assert.equal(sectionOf({ question: 'x', question_type: 'hotspot' }), null)
  assert.equal(sectionOf(mc('1', { exam_section: 'B' })), 'B')
  const e = ext('3', [p('a', 2), { label: 'b.', text: 't', marks: 3, level: 2 }, { label: '(1)', text: 't', marks: 1, level: 3 }])
  assert.deepEqual(partsOf(e).map(x => [x.label, x.marks, x.level]), [['a', 2, 1], ['b', 3, 2], ['1', 1, 3]])
  assert.equal(marksOf(e), 6)
  assert.equal(marksOf(mc('4')), 1)
  assert.equal(marksOf({ question: 'x', question_type: 'marked', total_marks: 4 }), 4)
  assert.deepEqual(partsOf({ question: 'x', question_type: 'numeric' }).map(x => [x.label, x.marks]), [['', 1]])
})

test('source labels and bank summary', () => {
  const qs = [
    mc('1', { source: 'VCAA 2023 Exam 2', source_kind: 'official', source_publisher: 'VCAA', source_year: 2023, source_paper: 'Exam 2', source_question: '4' }),
    mc('2', { source: 'NEAP 2024 Trial Exam 2', source_kind: 'commercial', source_publisher: 'NEAP', source_year: 2024, source_paper: 'Exam 2' }),
    mc('3', { source: 'VCAA 2024 Exam 1', source_kind: 'official', source_year: 2024, source_paper: 'Exam 1' }),
    mc('4'),
  ]
  assert.equal(sourceLabel(qs[0]), 'VCAA 2023 Exam 2, Q4')
  assert.equal(sourceLabel(qs[3]), BANK_SOURCE)
  const s = bankSummary(qs)
  assert.deepEqual(s.papers.map(x => x.name), ['', 'Exam 1', 'Exam 2'])
  assert.deepEqual(s.sources.map(x => [x.key, x.kind]), [
    ['VCAA 2024 Exam 1', 'official'], ['VCAA 2023 Exam 2', 'official'], ['NEAP 2024 Trial Exam 2', 'commercial'], [BANK_SOURCE, 'bank'],
  ])
})

test('pool keeps papers apart and filters by source and topic', () => {
  const qs = [
    mc('1', { source: 'VCAA 2023 Exam 2', source_paper: 'Exam 2' }),
    mc('2', { source: 'VCAA 2023 Exam 1', source_paper: 'Exam 1' }),
    mc('3'),
    ext('4', [p('a', 3)], { source: 'VCAA 2023 Exam 2', source_paper: 'Exam 2', topic: 'T2' }),
    mc('5', { question: 'MC 1', source: 'X' }),
  ]
  const pool = examPool(qs, { paper: 'Exam 2' })
  assert.deepEqual(pool.A.map(q => q.id), ['1', '3'])
  assert.deepEqual(pool.B.map(q => q.id), ['4'])
  assert.deepEqual(examPool(qs, { sources: [BANK_SOURCE] }).A.map(q => q.id), ['3'])
  assert.deepEqual(examPool(qs, { topics: ['T2'] }).B.map(q => q.id), ['4'])
})

test('picking: MC count, Section B marks close to target, real exams first, course order', () => {
  const A = [...Array.from({ length: 10 }, (_, i) => mc(`a${i}`, { source: 'VCAA', topic: i % 2 ? 'T2' : 'T1' })), ...Array.from({ length: 30 }, (_, i) => mc(`g${i}`, { topic: 'T1' }))]
  const B = [ext('b1', [p('a', 5), p('b', 5)]), ext('b2', [p('a', 12)]), ext('b3', [p('a', 8)]), ext('b4', [p('a', 15)]), ext('b5', [p('a', 9)])]
  const pool = { A, B }
  const exam = pickExam(pool, { mcCount: 10, bMarks: 30, seed: 3 })
  assert.equal(exam.A.length, 10)
  assert.ok(exam.A.every(id => id.startsWith('a')), 'real exam questions come first')
  const bMarks = exam.B.map(id => marksOf(B.find(q => q.id === id))).reduce((s, m) => s + m, 0)
  assert.ok(bMarks >= 25 && bMarks <= 35, `section B marks ${bMarks}`)
  const topics = exam.A.map(id => A.find(q => q.id === id).topic)
  assert.deepEqual(topics, [...topics].sort())
  assert.deepEqual(pickExam(pool, { mcCount: 10, bMarks: 30, seed: 3 }), exam)
  assert.deepEqual(pickExam(pool, { mcCount: 0, bMarks: 0 }), { A: [], B: [] })
})

test('swapping finds another question for the slot', () => {
  const pool = { A: [mc('1', { topic: 'T1' }), mc('2', { topic: 'T2' }), mc('3', { topic: 'T1' })], B: [] }
  assert.equal(swapCandidate(pool, pool.A[0], ['1']).id, '3')
  assert.equal(swapCandidate(pool, pool.A[0], ['1', '3']).id, '2')
  assert.equal(swapCandidate(pool, pool.A[0], ['1', '2', '3']), null)
})

test('totals, time and codes', () => {
  const exam = { A: [mc('1'), mc('2')], B: [ext('3', [p('a', 4), p('b', 6)])] }
  assert.deepEqual(examTotals(exam), { aCount: 2, aMarks: 2, bCount: 1, bMarks: 10, total: 12 })
  assert.equal(writingMinutes(80), 120)
  assert.equal(writingMinutes(40), 60)
  assert.equal(formatMinutes(120), '2 hours')
  assert.equal(formatMinutes(75), '1 hour 15 minutes')
  assert.equal(subjectCode('VCE Mathematical Methods Units 3 and 4'), 'MATHMETH')
  assert.equal(subjectCode('SACE Chemistry Stage 2'), 'CHEM')
  assert.equal(subjectCode('Geography'), 'GEOGRAPH')
  assert.equal(linesForMarks(1), 3)
  assert.equal(linesForMarks(3), 9)
  assert.equal(linesForMarks(9), 16)
})

test('pagination keeps headings with what follows and breaks on sections', () => {
  const blocks = [
    { h: 300 }, { h: 300 }, { h: 300 },           // fit two per page of 700
    { h: 50, keepWithNext: true }, { h: 600 },   // heading moves with its body
    { h: 100, breakBefore: true },              // new section, new page
    { h: 2000 },                                 // taller than a page: its own page
  ]
  assert.deepEqual(paginate(blocks, 700), [[0, 1], [2], [3, 4], [5], [6]])
})

test('seeded random is stable and in range', async () => {
  const { seededRandom, shuffle } = await import('./examBuilder.js')
  const xs = Array.from({ length: 5 }, seededRandom(42))
  assert.deepEqual(xs, Array.from({ length: 5 }, seededRandom(42)))
  assert.ok(xs.every(x => x >= 0 && x < 1))
  assert.deepEqual(shuffle([1, 2, 3, 4], seededRandom(1)).sort(), [1, 2, 3, 4])
})

test('a part that is only a label is kept, so its sub-parts keep their place', () => {
  const q = ext('9', [p('i', 1), { label: 'iii', text: '', marks: 0, level: 2 }, { label: '1', text: 'x', marks: 1, level: 3 }, { label: '', text: '' }])
  assert.deepEqual(partsOf(q).map(x => x.label), ['i', 'iii', '1'])
})

test('a stem and a part introduction stay with the first answer space', () => {
  // stem, intro, answer: none is left behind at the foot of a page
  const blocks = [{ h: 600 }, { h: 50, keepWithNext: true }, { h: 100, keepWithNext: true }, { h: 300 }]
  assert.deepEqual(paginate(blocks, 1000), [[0], [1, 2, 3]])
})

test('the blank gap under a page\'s last block may run past the foot', () => {
  assert.deepEqual(paginate([{ h: 600 }, { h: 420, tail: 30 }], 1000), [[0, 1]])
  assert.deepEqual(paginate([{ h: 600 }, { h: 420 }], 1000), [[0], [1]])
})

test('a figure goes where the text says it is', () => {
  assert.deepEqual(splitAtFigure('A chain is shown below.\nDraw one amino acid from the chain shown above.'), ['A chain is shown below.', 'Draw one amino acid from the chain shown above.'])
  assert.deepEqual(splitAtFigure('The diagram below shows apparatus.\n\nExplain how it works.'), ['The diagram below shows apparatus.', 'Explain how it works.'])
  assert.deepEqual(splitAtFigure('The formula is shown below.'), ['The formula is shown below.', ''])
  assert.deepEqual(splitAtFigure('Name the group in the diagram.'), ['Name the group in the diagram.', ''])
})

test('drawing answers and figure sizes', () => {
  assert.equal(wantsDrawing('Draw the structural formula of one oxidation product.'), true)
  assert.equal(wantsDrawing('Explain what the student could draw from the results.'), false)
  // 216 px at 3 px per point is 72 points: one inch
  assert.equal(Math.round(figureSizeMm(216, 216).width * 10) / 10, 25.4)
  const big = figureSizeMm(2000, 1000)
  assert.equal(big.width, 120)
  assert.equal(big.height, 60)
  assert.equal(figureSizeMm(0, 0), null)
})
