// In-app dialogs in place of the browser's own window.confirm and
// window.alert, which show the site's address in a browser box rather than
// looking like part of the site. components/DialogHost.jsx (mounted once in
// App.jsx) shows them, one at a time.
//
//   if (!(await confirmDialog('Remove this exam?', { confirm: 'Remove', danger: true }))) return
//   await alertDialog('Your account has been deleted.')

let current = null
const waiting = []
const listeners = new Set()

const emit = () => listeners.forEach(fn => fn(current))
function next() {
  current = waiting.shift() || null
  emit()
}

function open(dialog) {
  return new Promise(resolve => {
    // Nothing on the page to show it (shouldn't happen inside the app): fall back to the browser's.
    if (!listeners.size) {
      // eslint-disable-next-line no-alert
      resolve(dialog.kind === 'alert' ? window.alert(dialog.message) : window.confirm(dialog.message))
      return
    }
    waiting.push({ ...dialog, resolve })
    if (!current) next()
  })
}

/**
 * Ask before doing something. Resolves to true if they confirm.
 * Blank lines in `message` start a new paragraph.
 * @param {string} message
 * @param {{ title?: string, confirm?: string, cancel?: string, danger?: boolean }} [opts]
 *   `confirm` / `cancel`: the buttons' words (default "OK" / "Cancel").
 *   `danger`: the confirm button is red and focus starts on Cancel, so Enter doesn't do it.
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, opts = {}) {
  return open({ kind: 'confirm', message, ...opts }).then(Boolean)
}

/**
 * Tell them something, with one button. Resolves once it's closed.
 * @param {string} message
 * @param {{ title?: string, confirm?: string }} [opts]
 * @returns {Promise<void>}
 */
export function alertDialog(message, opts = {}) {
  return open({ kind: 'alert', message, ...opts }).then(() => undefined)
}

/** DialogHost: hear about the dialog on screen (or null). Returns an unsubscribe. */
export function subscribeDialogs(fn) {
  listeners.add(fn)
  fn(current)
  return () => listeners.delete(fn)
}

/** DialogHost: close the dialog on screen with this answer, and show the next one. */
export function closeDialog(answer) {
  const d = current
  if (!d) return
  d.resolve(answer)
  next()
}
