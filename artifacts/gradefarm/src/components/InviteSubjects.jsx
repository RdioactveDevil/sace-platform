import { THEMES } from '../lib/theme'
import DiagnosticScopePicker from './DiagnosticScopePicker'
import { needsOwnDiagnostic } from '../lib/signUp'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

// ── Subject toggles: used by the invite forms and the included-subjects editor ──
export function SubjectChips({ subjects, selected, onToggle, busyId = null, theme }) {
  const t = THEMES[theme]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {subjects.map(su => {
        const on = selected.includes(su.id)
        return (
          <button key={su.id} type="button" onClick={() => onToggle(su.id)} disabled={!!busyId} aria-pressed={on}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 9, cursor: busyId ? 'default' : 'pointer', fontFamily: FONT_B, opacity: busyId && busyId !== su.id ? 0.6 : 1,
              border: `1px solid ${on ? 'var(--t-text)' : t.border}`, background: on ? 'var(--t-bgSubtle)' : 'transparent', color: on ? 'var(--t-text)' : t.textSub }}>
            <span>{busyId === su.id ? '…' : on ? '✓' : '+'}</span>
            {su.label}
          </button>
        )
      })}
    </div>
  )
}

// ── The invite form's "Subjects included free" block, with each subject's diagnostic scope ──
// carriedId (optional): a subject whose existing diagnostic comes across, so it gets no new one and no scope.
export function InviteSubjectsSection({ subjects, selected, scope, onToggle, onScope, theme, carriedId }) {
  const t = THEMES[theme]
  const carried = carriedId && selected.includes(carriedId) ? subjects.find(su => su.id === carriedId) : null
  const own = selected.filter(id => id !== carried?.id)
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>Subjects included free</div>
      <SubjectChips subjects={subjects} selected={selected} theme={theme} onToggle={onToggle} />
      {carried && <div style={{ marginTop: 8, fontSize: 12, color: t.textMuted }}>Their consultation diagnostic carries across for {carried.label}.</div>}
      {selected.length > 0 && needsOwnDiagnostic(selected, carried?.id) && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: t.textMuted }}>
            Before practising, they do a 20-question diagnostic on each subject. Choose what it covers, or leave it on all topics.
          </div>
          {own.map(id => (
            <DiagnosticScopePicker key={id} theme={theme}
              subject={subjects.find(su => su.id === id)}
              selected={scope[id] || []}
              onChange={ids => onScope(id, ids)} />
          ))}
        </div>
      )}
    </div>
  )
}
