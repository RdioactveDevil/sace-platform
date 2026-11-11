import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markParts, placeNotes, mergeLineRects, handPath, penMarkStyle } from './advice.js'
import { parseMathText } from './mathMarkup.js'
import { applyBold } from './markdownBlocks.js'

const FLOUR = 'In flour mills, fine flour dust suspended in the air can ignite and burn explosively. A heap of the same flour on the floor burns only slowly when ignited.\n\nUsing collision theory, explain why flour dust suspended in air burns much faster than a heap of flour. (3 marks)'
const tokens = (text) => applyBold(parseMathText(text))
// Each mark's words, as they'll be drawn, and its anchors.
const marked = (parts) => {
  const out = {}
  parts.forEach(p => {
    if (p.mark === undefined) return
    const m = (out[p.mark] ||= { text: '', anchors: [] })
    m.text += p.type === 'text' ? p.content : `[${p.content}]`
    if (p.anchor) m.anchors.push(`${p.anchor}:${p.content}`)
  })
  return out
}

test('every quote is wrapped exactly, with its first and last word as anchors', () => {
  const quotes = ['fine flour dust suspended in the air', 'A heap of the same flour', 'burns only slowly', 'Using collision theory', 'explain why flour dust suspended in air burns much faster']
  const { parts, found } = markParts(tokens(FLOUR), quotes)
  assert.deepEqual(found, [true, true, true, true, true])
  const m = marked(parts)
  quotes.forEach((q, i) => assert.equal(m[i].text, q))
  assert.deepEqual(m[0].anchors, ['start:fine', 'end:air'])
  assert.deepEqual(m[2].anchors, ['start:burns', 'end:slowly'])
  // Nothing lost or added: the parts still read as the question.
  assert.equal(parts.map(p => p.content).join(''), FLOUR)
})

test('a one-word quote is one anchor for both ends', () => {
  const { parts } = markParts(tokens('Explain why the rate increases.'), ['Explain'])
  assert.deepEqual(marked(parts)[0].anchors, ['both:Explain'])
})

test('a quote across a line break or with different spacing is still found', () => {
  const { parts, found } = markParts(tokens('A heap of\nthe same flour'), ['heap of the  same'])
  assert.deepEqual(found, [true])
  assert.equal(marked(parts)[0].text, 'heap of\nthe same')
})

test('whole words win over the inside of another word', () => {
  const { parts } = markParts(tokens('The other air and then the air outside.'), ['the air'])
  const before = parts.slice(0, parts.findIndex(p => p.mark === 0)).map(p => p.content).join('')
  assert.equal(before, 'The other air and then ')
})

test('a maths quote marks its whole segment, and plain quotes can run through a formula', () => {
  const q = 'A $50.0\\ \\text{mL}$ sample of **0.100 M** NaOH was titrated.'
  const { parts, found } = markParts(tokens(q), ['$50.0\\ \\text{mL}$', '0.100 M NaOH'])
  assert.deepEqual(found, [true, true])
  const m = marked(parts)
  assert.equal(m[0].text, '[50.0\\ \\text{mL}]')
  assert.deepEqual(m[0].anchors, ['both:50.0\\ \\text{mL}'])
  assert.equal(m[1].text, '0.100 M NaOH')
  // Bold stays on the bold words.
  assert.ok(parts.some(p => p.mark === 1 && p.bold && p.content === '0.100'))

  const chem = markParts(tokens('Calculate the mass of CO2 produced from 2.0 g of CaCO3.'), ['mass of CO2 produced', 'O2 produced'])
  assert.deepEqual(chem.found, [true, false])
  assert.deepEqual(marked(chem.parts)[0].anchors, ['start:mass', 'end:produced'])
})

test('quotes that are missing, or overlap an earlier one, are left out', () => {
  const { found, parts } = markParts(tokens(FLOUR), ['flour dust suspended', 'dust suspended in the air', 'not in the question', ''])
  assert.deepEqual(found, [true, false, false, false])
  assert.equal(parts.filter(p => p.mark === 1).length, 0)
})

test('a quote is never matched across a table between two blocks', () => {
  const parts = [{ type: 'text', content: 'Look at the', block: 0 }, { type: 'break', content: '' }, { type: 'text', content: 'table below.', block: 1 }]
  assert.deepEqual(markParts(parts, ['the table']).found, [false])
})

// Two lines of text 66px apart, 20px tall, in a 600px-wide question.
const LINES = [{ x: 0, y: 40, w: 600, h: 20 }, { x: 0, y: 106, w: 600, h: 20 }, { x: 0, y: 172, w: 300, h: 20 }]
const BOUNDS = { left: 0, right: 600, top: 0, bottom: 210 }
const word = (x, y, w = 40) => ({ x, y, w, h: 20 })
const note = (start, end, w = 150, frags) => ({ w, h: 22, anchors: { start, end }, frags: frags || [{ x: start.x, y: start.y, w: end.x + end.w - start.x, h: 20 }] })

test('a note goes just above its words, centred over them', () => {
  const [p] = placeNotes([note(word(200, 106), word(300, 106))], LINES, BOUNDS)
  assert.equal(p.anchor, 'start')
  assert.equal(p.y, 106 - 3 - 22)
  assert.equal(p.x + 75, 270)
})

test('a second note on the same line never overlaps the first, and stays over its own words', () => {
  const a = note(word(100, 106), word(200, 106), 220)
  const b = note(word(260, 106), word(300, 106), 200)
  const [pa, pb] = placeNotes([a, b], LINES, BOUNDS)
  assert.ok(pb.x >= pa.x + 220 + 10 || pb.y !== pa.y, `notes overlap: ${pa.x} and ${pb.x}`)
  assert.ok(pb.x < 340 && pb.x + 200 > 260, `second note isn't over its words: ${pb.x}`)
})

test('with no room above, a note goes below; with none either side, it is listed', () => {
  const blocker = { x: 0, y: 70, w: 600, h: 30 }
  const [below] = placeNotes([note(word(200, 106), word(300, 106))], [...LINES, blocker], BOUNDS)
  assert.equal(below.y, 126 + 3)
  const [none] = placeNotes([note(word(200, 106), word(300, 106))], [...LINES, blocker, { x: 0, y: 130, w: 600, h: 30 }], BOUNDS)
  assert.equal(none, null)
})

test('a phrase that wraps can carry its note on its last line', () => {
  // "A" at the end of line one, the rest of the phrase on line two; line one's
  // gap is taken by another note.
  const first = note(word(250, 40, 300), word(250, 40, 300), 300)
  const wrapped = note(word(585, 40, 12), word(150, 106, 60), 260, [{ x: 585, y: 40, w: 15, h: 20 }, { x: 0, y: 106, w: 210, h: 20 }])
  const [, p] = placeNotes([first, wrapped], LINES, BOUNDS)
  assert.equal(p.anchor, 'end')
  assert.ok(p.y > 60 && p.y + 22 < 106, `note at y ${p.y}`)
})

test('notes stay inside the question, and a note wider than it is listed', () => {
  const [p] = placeNotes([note(word(560, 106), word(560, 106), 200)], LINES, BOUNDS)
  assert.equal(p.x, 400)
  assert.equal(placeNotes([note(word(10, 106), word(10, 106), 700)], LINES, BOUNDS)[0], null)
  // Above the first line would run past the top of the question.
  const [low] = placeNotes([note(word(10, 40), word(10, 40))], LINES, { ...BOUNDS, top: 30 })
  assert.equal(low.y, 60 + 3)
})

test('a note keeps off pen marks drawn on the line above', () => {
  const underline = { x: 150, y: 60, w: 200, h: 8 }
  const [p] = placeNotes([note(word(200, 106), word(300, 106))], [...LINES, underline], BOUNDS)
  assert.ok(p.y >= 68 + 3 || p.x >= 350 + 2 || p.x + 150 <= 150 - 2, `note on the underline at ${p.x},${p.y}`)
})

test('line rectangles merge per line', () => {
  const lines = mergeLineRects([
    { left: 0, right: 50, top: 10, bottom: 30, width: 50, height: 20 },
    { left: 50, right: 90, top: 11, bottom: 30, width: 40, height: 19 },
    { left: 0, right: 30, top: 60, bottom: 80, width: 30, height: 20 },
  ])
  assert.deepEqual(lines, [{ left: 0, top: 10, width: 90, height: 20 }, { left: 0, top: 60, width: 30, height: 20 }])
})

test('maths taller than its words stays on the same line', () => {
  const lines = mergeLineRects([
    { left: 0, top: 40, width: 50, height: 20 },
    { left: 60, top: 36, width: 80, height: 28 },
    { left: 0, top: 100, width: 30, height: 20 },
  ], { overlap: true })
  assert.deepEqual(lines, [{ left: 0, top: 36, width: 140, height: 28 }, { left: 0, top: 100, width: 30, height: 20 }])
})

test('pen marks are drawn by the words\' own element, without moving them', () => {
  for (const kind of ['underline', 'double_underline', 'circle', 'box', 'unknown']) {
    const s = penMarkStyle(kind, 3, '#c2362d')
    assert.match(s.backgroundImage, /^url\("data:image\/svg\+xml,/)
    assert.ok(decodeURIComponent(s.backgroundImage).includes("stroke='#c2362d'"))
    const side = s.padding.split(' ')[1]
    assert.equal(s.margin, `0 -${side}`)
  }
  assert.equal(penMarkStyle('circle', 3, '#000').backgroundImage, penMarkStyle('circle', 3, '#000').backgroundImage)
})

test('helpers are deterministic', () => {
  assert.equal(handPath('circle', 3), handPath('circle', 3))
  assert.notEqual(handPath('circle', 3), handPath('circle', 4))
})
