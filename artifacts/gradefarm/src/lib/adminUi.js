// Shared styles for the admin pages, built on the theme's CSS variables
// (--t-*) so every page follows light and dark mode. The same look as the
// Tutor Portal: plain cards, sentence-case labels, ink pills for choices,
// one gold button per action.

export const FONT_B = "'Plus Jakarta Sans', sans-serif"

export const ui = {
  card: { background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12 },
  // A short label above a field or group.
  label: { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--t-textSub)', marginBottom: 6 },
  hint: { fontSize: 12, color: 'var(--t-textMuted)', lineHeight: 1.5 },
  heading: { fontSize: 14.5, fontWeight: 800, color: 'var(--t-text)' },
  input: { padding: '8px 11px', borderRadius: 9, border: '1px solid var(--t-border)', background: 'var(--t-bgInput)', color: 'var(--t-text)', fontSize: 13, fontFamily: FONT_B, outline: 'none', boxSizing: 'border-box' },
  th: { textAlign: 'left', fontSize: 11.5, fontWeight: 700, color: 'var(--t-textMuted)', padding: '10px 14px', borderBottom: '1px solid var(--t-border)', whiteSpace: 'nowrap' },
  td: { padding: '10px 14px', fontSize: 13, color: 'var(--t-textSub)', borderBottom: '1px solid var(--t-border)', verticalAlign: 'middle' },
  empty: { padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--t-textMuted)', background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12 },
}

/** A choice in a row of options: ink when chosen, outlined when not. */
export const chip = (on, disabled = false) => ({
  padding: '6px 12px', borderRadius: 999, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
  border: `1px solid ${on ? 'var(--t-text)' : 'var(--t-border)'}`,
  background: on ? 'var(--t-text)' : 'var(--t-bgCard)',
  color: on ? 'var(--t-bg)' : 'var(--t-textMuted)',
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
})

/** 'primary' (gold), 'secondary' (outlined) or 'danger' (red outline). */
export const btn = (kind = 'secondary', disabled = false) => ({
  padding: '8px 14px', borderRadius: 9, fontFamily: FONT_B, fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap',
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  ...(kind === 'primary'
    ? { border: 'none', background: 'var(--t-accent)', color: '#0c1037' }
    : kind === 'danger'
      ? { border: '1px solid var(--t-danger)', background: 'transparent', color: 'var(--t-danger)' }
      : { border: '1px solid var(--t-border)', background: 'var(--t-bgCard)', color: 'var(--t-text)' }),
})

/** A one-line message: 'success', 'danger' or 'info'. */
export const note = (tone = 'info') => ({
  padding: '10px 14px', borderRadius: 9, fontSize: 13, lineHeight: 1.5,
  ...(tone === 'success'
    ? { background: 'var(--t-successBg)', color: 'var(--t-success)' }
    : tone === 'danger'
      ? { background: 'var(--t-dangerBg)', color: 'var(--t-danger)' }
      : { background: 'var(--t-bgSubtle)', color: 'var(--t-textSub)' }),
})

/** Text colour for a percentage correct. */
export const accuracyColor = (pct) =>
  pct == null ? 'var(--t-textFaint)' : pct >= 70 ? 'var(--t-success)' : pct >= 50 ? 'var(--t-goldText)' : 'var(--t-danger)'
