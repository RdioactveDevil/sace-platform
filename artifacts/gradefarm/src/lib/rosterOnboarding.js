// Getting a tutor's new students going: inviting several at once, and where
// each one is between joining the roster and practising.

/** Distinct, lower-cased addresses from pasted text (commas, semicolons, spaces or new lines between them). */
export function parseEmailList(text) {
  return [...new Set(String(text || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean))]
}

/**
 * Where a roster student is in getting started:
 *   'diagnostic'  – a diagnostic on an included subject is waiting for them
 *   'not_started' – nothing waiting, but they haven't answered a question yet
 *   'practising'  – they've started practising
 */
export function gettingStartedStatus({ diagnostics = [], xp = 0 } = {}) {
  if (diagnostics.some(d => d.status === 'pending')) return 'diagnostic'
  return xp > 0 ? 'practising' : 'not_started'
}
