import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusChip, questionnaireChip } from './diagnosticStatus.js'

test('each status has a label and a tone', () => {
  assert.deepEqual(statusChip('sent'), { label: 'Sent', tone: 'muted' })
  assert.deepEqual(statusChip('link'), { label: 'Link only', tone: 'muted' })
  assert.deepEqual(statusChip('opened'), { label: 'Opened', tone: 'gold' })
  assert.deepEqual(statusChip('in_progress'), { label: 'In progress', tone: 'gold' })
  assert.deepEqual(statusChip('finished'), { label: 'Finished', tone: 'success' })
  assert.deepEqual(statusChip('expired'), { label: 'Expired', tone: 'danger' })
  assert.deepEqual(statusChip('cancelled'), { label: 'Cancelled', tone: 'muted' })
  assert.deepEqual(statusChip('no_test'), { label: 'No test', tone: 'muted' })
})

test('marking statuses', () => {
  assert.deepEqual(statusChip('marking'), { label: 'Marking…', tone: 'gold' })
  assert.deepEqual(statusChip('marking_failed'), { label: 'Marking failed', tone: 'danger' })
})

test('an unknown status shows as itself', () => {
  assert.deepEqual(statusChip('waived'), { label: 'waived', tone: 'muted' })
})

test('the questionnaire chip says where the questionnaire is up to', () => {
  assert.deepEqual(questionnaireChip('none'), { label: 'Questionnaire: not booked yet', tone: 'muted' })
  assert.deepEqual(questionnaireChip('waiting'), { label: 'Questionnaire: waiting', tone: 'gold' })
  assert.deepEqual(questionnaireChip('submitted'), { label: 'Questionnaire: filled in', tone: 'success' })
  assert.equal(questionnaireChip(null), null)
  assert.equal(questionnaireChip(undefined), null)
})
