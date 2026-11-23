// How a diagnostic's status (from GET /tutor/diagnostic/list) shows in the tutor's list.

const CHIPS = {
  sent:        { label: 'Sent', tone: 'muted' },
  link:        { label: 'Link only', tone: 'muted' },
  opened:      { label: 'Opened', tone: 'gold' },
  in_progress: { label: 'In progress', tone: 'gold' },
  finished:    { label: 'Finished', tone: 'success' },
  marking:     { label: 'Marking…', tone: 'gold' },
  marking_failed: { label: 'Marking failed', tone: 'danger' },
  expired:     { label: 'Expired', tone: 'danger' },
  cancelled:   { label: 'Cancelled', tone: 'muted' },
  no_test:     { label: 'No test', tone: 'muted' },
}

export function statusChip(statusLabel) {
  return CHIPS[statusLabel] ? { ...CHIPS[statusLabel] } : { label: String(statusLabel ?? ''), tone: 'muted' }
}

const Q_CHIPS = {
  none:      { label: 'Questionnaire: not booked yet', tone: 'muted' },
  waiting:   { label: 'Questionnaire: waiting', tone: 'gold' },
  submitted: { label: 'Questionnaire: filled in', tone: 'success' },
}

/** The questionnaire chip for a diagnostic's questionnaire_status; null (no questionnaire) shows none. */
export function questionnaireChip(status) {
  return Q_CHIPS[status] ? { ...Q_CHIPS[status] } : null
}
