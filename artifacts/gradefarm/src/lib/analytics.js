// Lightweight, dependency-free analytics + error-reporting layer.
//
// Goals:
//  - Never throw and never block the UI (all sinks are best-effort).
//  - Work with the Google Analytics tag already present in index.html (gtag).
//  - Optionally forward events/errors to a custom HTTP endpoint when
//    VITE_ANALYTICS_ENDPOINT / VITE_ERROR_ENDPOINT are configured, so the app
//    can be wired to PostHog/Sentry/a proxy without code changes.
//  - Log to the console in dev so developers get immediate feedback.

function readEnv(key) {
  try {
    // import.meta.env exists under Vite; guarded so this module is also
    // importable from plain Node (e.g. the test runner) without crashing.
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env[key]
    }
  } catch (_) {}
  return undefined
}

function isDev() {
  return readEnv('DEV') === true || readEnv('MODE') === 'development'
}

function gtag(...args) {
  try {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag(...args)
    }
  } catch (_) {}
}

/** Fire-and-forget POST that never rejects. */
function beacon(url, payload) {
  if (!url) return
  try {
    const body = JSON.stringify(payload)
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, body)
      return
    }
    if (typeof fetch === 'function') {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
    }
  } catch (_) {}
}

/**
 * Track a product analytics event.
 * @param {string} event  snake_case event name, e.g. 'quiz_completed'
 * @param {object} [props] arbitrary properties
 */
export function track(event, props = {}) {
  if (!event) return
  gtag('event', event, props)
  beacon(readEnv('VITE_ANALYTICS_ENDPOINT'), { type: 'event', event, props, ts: Date.now() })
  if (isDev()) {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', event, props)
  }
}

/**
 * Report an error to the observability sinks.
 * @param {unknown} error
 * @param {object} [context] extra context (component, route, etc.)
 */
export function reportError(error, context = {}) {
  const message = error && error.message ? error.message : String(error)
  const stack = error && error.stack ? String(error.stack) : undefined
  // Always surface in the console — this is the baseline sink.
  // eslint-disable-next-line no-console
  console.error('[reportError]', message, context, error)
  gtag('event', 'exception', { description: message, fatal: !!context.fatal })
  beacon(readEnv('VITE_ERROR_ENDPOINT'), {
    type: 'error',
    message,
    stack,
    context,
    url: typeof location !== 'undefined' ? location.href : undefined,
    ts: Date.now(),
  })
}

let observabilityInited = false

/** Attach global handlers for uncaught errors and unhandled promise rejections. */
export function initObservability() {
  if (observabilityInited || typeof window === 'undefined') return
  observabilityInited = true
  window.addEventListener('error', (e) => {
    reportError(e.error || e.message, { source: 'window.onerror', fatal: false })
  })
  window.addEventListener('unhandledrejection', (e) => {
    reportError(e.reason, { source: 'unhandledrejection', fatal: false })
  })
}
