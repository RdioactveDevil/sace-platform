// @ts-expect-error — supabase.js is untyped
import { supabase } from './supabase'

/**
 * Attach the signed-in user's Supabase JWT to every same-origin `/api/*`
 * request that doesn't already set an Authorization header. The API rejects
 * unauthenticated calls to AI / admin routes, so this keeps the many plain
 * `fetch('/api/...')` call sites working without each fetching the session.
 */
export function installApiAuth() {
  const w = window as Window & { __gfApiAuthInstalled?: boolean }
  if (typeof window === 'undefined' || w.__gfApiAuthInstalled) return
  w.__gfApiAuthInstalled = true
  const nativeFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request)?.url
    if (!url || !isSameOriginApi(url)) return nativeFetch(input, init)

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined))
    if (!headers.has('Authorization')) {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (token) headers.set('Authorization', `Bearer ${token}`)
    }
    return nativeFetch(input, { ...init, headers })
  }
}

function isSameOriginApi(url: string) {
  try {
    const u = new URL(url, window.location.origin)
    return u.origin === window.location.origin && u.pathname.startsWith('/api/')
  } catch {
    return false
  }
}
