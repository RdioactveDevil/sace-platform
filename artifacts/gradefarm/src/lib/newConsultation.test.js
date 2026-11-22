import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recipientsError, newConsultationBody, newConsultationError, whoWasEmailed, emptyNewConsultation } from './newConsultation.js'

const q = [{ id: 1, question: 'Solve x + 1 = 3', marks: 2 }]
const subjects = [{ name: 'Mathematics', topics: ['Algebra'] }]
const base = () => ({
  ...emptyNewConsultation(),
  studentName: ' Sam Rowe ',
  studentEmail: ' Sam@Example.com ',
  parentEmail: 'pat@example.com',
  startIso: '2030-01-05T04:00:00.000Z',
})

test('a fresh form ticks the questionnaire and the test, and no recipient yet', () => {
  const f = emptyNewConsultation()
  assert.equal(f.sendToStudent, false)
  assert.equal(f.sendToParent, false)
  assert.equal(f.sendQuestionnaire, true)
  assert.equal(f.sendTest, true)
  assert.equal(f.tailored, null)
  assert.equal(f.test, null)
})

test('recipientsError: needs a ticked recipient with a valid email', () => {
  assert.match(recipientsError(base()), /who to send it to/i)
  assert.equal(recipientsError({ ...base(), sendToStudent: true }), null)
  assert.equal(recipientsError({ ...base(), sendToParent: true }), null)
  assert.equal(recipientsError({ ...base(), sendToStudent: true, sendToParent: true }), null)
  assert.match(recipientsError({ ...base(), sendToStudent: true, studentEmail: 'nope' }), /valid email address for the student/)
  assert.match(recipientsError({ ...base(), sendToParent: true, parentEmail: '' }), /valid email address for the parent/)
  assert.match(recipientsError({ ...base(), sendToStudent: true, sendToParent: true, parentEmail: 'x@' }), /parent/)
})

test('recipientsError: an unticked address is not checked', () => {
  assert.equal(recipientsError({ ...base(), sendToStudent: true, parentEmail: 'garbage' }), null)
  assert.equal(recipientsError({ ...base(), sendToParent: true, studentEmail: 'garbage' }), null)
})

test('newConsultationBody: exactly the route body, defaults for questionnaire and a generated test', () => {
  const body = newConsultationBody({ ...base(), sendToStudent: true, sendToParent: true, test: { yearLevel: 'Year 10', subjects, questions: q, extra: 1 } })
  assert.deepEqual(body, {
    studentName: 'Sam Rowe',
    studentEmail: 'sam@example.com',
    sendToStudent: true,
    parentEmail: 'pat@example.com',
    sendToParent: true,
    start: '2030-01-05T04:00:00.000Z',
    questionnaire: 'default',
    test: { yearLevel: 'Year 10', subjects, questions: q },
  })
})

test('newConsultationBody: unticked emails are blank; reminders only when set', () => {
  const body = newConsultationBody({ ...base(), sendToParent: true, reminderMinutes: [1440, 60], sendTest: false })
  assert.equal(body.studentEmail, '')
  assert.equal(body.sendToStudent, false)
  assert.deepEqual(body.reminderMinutes, [1440, 60])
  assert.equal(body.test, null)
  assert.equal('reminderMinutes' in newConsultationBody({ ...base(), sendToParent: true, reminderMinutes: [] }), false)
  assert.equal('reminderMinutes' in newConsultationBody({ ...base(), sendToParent: true }), false)
})

test('newConsultationBody: questionnaire is the tailored copy, "default", or null when unticked', () => {
  const tailored = { intro: 'Hi', items: [] }
  assert.deepEqual(newConsultationBody({ ...base(), sendToParent: true, tailored }).questionnaire, tailored)
  assert.equal(newConsultationBody({ ...base(), sendToParent: true, sendQuestionnaire: false, tailored }).questionnaire, null)
})

test('newConsultationError: name, recipients, time and (when ticked) a previewed test', () => {
  const ok = { ...base(), sendToStudent: true, sendTest: false }
  assert.equal(newConsultationError(ok), null)
  assert.match(newConsultationError({ ...ok, studentName: '  ' }), /student's name/)
  assert.match(newConsultationError({ ...ok, sendToStudent: false }), /who to send it to/i)
  assert.match(newConsultationError({ ...ok, startIso: '' }), /time/i)
  assert.match(newConsultationError({ ...ok, sendTest: true }), /generate/i)
  assert.equal(newConsultationError({ ...ok, sendTest: true, test: { yearLevel: 'Year 10', subjects, questions: q } }), null)
})

test('whoWasEmailed: a readable list', () => {
  assert.equal(whoWasEmailed({ student: true, parent: true }), 'student, parent')
  assert.equal(whoWasEmailed({ parent: true }), 'parent')
  assert.equal(whoWasEmailed({ student: false, parent: true }), 'parent')
  assert.equal(whoWasEmailed({ student: true }), 'student')
  assert.equal(whoWasEmailed({}), '')
  assert.equal(whoWasEmailed(undefined), '')
})
