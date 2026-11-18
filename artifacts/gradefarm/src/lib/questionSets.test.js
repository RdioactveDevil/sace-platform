import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSetLead, splitLead, setSentence, fillShared, setUnits, planSetLinks } from './questionSets.js'

// Lead questions as they are stored in the bank.
const STAV = 'Use the following information to answer Questions 19 and 20.\nThe overall redox reaction in a particular alkaline battery when discharging is\n$$\\ce{Zn(s) + 2MnO2(s) + H2O(l) -> Zn(OH)2(s) + Mn2O3(s)}$$\nThe half-equation of the reaction occurring at the positive electrode is'
const KILBAHA = 'Use the following information to answer Questions 11 and 12.\nThe equation for the decomposition of dinitrogen tetroxide is\n$$\\ce{N2O4(g) <=> 2NO2(g)} \\quad \\Delta H > 0$$\nA 2.0 mol sample is added to a 2.0 L empty reactor. The concentration of the $\\ce{NO2}$ formed is shown on the graph below.\n\nSelect the correct statement about the gases in this mixture at the 1 minute mark.'
const NEAP = 'Use the following information to answer Questions 15 and 16.\nUnder standard laboratory conditions (SLC), an electrolytic cell was set up using two inert metal electrodes.\nWhich one of the following electrolytes would deposit the smallest mass of metal onto one of the inert electrodes?'

test('a lead question names the questions that share its information', () => {
  assert.deepEqual(parseSetLead(STAV).numbers, [19, 20])
  assert.deepEqual(parseSetLead('Use the following information to answer questions 15 and 16.\nx').numbers, [15, 16])
  assert.deepEqual(parseSetLead('Use the following information to answer Questions 3 to 5.\nx').numbers, [3, 4, 5])
  assert.deepEqual(parseSetLead('Use the following information to answer Questions 3–5.\nx').numbers, [3, 4, 5])
  assert.deepEqual(parseSetLead('Use the information below to answer Questions 3, 4 and 5.\nx').numbers, [3, 4, 5])
  assert.equal(parseSetLead(STAV).sentence, 'Use the following information to answer Questions 19 and 20.')
  assert.equal(parseSetLead('Which statement about Question 3 is correct?'), null)
  assert.equal(parseSetLead('Use the following information to answer this question.\nx'), null)
})

test('a lead splits into the shared information and its own question', () => {
  assert.deepEqual(splitLead(STAV), {
    shared: 'The overall redox reaction in a particular alkaline battery when discharging is\n$$\\ce{Zn(s) + 2MnO2(s) + H2O(l) -> Zn(OH)2(s) + Mn2O3(s)}$$',
    own: 'The half-equation of the reaction occurring at the positive electrode is',
  })
  // The last paragraph is the question; the graph it refers to stays shared.
  const k = splitLead(KILBAHA)
  assert.equal(k.own, 'Select the correct statement about the gases in this mixture at the 1 minute mark.')
  assert.match(k.shared, /^The equation for the decomposition[\s\S]*shown on the graph below\.$/)
  // One paragraph: the last line is the question.
  assert.equal(splitLead(NEAP).own, 'Which one of the following electrolytes would deposit the smallest mass of metal onto one of the inert electrodes?')
  assert.equal(splitLead(NEAP).shared, 'Under standard laboratory conditions (SLC), an electrolytic cell was set up using two inert metal electrodes.')
  // Nothing but the question after the sentence: nothing shared.
  assert.deepEqual(splitLead('Use the following information to answer Questions 1 and 2.\nWhich is right?'), { shared: '', own: 'Which is right?' })
})

test('the lead sentence uses the exam\'s numbers', () => {
  assert.equal(setSentence([7, 8]), 'Use the following information to answer Questions 7 and 8.')
  assert.equal(setSentence([7, 8, 9]), 'Use the following information to answer Questions 7 to 9.')
  assert.equal(setSentence([7, 9, 12]), 'Use the following information to answer Questions 7, 9 and 12.')
  assert.equal(setSentence([7]), 'Use the following information to answer Question 7.')
  assert.equal(setSentence(['4', '5']), 'Use the following information to answer Questions 4 and 5.')
})

const q = (id, extra = {}) => ({ id, question: id, ...extra })

test('follow-on questions get the set\'s shared information from its first question', () => {
  const list = [
    q('a', { set_key: 's', set_position: 1, shared_info: 'Info', shared_image_url: 'fig' }),
    q('b', { set_key: 's', set_position: 2 }),
    q('c'),
  ]
  const out = fillShared(list)
  assert.deepEqual(out.map(x => [x.shared_info ?? null, x.shared_image_url ?? null]), [['Info', 'fig'], ['Info', 'fig'], [null, null]])
  assert.equal(out[2], list[2]) // untouched
  // A follow-on without its first question in the list keeps what it has (the students' view fills it).
  assert.equal(fillShared([q('b', { set_key: 's', set_position: 2, shared_info: 'From view' })])[0].shared_info, 'From view')
})

test('a set is one unit, in position order, where its first member falls', () => {
  const list = [q('x'), q('b', { set_key: 's', set_position: 2 }), q('y'), q('a', { set_key: 's', set_position: 1 })]
  assert.deepEqual(setUnits(list).map(u => u.map(x => x.id)), [['x'], ['a', 'b'], ['y']])
})

test('existing sets are linked from their lead sentence within the same paper and section', () => {
  const row = (id, num, question, extra = {}) => ({ id, source: 'STAV 2024 Trial Exam', exam_section: 'A', curriculum_id: 'c', source_question: String(num), question, image_url: null, set_key: null, ...extra })
  const rows = [
    row('A19', 19, STAV), row('A20', 20, 'The half-equation at the negative electrode is'),
    row('A11', 11, KILBAHA, { image_url: 'https://x/graph.png' }), row('A12', 12, 'At 3 minutes the mixture'),
    row('A5', 5, 'Use the following information to answer Questions 5 and 6.\nShared.\nQuestion five?'), // 6 missing
    { ...row('B19', 19, 'Other paper'), source: 'NEAP 2024 Trial Exam' },
  ]
  const { updates, problems } = planSetLinks(rows)
  const by = Object.fromEntries(updates.map(u => [u.id, u]))
  assert.deepEqual(Object.keys(by).sort(), ['A11', 'A12', 'A19', 'A20'])
  assert.deepEqual([by.A19.set_key, by.A19.set_position, by.A20.set_key, by.A20.set_position], ['A19', 1, 'A19', 2])
  assert.equal(by.A19.question, 'The half-equation of the reaction occurring at the positive electrode is')
  assert.match(by.A19.shared_info, /^The overall redox reaction/)
  assert.equal(by.A20.question, undefined) // follow-ons keep their text
  assert.equal(by.A20.shared_info, undefined) // shared information is stored once
  // The lead's figure becomes the shared figure.
  assert.deepEqual([by.A11.shared_image_url, by.A11.image_url], ['https://x/graph.png', null])
  assert.equal(by.A19.flag.code, 'set_linked')
  assert.deepEqual(problems, ['STAV 2024 Trial Exam A5: Question 6 isn\'t in the bank, so the set wasn\'t linked.'])
})

test('a copy of the shared information in a follow-on question is removed, and the set found from any of its questions', () => {
  const row = (id, num, question, extra = {}) => ({ id, source: 'Kilbaha 2020 Trial Exam', exam_section: 'A', curriculum_id: 'c', source_question: String(num), question, image_url: null, set_key: null, ...extra })
  const lead = (own) => `Use the following information to answer Questions 15, 16 and 17.\nA titration was carried out.\n${own}`
  // Each question carries the sentence and the shared text (as older loads saved them).
  const rows = [row('A15', 15, lead('First?'), { image_url: 'https://x/f.png' }), row('A16', 16, lead('Second?'), { image_url: 'https://x/f.png' }), row('A17', 17, lead('Third?'))]
  const { updates, problems } = planSetLinks(rows)
  const by = Object.fromEntries(updates.map(u => [u.id, u]))
  assert.deepEqual(problems, [])
  assert.deepEqual(updates.map(u => [u.id, u.set_key, u.set_position]), [['A15', 'A15', 1], ['A16', 'A15', 2], ['A17', 'A15', 3]])
  assert.deepEqual([by.A15.question, by.A16.question, by.A17.question], ['First?', 'Second?', 'Third?'])
  assert.deepEqual([by.A15.shared_info, by.A16.shared_info, by.A17.shared_info], ['A titration was carried out.', undefined, undefined])
  // The copied figure goes with the copied text; the shared figure is kept once, on the first.
  assert.deepEqual([by.A15.shared_image_url, by.A15.image_url, by.A16.image_url], ['https://x/f.png', null, null])
  assert.equal(by.A16.flag.code, 'set_copy_removed')

  // Only a follow-on carries the sentence: the set is still found, and the shared text moves to the first question.
  const rows2 = [row('B2', 2, 'Which compound?'), row('B3', 3, 'Use the following information to answer Questions 2 and 3.\nA compound was analysed.\nWhat is its mass?')]
  const p2 = planSetLinks(rows2)
  const by2 = Object.fromEntries(p2.updates.map(u => [u.id, u]))
  assert.deepEqual([by2.B2.set_position, by2.B2.shared_info, by2.B2.question, by2.B3.set_position, by2.B3.question], [1, 'A compound was analysed.', undefined, 2, 'What is its mass?'])
})

test('two loads of a paper with the same label are never linked together', () => {
  const row = (id, num, question) => ({ id, source: 'Access 2024 Trial Exam', exam_section: 'A', curriculum_id: 'c', source_question: String(num), question, image_url: null, set_key: null })
  const rows = [
    row('ep_aaa_A3', 3, 'The following information is to be used to answer questions 3 & 4\n\nThe IUPAC name of the compound is:'),
    row('ep_bbb_A3', 3, 'The IUPAC name of the compound is:'), row('ep_bbb_A4', 4, 'This molecule is an example of'),
    row('ep_aaa_A4', 4, 'This molecule is an example of'),
  ]
  const { updates } = planSetLinks(rows)
  assert.deepEqual(updates.map(u => [u.id, u.set_key]), [['ep_aaa_A3', 'ep_aaa_A3'], ['ep_aaa_A4', 'ep_aaa_A3']])
})
