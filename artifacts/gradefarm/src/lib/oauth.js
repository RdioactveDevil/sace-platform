// Signing in with Google or Apple (Supabase OAuth).
//
// The buttons show only for the providers named in VITE_OAUTH_PROVIDERS
// (e.g. "google,apple"), so a provider appears once it's switched on in
// Supabase (Authentication → Sign In / Providers) and its redirect URL is
// allowed, never before, when it would only lead to an error page.
//
// Google and Apple only say who is signing in, so "For my child" is
// remembered on this device across the trip to Google or Apple
// (rememberParentSignup) and picked up by onboarding (signupAsParent).

export const OAUTH_PROVIDERS = [
  { id: 'google', label: 'Google' },
  { id: 'apple', label: 'Apple' },
]

/** The providers switched on for this deploy, in display order. */
export function enabledProviders(setting) {
  const wanted = new Set(String(setting || '').toLowerCase().split(/[\s,]+/).filter(Boolean))
  return OAUTH_PROVIDERS.filter(p => wanted.has(p.id))
}

const PARENT_KEY = 'gf-signup-as'

/** Before leaving for Google or Apple: remember whether this account is a parent's. */
export function rememberParentSignup(asParent, store = globalThis.localStorage) {
  try { asParent ? store.setItem(PARENT_KEY, 'parent') : store.removeItem(PARENT_KEY) } catch {}
}

/** Whether this device's last Google or Apple sign-up was "For my child". */
export function signupAsParent(store = globalThis.localStorage) {
  try { return store.getItem(PARENT_KEY) === 'parent' } catch { return false }
}

export function forgetParentSignup(store = globalThis.localStorage) {
  try { store.removeItem(PARENT_KEY) } catch {}
}
