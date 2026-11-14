import { test } from 'node:test'
import assert from 'node:assert/strict'
import { greetingContext, greetingOptions, pickGreeting, shortSubjectName } from './greetings.js'

// Thursday 2026-11-12, 7:30pm in Adelaide (ACDT, UTC+10:30).
const evening = new Date('2026-11-12T09:00:00Z')
// Saturday 2026-11-14, 11:30pm in Adelaide.
const lateSaturday = new Date('2026-11-14T13:00:00Z')

test('the context uses the first name, Adelaide time and the subject', () => {
  const c = greetingContext({ displayName: 'Maya Smith', subjectName: 'Chemistry', now: evening })
  assert.deepEqual(c, { name: 'Maya', subject: 'Chemistry', partOfDay: 'evening', lateNight: false, weekend: false })
  const late = greetingContext({ displayName: 'Maya', now: lateSaturday })
  assert.equal(late.partOfDay, null)
  assert.equal(late.lateNight, true)
  assert.equal(late.weekend, true)
})

test('lines missing their details are left out', () => {
  const none = greetingContext({ now: evening })
  const opts = greetingOptions('ask', none)
  assert.ok(opts.length >= 4)
  assert.ok(opts.every(o => !o.includes('undefined') && !o.includes('null')))
  assert.ok(!opts.some(o => o.includes('Good evening')))
  assert.ok(greetingOptions('ask', greetingContext({ displayName: 'Maya', now: evening })).includes('Good evening, Maya'))
})

test('a heading is picked at random from the right set', () => {
  const ctx = greetingContext({ displayName: 'Maya', subjectName: 'Chemistry', now: evening })
  assert.equal(pickGreeting('ask', ctx, () => 0), 'What are you stuck on?')
  assert.equal(pickGreeting('lesson', ctx, () => 0), 'What should we learn today?')
  const seen = new Set(Array.from({ length: 200 }, (_, i) => pickGreeting('ask', ctx, () => (i % 10) / 10)))
  assert.ok(seen.size >= 5)
  assert.ok(greetingOptions('lesson', ctx).every(o => !greetingOptions('ask', ctx).includes(o)))
})

test('subject names are shortened for headings, or left out when long', () => {
  assert.equal(shortSubjectName('VCE Mathematical Methods Units 1 and 2'), 'Mathematical Methods')
  assert.equal(shortSubjectName('SACE Stage 2 Chemistry'), 'Chemistry')
  assert.equal(shortSubjectName('Chemistry'), 'Chemistry')
  assert.equal(shortSubjectName('Year 6 Selective Entry'), 'Selective Entry')
  assert.equal(shortSubjectName('Mathematical Methods (CAS)'), 'Mathematical Methods')
  assert.equal(shortSubjectName('A really very long subject name here'), null)
  assert.equal(shortSubjectName(''), null)
  const ctx = greetingContext({ displayName: 'Dev', subjectName: 'A really very long subject name here' })
  assert.ok(greetingOptions('ask', ctx).every(o => !o.includes('long subject')))
})
