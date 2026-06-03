import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { track, reportError, initObservability } from './analytics.js'

// These run in plain Node (no window, no gtag). The module must degrade to
// safe no-ops and never throw.

describe('analytics (headless)', () => {
  test('track does not throw without a window/gtag', () => {
    assert.doesNotThrow(() => track('unit_test_event', { a: 1 }))
    assert.doesNotThrow(() => track('no_props'))
    assert.doesNotThrow(() => track(''))      // empty event is ignored
    assert.doesNotThrow(() => track(undefined))
  })

  test('reportError does not throw and tolerates any input', () => {
    // Silence the baseline console.error sink for this assertion.
    const orig = console.error
    console.error = () => {}
    try {
      assert.doesNotThrow(() => reportError(new Error('boom'), { source: 'test' }))
      assert.doesNotThrow(() => reportError('string error'))
      assert.doesNotThrow(() => reportError(null))
      assert.doesNotThrow(() => reportError(undefined))
    } finally {
      console.error = orig
    }
  })

  test('initObservability is a safe no-op without window', () => {
    assert.doesNotThrow(() => initObservability())
    assert.doesNotThrow(() => initObservability()) // idempotent
  })
})
