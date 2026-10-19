import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isChunkLoadError, reloadForNewVersion } from './chunkReload.js'

test('recognises stale-chunk errors from each browser', () => {
  // The live error that prompted this.
  assert.equal(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://www.gradefarm.com.au/assets/WritingScreen-BcVljOQk.js')), true)
  assert.equal(isChunkLoadError(new TypeError('Importing a module script failed.')), true)
  assert.equal(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/assets/a.js')), true)
  assert.equal(isChunkLoadError(new Error('Unable to preload CSS for /assets/a.css')), true)
  assert.equal(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'map')")), false)
  assert.equal(isChunkLoadError(null), false)
})

function memoryStorage() {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
}

test('reloads at most once per cooldown', () => {
  const storage = memoryStorage()
  assert.equal(reloadForNewVersion(storage, 1_000_000), true)
  assert.equal(reloadForNewVersion(storage, 1_010_000), false)
  assert.equal(reloadForNewVersion(storage, 1_031_000), true)
})

test('does not reload when storage is unavailable', () => {
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => {} }
  assert.equal(reloadForNewVersion(broken, 1_000_000), false)
})
