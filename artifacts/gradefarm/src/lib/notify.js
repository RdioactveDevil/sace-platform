import { toast } from 'sonner'
import { reportError } from './analytics'

// Thin wrapper over `sonner` so the rest of the app has a single, stable
// notification API and so error toasts also flow to the observability layer.

export const notify = {
  success: (message, opts) => toast.success(message, opts),
  error:   (message, opts) => toast.error(message, opts),
  info:    (message, opts) => toast(message, opts),
  loading: (message, opts) => toast.loading(message, opts),
  dismiss: (id) => toast.dismiss(id),
}

/**
 * Surface an error to the user as a toast AND report it to observability.
 * Use this to replace silent `.catch(() => {})` blocks that hide failures.
 * @param {unknown} error
 * @param {string} [fallback] message shown if the error has none
 * @param {object} [context] extra context for the report
 */
export function notifyError(error, fallback = 'Something went wrong.', context = {}) {
  const message = (error && error.message) ? error.message : fallback
  toast.error(message)
  reportError(error || new Error(fallback), context)
}
