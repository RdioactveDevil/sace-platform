import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  courseOrder, subtopicStatuses, coveredSubtopics, nextSubtopic, daysUntil, nextTest,
  accuracyBySubtopic, weekPlan, weekStart, checkInDue,
} from './yearPlan.js'

const TOPICS = [
  { id: 't2', name: 'Managing chemical processes', order_index: 1, subtopics: [
    { id: 's21', name: 'Rates of reactions', order_index: 0 },
    { id: 's22', name: 'Equilibrium and yield', order_index: 1 },
    { id: 's23', name: 'Optimising production', order_index: 2 },
  ] },
  { id: 't1', name: 'Monitoring the environment', order_index: 0, subtopics: [
    { id: 's12', name: 'Photochemical smog', order_index: 1 },
    { id: 's11', name: 'Global warming and climate change', order_index: 0 },
  ] },
]
const flat = courseOrder(TOPICS)
const TODAY = new Date(2027, 2, 16) // Tue 16 Mar 2027

test('the course in order, topic by topic', () => {
  assert.deepEqual(flat.map(s => s.id), ['s11', 's12', 's21', 's22', 's23'])
  assert.equal(flat[2].topicName, 'Managing chemical processes')
  assert.equal(flat[2].topicNum, 2)
})

test('everything before the current subtopic is done, unless skipped', () => {
  const st = subtopicStatuses(flat, 's22', ['s12'])
  assert.deepEqual(flat.map(s => st.get(s.id)), ['done', 'skipped', 'done', 'current', 'upcoming'])
  assert.deepEqual(coveredSubtopics(flat, 's22', ['s12']).map(s => s.id), ['s11', 's21', 's22'])
  assert.deepEqual(coveredSubtopics(flat, null, []).map(s => s.id), [])
})

test('moving on goes to the next subtopic in order', () => {
  assert.equal(nextSubtopic(flat, 's22', []).id, 's23')
  assert.equal(nextSubtopic(flat, 's12', []).id, 's21')
  assert.equal(nextSubtopic(flat, 's23', []), null)
})

test('days until a date, and the next test still to come', () => {
  assert.equal(daysUntil('2027-03-25', TODAY), 9)
  assert.equal(daysUntil('2027-03-16', TODAY), 0)
  assert.equal(daysUntil('2027-03-10', TODAY), -6)
  const tests = [{ name: 'Old', test_date: '2027-03-01' }, { name: 'Later', test_date: '2027-05-01' }, { name: 'Soon', test_date: '2027-03-25' }]
  assert.equal(nextTest(tests, TODAY).name, 'Soon')
  assert.equal(nextTest([{ name: 'Old', test_date: '2027-03-01' }], TODAY), null)
})

test('accuracy per subtopic from the answers so far', () => {
  const questions = [{ id: 'a', subtopic: 'Rates of reactions' }, { id: 'b', subtopic: 'Rates of reactions' }, { id: 'c', subtopic: 'Photochemical smog' }]
  const acc = accuracyBySubtopic(questions, { a: { attempts: 3, wrong: 2 }, b: { attempts: 1, wrong: 0 } })
  assert.deepEqual(acc.get('Rates of reactions'), { attempts: 4, wrong: 2, accuracy: 0.5 })
  assert.equal(acc.get('Photochemical smog'), undefined)
})

test('the week: keep up with class, the next test, and the weakest covered subtopic', () => {
  const accuracy = new Map([['Rates of reactions', { attempts: 6, wrong: 4, accuracy: 1 / 3 }], ['Global warming and climate change', { attempts: 5, wrong: 1, accuracy: 0.8 }]])
  const tests = [{ id: 'x', name: 'Topic 2 test', test_date: '2027-03-25', subtopic_ids: ['s21', 's22'] }]
  const plan = weekPlan({ flat, currentId: 's22', skipped: [], tests, accuracy, hours: 3, today: TODAY })
  assert.deepEqual(plan.rows.map(r => r.kind), ['keep', 'test', 'fix'])
  assert.deepEqual(plan.rows[0].subtopics, ['Equilibrium and yield'])
  assert.deepEqual(plan.rows[1].subtopics, ['Rates of reactions', 'Equilibrium and yield'])
  assert.match(plan.rows[1].label, /Topic 2 test/)
  assert.equal(plan.rows[1].days, 9)
  assert.deepEqual(plan.rows[2].subtopics, ['Rates of reactions'])
  // A test within two weeks gets the most time; the week adds up to the hours.
  assert.ok(plan.rows[1].minutes > plan.rows[0].minutes)
  assert.equal(plan.rows.reduce((s, r) => s + r.minutes, 0), 180)
  assert.ok(plan.rows.every(r => r.questions >= 5))
})

test('with no test coming, earlier topics are revised; with no weak spot, an early one stays fresh', () => {
  const plan = weekPlan({ flat, currentId: 's22', skipped: [], tests: [], accuracy: new Map(), hours: 2, today: TODAY })
  assert.deepEqual(plan.rows.map(r => r.kind), ['keep', 'review', 'refresh'])
  assert.deepEqual(plan.rows[1].subtopics, ['Global warming and climate change', 'Photochemical smog', 'Rates of reactions'])
  assert.deepEqual(plan.rows[2].subtopics, ['Global warming and climate change'])
  assert.equal(plan.rows.reduce((s, r) => s + r.minutes, 0), 120)
})

test('right at the start of the course there is only keeping up', () => {
  const plan = weekPlan({ flat, currentId: 's11', skipped: [], tests: [], accuracy: new Map(), hours: 3, today: TODAY })
  assert.deepEqual(plan.rows.map(r => r.kind), ['keep'])
  assert.equal(plan.rows[0].minutes, 180)
})

test('the external exam counts as the next test in its last two months', () => {
  const plan = weekPlan({ flat, currentId: 's22', skipped: [], tests: [], examDate: '2027-04-20', examName: 'SACE Chemistry exam', accuracy: new Map(), hours: 3, today: TODAY })
  assert.equal(plan.rows[1].kind, 'exam')
  assert.match(plan.rows[1].label, /SACE Chemistry exam/)
})

test('the weekly check-in is due once a new week starts', () => {
  assert.equal(weekStart(TODAY).getDate(), 15) // Monday 15 Mar
  assert.equal(checkInDue(null, TODAY), false)
  assert.equal(checkInDue({ created_at: '2027-03-15T09:00:00', checked_in_at: null }, TODAY), false)
  assert.equal(checkInDue({ created_at: '2027-03-08T09:00:00', checked_in_at: null }, TODAY), true)
  assert.equal(checkInDue({ created_at: '2027-03-01T09:00:00', checked_in_at: '2027-03-15T08:00:00' }, TODAY), false)
  assert.equal(checkInDue({ created_at: '2027-03-01T09:00:00', checked_in_at: '2027-03-12T08:00:00' }, TODAY), true)
})
