/**
 * Production builds need a tldraw SDK license or the editor unmounts after 5s
 * (`LICENSE_TIMEOUT` in @tldraw/editor). Set `VITE_TLDRAW_LICENSE_KEY` in Vercel
 * (or local `.env`) before `vite build`. Trial: https://tldraw.dev/pricing
 */
export const TLDRAW_LICENSE_KEY: string | undefined = import.meta.env.VITE_TLDRAW_LICENSE_KEY
