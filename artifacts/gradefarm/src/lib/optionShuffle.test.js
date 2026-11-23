import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { optionOrder, toOriginal, toDisplay, relabelLetters, presentQuestion, presentReveal, storedQuestion } from './optionShuffle.js'

const mcq = (o = {}) => ({
  id: 'q1', question: 'Which is a noble gas?', options: ['Neon', 'Sodium', 'Chlorine', 'Iron'], ...o,
})

// An order that moves every option, for tests that need the letters to change.
const ROTATE = [1, 2, 3, 0] // display A shows original B, …, display D shows original A

describe('optionOrder', () => {
  test('is a permutation of the option indices', () => {
    for (let k = 0; k < 50; k++) {
      const order = optionOrder(mcq(), `u:${k}`)
      assert.deepEqual([...order].sort(), [0, 1, 2, 3])
    }
  })

  test('is the same for the same key and differs across keys', () => {
    assert.deepEqual(optionOrder(mcq(), 'user-1:q1'), optionOrder(mcq(), 'user-1:q1'))
    const seen = new Set()
    for (let k = 0; k < 40; k++) seen.add(optionOrder(mcq(), `user-1:q${k}`).join(''))
    assert.ok(seen.size > 10, `only ${seen.size} different orders over 40 keys`)
  })

  test('puts the answer on each letter about 25% of the time', () => {
    const counts = [0, 0, 0, 0]
    const N = 4000
    for (let k = 0; k < N; k++) counts[toDisplay(optionOrder(mcq(), `6f1c2d3e-user:${k}`), 0)]++
    for (const [i, c] of counts.entries()) {
      const share = c / N
      assert.ok(share >= 0.2 && share <= 0.3, `${'ABCD'[i]} got ${(share * 100).toFixed(1)}%`)
    }
  })

  test('also spreads keys built from real-looking ids', () => {
    const counts = [0, 0, 0, 0]
    const N = 4000
    for (let k = 0; k < N; k++) counts[toDisplay(optionOrder(mcq(), `0b7e9a52-41c3-4d55-9b0e-2f3c4a5b6c7d:${1000 + k}`), 0)]++
    for (const c of counts) assert.ok(c / N >= 0.2 && c / N <= 0.3, JSON.stringify(counts))
  })

  test('shuffles two-, three- and five-option questions too', () => {
    for (const n of [2, 3, 5]) {
      const q = mcq({ options: Array.from({ length: n }, (_, i) => `opt ${i}`) })
      const order = optionOrder(q, 'k')
      assert.deepEqual([...order].sort(), Array.from({ length: n }, (_, i) => i))
    }
  })

  test('null for anything that is not a multiple-choice question', () => {
    assert.equal(optionOrder(mcq({ question_type: 'multi_select', answer_indices: [0] }), 'k'), null)
    assert.equal(optionOrder(mcq({ question_type: 'numeric', options: undefined }), 'k'), null)
    assert.equal(optionOrder(mcq({ question_type: 'order', items: ['a', 'b'] }), 'k'), null)
    assert.equal(optionOrder(null, 'k'), null)
  })

  test('an explicit mcq type is shuffled like an untyped one', () => {
    assert.ok(Array.isArray(optionOrder(mcq({ question_type: 'mcq' }), 'k')))
  })

  test('null with fewer than two options, or options that are not a list', () => {
    assert.equal(optionOrder(mcq({ options: ['Only one'] }), 'k'), null)
    assert.equal(optionOrder(mcq({ options: [] }), 'k'), null)
    assert.equal(optionOrder(mcq({ options: undefined }), 'k'), null)
    assert.equal(optionOrder(mcq({ options: '["a","b"]' }), 'k'), null)
  })

  test('null for a real past-paper or trial-paper question', () => {
    assert.equal(optionOrder(mcq({ source_kind: 'official' }), 'k'), null)
    assert.equal(optionOrder(mcq({ source_kind: 'commercial' }), 'k'), null)
    assert.equal(optionOrder(mcq({ source: 'VCAA 2023 Exam 2' }), 'k'), null)
    assert.equal(optionOrder(mcq({ exam_section: 'A' }), 'k'), null)
  })

  test("a practice variant's source says where remediation got it, not a paper", () => {
    for (const source of ['prebuilt', 'bank', 'ai_generated', 'concept_builder']) {
      assert.ok(Array.isArray(optionOrder(mcq({ is_variant: true, source }), 'k')), source)
    }
    // …but a variant copied from a past paper still keeps its order.
    assert.equal(optionOrder(mcq({ is_variant: true, source: 'bank', source_kind: 'official' }), 'k'), null)
  })

  test('null when an option refers to the others', () => {
    for (const last of ['All of the above', 'None of the above', 'all the above', 'None of these', 'Both of these',
      'Neither of them', 'Both A and B', 'B or C', 'A & D', 'Both (A) and (C)', 'Any of the above', 'Neither', 'Both', 'None',
      'All are correct', 'None are correct', 'Both are correct', 'Neither is correct', 'None is correct', 'All three', 'All four of these', 'All 4']) {
      assert.equal(optionOrder(mcq({ options: ['2', '3', '4', last] }), 'k'), null, last)
    }
  })

  test('ordinary words and single letters in options do not stop the shuffle', () => {
    for (const opts of [
      ['Vitamin A', 'Vitamin B', 'Vitamin C', 'Vitamin D'],
      ['all cells', 'none', 'some', 'many more'].map(s => `${s} divide`),
      ['Grade A and above', 'a and b are equal', 'x or y', 'Both parents carry the allele'],
    ]) {
      assert.ok(Array.isArray(optionOrder(mcq({ options: opts }), 'k')), opts.join(' | '))
    }
  })

  test('null when the options carry their own letter labels', () => {
    assert.equal(optionOrder(mcq({ options: ['A. 2', 'B. 3', 'C. 4', 'D. 5'] }), 'k'), null)
    assert.equal(optionOrder(mcq({ options: ['(A) 2', '(B) 3', '(C) 4', '(D) 5'] }), 'k'), null)
  })
})

describe('toOriginal / toDisplay', () => {
  test('translate between display and stored indices', () => {
    assert.equal(toOriginal(ROTATE, 0), 1)
    assert.equal(toOriginal(ROTATE, 3), 0)
    assert.equal(toDisplay(ROTATE, 0), 3)
    assert.equal(toDisplay(ROTATE, 1), 0)
    for (let d = 0; d < 4; d++) assert.equal(toDisplay(ROTATE, toOriginal(ROTATE, d)), d)
  })

  test('identity without an order, and null/undefined pass through', () => {
    assert.equal(toOriginal(null, 2), 2)
    assert.equal(toDisplay(null, 2), 2)
    assert.equal(toOriginal(undefined, 1), 1)
    assert.equal(toOriginal(ROTATE, null), null)
    assert.equal(toOriginal(ROTATE, undefined), undefined)
    assert.equal(toDisplay(ROTATE, null), null)
    assert.equal(toDisplay(ROTATE, undefined), undefined)
  })

  test('anything that is not an option index passes through', () => {
    assert.equal(toOriginal(ROTATE, 'x = 5'), 'x = 5')
    assert.deepEqual(toOriginal(ROTATE, [0, 1]), [0, 1])
    assert.equal(toOriginal(ROTATE, 9), 9)
    assert.equal(toDisplay(ROTATE, 9), 9)
  })
})

describe('relabelLetters', () => {
  // ROTATE: original A→D, B→A, C→B, D→C.
  const r = (s) => relabelLetters(s, ROTATE)

  test('rewrites option references to the displayed letters', () => {
    assert.equal(r('Option A is correct.'), 'Option D is correct.')
    assert.equal(r('option B forgets the sign'), 'option A forgets the sign')
    assert.equal(r('The answer (C) divides twice.'), 'The answer (B) divides twice.')
    assert.equal(r('Choice D is a trap.'), 'Choice C is a trap.')
    assert.equal(r('The answer is A.'), 'The answer is D.')
    assert.equal(r('Answer: B'), 'Answer: A')
    assert.equal(r('Options A and C both ignore units.'), 'Options D and B both ignore units.')
    assert.equal(r('options B, C or D'), 'options A, B or C')
  })

  test('maps every letter once, from the original (no double mapping)', () => {
    // A→D and D→C: a second pass would turn A into C.
    assert.equal(r('Option A is right; option D is the common slip.'), 'Option D is right; option C is the common slip.')
    assert.equal(r('Option A, not option B.'), 'Option D, not option A.')
  })

  test('rewrites a standalone (A) and "B is incorrect"', () => {
    assert.equal(r('(A) is the only one that balances.'), '(D) is the only one that balances.')
    assert.equal(r('So the answer is A. (B) adds instead.'), 'So the answer is D. (A) adds instead.')
    assert.equal(r('B is incorrect because it adds.'), 'A is incorrect because it adds.')
    assert.equal(r('A is correct. C is wrong: it halves.'), 'D is correct. B is wrong: it halves.')
    assert.equal(r('D is not correct'), 'C is not correct')
  })

  test('leaves ordinary capital letters alone', () => {
    for (const s of [
      'Vitamin A helps eyesight.',
      'A Grade B student would see this.',
      'Grade B is correct for this work.',
      'A = πr^2 gives the area.',
      'The line passes through point A and point B.',
      'Find $P(A)$ first.',
      'P(A) = 0.3',
      'Answer A = 5',
      'A cell divides.',
      'An answer about Alpha.',
      'Option Alpha is not a letter.',
      '$\\text{option } A$ inside maths stays.',
    ]) {
      assert.equal(r(s), s, s)
    }
  })

  test('a bracketed letter that names something else stays', () => {
    for (const s of [
      'Carbon (C) has four valence electrons.',
      'Boron (B) is in group 13.',
      'Current is measured in amperes (A).',
      'The dominant allele (B) codes for brown eyes.',
      'Charge is measured in coulombs (C).',
      'Statement (A) is true.',
      '(A) Carbon has four valence electrons.',
      'Carbon (C) and hydrogen (H) only.',
      'The pair (C) and (H) bond.',
    ]) {
      assert.equal(r(s), s, s)
    }
  })

  test('a bracketed letter is relabelled at the start of a clause or listed with others', () => {
    assert.equal(r('(B) forgets to divide.'), '(A) forgets to divide.')
    assert.equal(r('It halves. (C) is incorrect.'), 'It halves. (B) is incorrect.')
    assert.equal(r('(A) and (C) both ignore units.'), '(D) and (B) both ignore units.')
    assert.equal(r('Both (A) and (C) ignore units.'), 'Both (D) and (B) ignore units.')
  })

  test('a letter that starts a phrase after "answer" stays', () => {
    for (const s of [
      'The answer is A cell that divides.',
      'Answer: A balanced equation is needed.',
      'Answers: A-level chemistry covers this.',
      'An answer A student might give.',
      'option A-level',
    ]) {
      assert.equal(r(s), s, s)
    }
    assert.equal(r('The answer is A because it balances.'), 'The answer is D because it balances.')
    assert.equal(r('The answer is B, since it halves.'), 'The answer is A, since it halves.')
  })

  test('"right-angled" is not a verdict', () => {
    assert.equal(r('B is right-angled.'), 'B is right-angled.')
    assert.equal(r('B is right.'), 'A is right.')
  })

  test('letter ranges stay', () => {
    for (const s of ['Options A–C are all metals.', 'options A-C', 'options A to C are metals', 'Choices B through D are salts.']) {
      assert.equal(r(s), s, s)
    }
  })

  test('leaves letters past the last option alone', () => {
    assert.equal(r('Option E is not here.'), 'Option E is not here.')
  })

  test('no order or no text: unchanged', () => {
    assert.equal(relabelLetters('Option A', null), 'Option A')
    assert.equal(relabelLetters(undefined, ROTATE), undefined)
    assert.equal(relabelLetters(null, ROTATE), null)
    assert.equal(relabelLetters('', ROTATE), '')
  })
})

describe('presentQuestion', () => {
  test('shows the options in the shuffled order and keeps the order', () => {
    const q = mcq()
    const shown = presentQuestion(q, 'user-1:q1')
    const order = optionOrder(q, 'user-1:q1')
    assert.deepEqual(shown.option_order, order)
    assert.deepEqual(shown.options, order.map(i => q.options[i]))
    assert.equal(shown.question, q.question)
    assert.equal(shown.id, q.id)
    assert.deepEqual(q.options, ['Neon', 'Sodium', 'Chlorine', 'Iron'], 'the stored question is not changed')
  })

  test('an answer and solution already in hand follow the shuffle', () => {
    const q = mcq({ answer_index: 0, solution: 'Option A is a noble gas; option B is a metal.', tip: 'Answer (A): group 18.' })
    for (let k = 0; k < 20; k++) {
      const shown = presentQuestion(q, `k${k}`)
      assert.equal(shown.options[shown.answer_index], 'Neon')
      const L = (text) => 'ABCD'[shown.options.indexOf(text)]
      assert.equal(shown.solution, `Option ${L('Neon')} is a noble gas; option ${L('Sodium')} is a metal.`)
      assert.equal(shown.tip, `Answer (${L('Neon')}): group 18.`)
    }
  })

  test('unchanged object when the question is not shuffled', () => {
    const paper = mcq({ source_kind: 'official' })
    assert.equal(presentQuestion(paper, 'k'), paper)
    const numeric = { id: 'n', question_type: 'numeric', answer: 3 }
    assert.equal(presentQuestion(numeric, 'k'), numeric)
    assert.equal(presentQuestion(null, 'k'), null)
  })

  test('presenting a presented question changes nothing', () => {
    const once = presentQuestion(mcq({ answer_index: 2 }), 'k')
    assert.equal(presentQuestion(once, 'k'), once)
    assert.equal(presentQuestion(once, 'another key'), once)
  })
})

describe('presentReveal', () => {
  test("moves the server's answer to the displayed index and relabels the notes", () => {
    const reveal = { answer_index: 0, solution: 'Option A is right.', tip: 'Not option D.' }
    assert.deepEqual(presentReveal(reveal, ROTATE), { answer_index: 3, solution: 'Option D is right.', tip: 'Not option C.' })
  })

  test('unchanged without an order or a reveal', () => {
    const reveal = { answer_index: 0, solution: 'Option A' }
    assert.equal(presentReveal(reveal, null), reveal)
    assert.equal(presentReveal(null, ROTATE), null)
    assert.equal(presentReveal(undefined, ROTATE), undefined)
  })

  test('keeps the other answer fields as they are', () => {
    assert.deepEqual(presentReveal({ answer_indices: [0, 2], advice: { notes: [] } }, ROTATE), { answer_indices: [0, 2], advice: { notes: [] } })
  })
})

describe('storedQuestion', () => {
  test('undoes presentQuestion', () => {
    const q = mcq({ answer_index: 1, solution: 'Option B is right; option A is close.' })
    for (let k = 0; k < 20; k++) {
      const shown = presentQuestion(q, `k${k}`)
      assert.deepEqual(storedQuestion(shown), q)
    }
  })

  test('a question that was never shuffled comes back as it is', () => {
    const q = mcq({ source_kind: 'official' })
    assert.equal(storedQuestion(q), q)
    assert.equal(storedQuestion(null), null)
  })
})
