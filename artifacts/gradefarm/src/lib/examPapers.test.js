import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePaperFilename, buildPaperRows, safeName, sourceLabelFor } from './examPapers.js'

test('file names give year, paper, publisher and solutions', () => {
  assert.deepEqual(parsePaperFilename('2025-MathMethods2.pdf'), { year: 2025, solutions: false, kind: 'official', publisher: 'VCAA', paper: 'Exam 2' })
  assert.deepEqual(parsePaperFilename('2025-MathMethods1.pdf'), { year: 2025, solutions: false, kind: 'official', publisher: 'VCAA', paper: 'Exam 1' })
  assert.equal(parsePaperFilename('2023 Methods Exam 2 Assessment Report.pdf').solutions, true)
  assert.equal(parsePaperFilename('2023 Methods Exam 2 Assessment Report.pdf').paper, 'Exam 2')
  const neap = parsePaperFilename('NEAP 2024 MM Trial Exam 1 solutions.pdf')
  assert.deepEqual([neap.kind, neap.publisher, neap.year, neap.paper, neap.solutions], ['commercial', 'NEAP', 2024, 'Exam 1', true])
  const sace = parsePaperFilename('9eeabe6f-1330f190.pdf', 'sace')
  assert.deepEqual([sace.publisher, sace.paper, sace.year], ['SACE Board', 'Exam', null])
  assert.equal(parsePaperFilename('chemistry-2025-paper.pdf', 'sace').paper, 'Exam')
})

test('solutions files are paired with their papers', () => {
  const f = (name) => ({ name })
  const { papers, unpaired } = buildPaperRows([
    f('2025-MathMethods2.pdf'), f('2025-MathMethods1.pdf'),
    f('2025-MathMethods2-report.pdf'), f('2025-MathMethods1 solutions.pdf'),
    f('2019 Physics answers.pdf'),
  ])
  assert.equal(papers.length, 2)
  const byPaper = Object.fromEntries(papers.map(p => [p.paper, p.solutionsKey]))
  assert.equal(byPaper['Exam 2'], 2)
  assert.equal(byPaper['Exam 1'], 3)
  assert.deepEqual(unpaired.map(u => u.file.name), ['2019 Physics answers.pdf'])
})

test('labels and safe names', () => {
  assert.equal(sourceLabelFor({ kind: 'official', publisher: 'VCAA', year: 2023, paper: 'Exam 2' }), 'VCAA 2023 Exam 2')
  assert.equal(sourceLabelFor({ kind: 'commercial', publisher: 'NEAP', year: 2024, paper: 'Exam 1' }), 'NEAP 2024 Trial Exam 1')
  assert.equal(safeName('2025 Math Methods (2).pdf'), '2025-Math-Methods-2-.pdf')
})
