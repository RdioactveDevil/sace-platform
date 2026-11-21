// How a diagnostic's status (from GET /tutor/diagnostic/list) shows in the tutor's list.

const CHIPS = {
  sent:        { label: 'Sent', tone: 'muted' },
  link:        { label: 'Link only', tone: 'muted' },
  opened:      { label: 'Opened', tone: 'gold' },
  in_progress: { label: 'In progress', tone: 'gold' },
  finished:    { label: 'Finished', tone: 'success' },
  expired:     { label: 'Expired', tone: 'danger' },
  cancelled:   { label: 'Cancelled', tone: 'muted' },
}

export function statusChip(statusLabel) {
  return CHIPS[statusLabel] ? { ...CHIPS[statusLabel] } : { label: String(statusLabel ?? ''), tone: 'muted' }
}
