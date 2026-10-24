import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isChunkLoadError, reloadForNewVersion, preloadable } from './chunkReload.js'

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

test('preloadable imports once and resolves synchronously once loaded', async () => {
  let calls = 0
  const mod = { default: 'Screen' }
  const loader = preloadable(() => { calls++; return Promise.resolve(mod) })
  await Promise.all([loader.load(), loader.load()])
  assert.equal(calls, 1)
  let got = null
  loader.load().then(m => { got = m })
  assert.equal(got, mod) // no tick needed
})

test('preloadable retries after a failed import', async () => {
  let calls = 0
  const loader = preloadable(() => (++calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ default: 1 })))
  await assert.rejects(loader.load())
  assert.deepEqual(await loader.load(), { default: 1 })
  assert.equal(calls, 2)
})
