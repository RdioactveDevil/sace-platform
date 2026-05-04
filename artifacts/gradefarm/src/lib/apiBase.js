/**
 * Absolute base URL for the Express API (same host as the SPA on Replit; may differ on Vercel).
 * Set `VITE_API_ORIGIN` at build time (e.g. `https://your-api-host.com` with no trailing slash).
 * When unset, paths stay relative (`/api/...`) for same-origin deployments.
 */
const origin = (import.meta.env.VITE_API_ORIGIN ?? '').trim().replace(/\/$/, '')

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  return origin ? `${origin}${p}` : p
}
