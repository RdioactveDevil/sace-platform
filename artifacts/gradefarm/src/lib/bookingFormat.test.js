import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  reminderLabel, groupSlotsByDay, emptyWeek, isValidHHMM, formatWhen, zonedToIso, reminderToMinutes, splitReminder, ZONES, STUDENT_LOCATIONS, nextBlock, zoneCity, joinCountdownText, prospectBookingBody,
} from './bookingFormat.js'

test('reminderLabel', () => {
  assert.equal(reminderLabel(1440), '1 day before')
  assert.equal(reminderLabel(2880), '2 days before')
  assert.equal(reminderLabel(60), '1 hour before')
  assert.equal(reminderLabel(120), '2 hours before')
  assert.equal(reminderLabel(30), '30 minutes before')
  assert.equal(reminderLabel(90), '1 hour 30 minutes before')
  assert.equal(reminderLabel(1500), '1 day 1 hour before')
  assert.equal(reminderLabel(5), '5 minutes before')
})

test('groupSlotsByDay groups by day in the given zone', () => {
  // 4:30 pm and 5:15 pm Melbourne (AEDT, +11) on Tue 3 Nov 2026, then 9:00 am the next day.
  const slots = ['2026-11-03T05:30:00.000Z', '2026-11-03T06:15:00.000Z', '2026-11-03T22:00:00.000Z']
  assert.deepEqual(groupSlotsByDay(slots, 'Australia/Melbourne'), [
    { day: 'Tuesday 3 November', times: [
      { iso: slots[0], label: '4:30 pm' },
      { iso: slots[1], label: '5:15 pm' },
    ] },
    { day: 'Wednesday 4 November', times: [{ iso: slots[2], label: '9:00 am' }] },
  ])
})

test('groupSlotsByDay uses the zone, not UTC, to pick the day; empty in, empty out', () => {
  // 11 pm UTC on the 3rd is 7 am on the 4th in Perth (+8).
  const g = groupSlotsByDay(['2026-11-03T23:00:00.000Z'], 'Australia/Perth')
  assert.equal(g[0].day, 'Wednesday 4 November')
  assert.equal(g[0].times[0].label, '7:00 am')
  assert.deepEqual(groupSlotsByDay([], 'Australia/Perth'), [])
})

test('isValidHHMM', () => {
  for (const ok of ['00:00', '09:30', '23:59']) assert.equal(isValidHHMM(ok), true, ok)
  for (const bad of ['24:00', '9:30', '12:60', '', '12:3', null, undefined, 930]) assert.equal(isValidHHMM(bad), false, String(bad))
})

test('emptyWeek has every day with no blocks, fresh each call', () => {
  const w = emptyWeek()
  assert.deepEqual(Object.keys(w), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
  assert.ok(Object.values(w).every((b) => Array.isArray(b) && b.length === 0))
  w.mon.push(['09:00', '10:00'])
  assert.equal(emptyWeek().mon.length, 0)
})

test('formatWhen shows the time in the zone with its label', () => {
  assert.equal(formatWhen('2026-11-03T05:30:00.000Z', 'Australia/Melbourne'), 'Tue 3 Nov, 4:30 pm (Melbourne)')
  assert.equal(formatWhen('2026-11-03T05:30:00.000Z', 'Australia/Adelaide'), 'Tue 3 Nov, 4:00 pm (Adelaide)')
  assert.equal(formatWhen(null, 'Australia/Adelaide'), '')
})

test('formatWhen without a zone shows no zone label', () => {
  const s = formatWhen('2026-11-03T05:30:00.000Z', undefined)
  assert.match(s, /^\w{3} 3 Nov, \d{1,2}:\d{2} [ap]m$/)
  assert.equal(formatWhen('2026-11-03T05:30:00.000Z', null).includes('('), false)
})

test('nextBlock starts where the last block ends and runs an hour', () => {
  assert.deepEqual(nextBlock([]), ['09:00', '10:00'])
  assert.deepEqual(nextBlock([['09:00', '12:00']]), ['12:00', '13:00'])
  assert.deepEqual(nextBlock([['09:00', '12:30']]), ['12:30', '13:30'])
  assert.deepEqual(nextBlock([['20:00', '23:30']]), ['23:30', '23:59'])
  assert.deepEqual(nextBlock([['09:00', '']]), ['09:00', '10:00'])
})

test('zonedToIso turns a wall-clock time in a zone into an instant', () => {
  assert.equal(zonedToIso('2026-11-03', '16:30', 'Australia/Melbourne'), '2026-11-03T05:30:00.000Z')
  assert.equal(zonedToIso('2026-06-03', '16:30', 'Australia/Melbourne'), '2026-06-03T06:30:00.000Z') // winter, +10
  assert.equal(zonedToIso('2026-11-03', '09:00', 'Australia/Brisbane'), '2026-11-02T23:00:00.000Z')
  assert.equal(zonedToIso('', '09:00', 'Australia/Brisbane'), null)
  assert.equal(zonedToIso('2026-11-03', '', 'Australia/Brisbane'), null)
})

test('reminder units convert to minutes and back', () => {
  assert.equal(reminderToMinutes(2, 'days'), 2880)
  assert.equal(reminderToMinutes(3, 'hours'), 180)
  assert.equal(reminderToMinutes(45, 'minutes'), 45)
  assert.equal(reminderToMinutes('x', 'minutes'), null)
  assert.equal(reminderToMinutes(1.5, 'hours'), 90)
  assert.deepEqual(splitReminder(1440), { value: 1, unit: 'days' })
  assert.deepEqual(splitReminder(90), { value: 90, unit: 'minutes' })
})

test('the zone list is the seven the server accepts', () => {
  assert.deepEqual(ZONES.map(z => z.value), [
    'Australia/Adelaide', 'Australia/Darwin', 'Australia/Brisbane', 'Australia/Sydney',
    'Australia/Melbourne', 'Australia/Hobart', 'Australia/Perth',
  ])
})

test('zoneCity is the last segment of the zone, underscores as spaces', () => {
  assert.equal(zoneCity('Australia/Melbourne'), 'Melbourne')
  assert.equal(zoneCity('America/Argentina/Buenos_Aires'), 'Buenos Aires')
  assert.equal(zoneCity('UTC'), 'UTC')
  assert.equal(zoneCity(''), '')
  assert.equal(zoneCity(undefined), '')
})

test('joinCountdownText says when the call opens, in the viewer zone', () => {
  const from = '2026-11-03T05:20:00.000Z' // 4:20 pm Melbourne
  const at = (iso) => Date.parse(iso)
  assert.equal(joinCountdownText(from, at('2026-11-03T05:20:00.000Z'), 'Australia/Melbourne'), null)
  assert.equal(joinCountdownText(from, at('2026-11-03T05:30:00.000Z'), 'Australia/Melbourne'), null)
  assert.equal(joinCountdownText(from, at('2026-11-03T05:19:30.000Z'), 'Australia/Melbourne'), 'You can join from 4:20 pm, in under a minute.')
  assert.equal(joinCountdownText(from, at('2026-11-03T05:15:00.000Z'), 'Australia/Melbourne'), 'You can join from 4:20 pm, in 5 minutes.')
  assert.equal(joinCountdownText(from, at('2026-11-03T05:19:00.000Z'), 'Australia/Melbourne'), 'You can join from 4:20 pm, in 1 minute.')
  assert.equal(joinCountdownText(from, at('2026-11-03T03:00:00.000Z'), 'Australia/Melbourne'), 'You can join from 4:20 pm on Tue 3 Nov.')
  assert.equal(joinCountdownText(null, 0, 'Australia/Melbourne'), null)
})

test('prospectBookingBody sends a cleared parent email as an empty string, not left out', () => {
  const base = { start: '2027-03-01T10:00:00.000Z', email: ' kid@example.com ', name: '', timeZone: 'Australia/Adelaide' }
  const cleared = prospectBookingBody({ ...base, parentEmail: '  ' })
  assert.equal(cleared.parentEmail, '')
  assert.ok('parentEmail' in JSON.parse(JSON.stringify(cleared)))
  assert.equal(cleared.email, 'kid@example.com')
  assert.equal(cleared.name, undefined)
  assert.equal(prospectBookingBody({ ...base, parentEmail: ' mum@example.com ' }).parentEmail, 'mum@example.com')
})

test('STUDENT_LOCATIONS: one per Australian zone, labelled with the state', () => {
  assert.deepEqual(STUDENT_LOCATIONS.map(l => l.value).sort(), ZONES.map(z => z.value).sort())
  assert.equal(STUDENT_LOCATIONS.find(l => l.value === 'Australia/Melbourne').label, 'Melbourne (VIC)')
  assert.equal(STUDENT_LOCATIONS.find(l => l.value === 'Australia/Sydney').label, 'Sydney or Canberra (NSW, ACT)')
})
