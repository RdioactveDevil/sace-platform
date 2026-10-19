import { lazy } from 'react'

/**
 * Recovery for stale code-split chunks after a deploy.
 *
 * Each deploy renames the hashed chunk files (WritingScreen-BcVljOQk.js …).
 * A tab opened before the deploy still asks for the old names, the import
 * fails ("Failed to fetch dynamically imported module"), and the screen
 * errors. Reloading picks up the new index.html and its chunk names.
 */

const RELOAD_KEY = 'gf:chunk-reload-at'
// Don't reload again within this window, so a chunk that is really missing
// shows the error screen instead of reloading forever.
const RELOAD_COOLDOWN_MS = 30_000

// Chrome, Safari and Firefox word the failure differently.
const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading (CSS )?chunk \S+ failed/i

export function isChunkLoadError(err) {
  return CHUNK_ERROR_RE.test(String(err?.message ?? err ?? ''))
}

/**
 * Reload the page once per cooldown. Returns false (no reload) when one just
 * happened, or when sessionStorage is unavailable and we can't tell.
 */
export function reloadForNewVersion(storage = globalThis.sessionStorage, now = Date.now()) {
  try {
    const last = Number(storage.getItem(RELOAD_KEY) || 0)
    if (now - last < RELOAD_COOLDOWN_MS) return false
    storage.setItem(RELOAD_KEY, String(now))
  } catch {
    return false
  }
  globalThis.location?.reload()
  return true
}

/** React.lazy that reloads the page instead of erroring on a stale chunk. */
export function lazyWithReload(factory) {
  return lazy(() =>
    factory().catch((err) => {
      // Keep the Suspense fallback up while the page reloads.
      if (isChunkLoadError(err) && reloadForNewVersion()) return new Promise(() => {})
      throw err
    }),
  )
}
