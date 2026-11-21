import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusChip } from './diagnosticStatus.js'

test('each status has a label and a tone', () => {
  assert.deepEqual(statusChip('sent'), { label: 'Sent', tone: 'muted' })
  assert.deepEqual(statusChip('link'), { label: 'Link only', tone: 'muted' })
  assert.deepEqual(statusChip('opened'), { label: 'Opened', tone: 'gold' })
  assert.deepEqual(statusChip('in_progress'), { label: 'In progress', tone: 'gold' })
  assert.deepEqual(statusChip('finished'), { label: 'Finished', tone: 'success' })
  assert.deepEqual(statusChip('expired'), { label: 'Expired', tone: 'danger' })
  assert.deepEqual(statusChip('cancelled'), { label: 'Cancelled', tone: 'muted' })
})

test('an unknown status shows as itself', () => {
  assert.deepEqual(statusChip('waived'), { label: 'waived', tone: 'muted' })
})
