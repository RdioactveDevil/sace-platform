import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanVisual, describeVisual, isSafeExpr, visualPromptLines } from './lessonVisuals.js'
import { parseLessonJson, describeLessonCard } from './lessonCards.js'

test('graph rules: plain arithmetic in one variable only', () => {
  for (const ok of ['x^2 - 4', '2*x + 1', 'sqrt(x) + abs(x - 1)', '1.5e3 * exp(-0.2*x)', 'sin(PI*x)', '.5*x', '1200*(1/3)^(t/5)', 'log(x)'])
    assert.equal(isSafeExpr(ok), true, ok)
  for (const bad of ['alert(1)', 'x.constructor', '(1).constructor', 'Math.cos(x)', 'window', 'x["a"]', '`x`', 'x; fetch()', 'a*b + c', 'x = 1', '', null, 'eval(x)', 'x =>x'])
    assert.equal(isSafeExpr(bad), false, String(bad))
})

test('tables keep text cells and drop empty rows', () => {
  const v = cleanVisual({ type: 'table', headers: ['$x$', 'y'], rows: [['0', 1], [], [{ a: 1 }, null], ['2', '5']], caption: 'Values' })
  assert.deepEqual(v, { type: 'table', headers: ['$x$', 'y'], rows: [['0', '1'], ['2', '5']], caption: 'Values' })
  assert.equal(cleanVisual({ type: 'table', headers: ['x'], rows: [] }), null)
})

test('graphs drop unsafe rules and need something to draw', () => {
  const v = cleanVisual({ type: 'graph', functions: [{ expr: 'x^2' }, { expr: 'alert(1)' }], points: [{ x: 1, y: 1, label: 'P' }], xRange: [3, 1] })
  assert.deepEqual(v.functions, [{ expr: 'x^2' }])
  assert.deepEqual(v.xRange, [-5, 5])
  assert.equal(cleanVisual({ type: 'graph', functions: [{ expr: 'fetch()' }] }), null)
})

test('figures pass through when drawable; unknown types and junk are dropped', () => {
  const tri = { type: 'geometry', points: { A: [0, 0], B: [4, 0], C: [0, 3] }, polygons: [{ vertices: ['A', 'B', 'C'] }], caption: 'Right triangle' }
  assert.deepEqual(cleanVisual(tri), tri)
  assert.equal(cleanVisual({ type: 'number_line', min: 5, max: 1 }), null)
  assert.equal(cleanVisual({ type: 'apparatus', kind: 'rocket' }), null)
  assert.equal(cleanVisual({ type: 'svg', svg: '<svg/>' }), null)
  assert.equal(cleanVisual('table'), null)
  assert.equal(cleanVisual({ type: 'bar_chart', bars: Array.from({ length: 2000 }, (_, i) => ({ label: 'x', value: i })) }), null)
})

test('lesson JSON keeps visuals on ideas and the worked example', () => {
  const q = { question: 'Q', options: ['a', 'b'], answer_index: 0 }
  const d = parseLessonJson(JSON.stringify({
    title: 'Quadratics',
    ideas: [
      { title: 'A', text: 'a', check: q, visual: { type: 'graph', functions: [{ expr: 'x^2 - 4' }] } },
      { title: 'B', text: 'b', visual: { type: 'nonsense' } },
    ],
    example: { problem: 'p', steps: [{ work: 'w' }], visual: { type: 'table', headers: ['x', 'y'], rows: [['1', '2']] } },
    checks: [q],
  }))
  assert.equal(d.ideas[0].visual.type, 'graph')
  assert.equal('visual' in d.ideas[1], false)
  assert.equal(d.example.visual.type, 'table')

  const onIdea = describeLessonCard({ topic: 'Quadratics', data: d, card: 1 })
  assert.match(onIdea, /Curve 1: y = x\^2 - 4/)
  const onExample = describeLessonCard({ topic: 'Quadratics', data: d, card: 4, revealed: 1 })
  assert.match(onExample, /Table shown:\n {2}\| x \| y \|\n {2}\| 1 \| 2 \|/)
})

test('describing a diagram and the prompt lines', () => {
  assert.match(describeVisual(cleanVisual({ type: 'number_line', min: 0, max: 5, caption: 'c' })), /^Diagram shown \(number line\) \(caption: "c"\)/)
  assert.equal(visualPromptLines('Mathematical Methods').some(l => l.includes('apparatus')), false)
  assert.equal(visualPromptLines('Chemistry Stage 2').some(l => l.includes('apparatus')), true)
})
