import { useEffect, useState } from 'react'
import { adminGetTutor, adminSetTutorIncludeSubject, adminSetTutorBillingExempt, adminRemoveTutorPlanSubject, adminLinkTutor, adminUnlinkTutor } from '../lib/db'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "Free portal (exempt)", "Pro · monthly", "No tutor plan", … for a row from adminListTutors. */
export function tutorPlanLabel(t) {
  if (t.billing_exempt) return 'Free portal (exempt)'
  if (t.plan_active) return `${t.plan || 'Plan'} · ${t.plan_interval === 'year' ? 'annual' : 'monthly'}${t.plan_status === 'past_due' ? ' · payment overdue' : ''}`
  return 'No tutor plan'
}

/**
 * The tutor part of a person's panel in Admin › People: their plan, the two
 * admin switches (free portal, include free subjects), plan subjects, their
 * roster (assign and unassign students) and the work they've set.
 */
export default function AdminTutorSection({ tutor, students, onChange }) {
  const [t, setT] = useState(tutor)
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [addStudentId, setAddStudentId] = useState('')
  useEffect(() => { setT(tutor) }, [tutor])

  const loadDetail = () => adminGetTutor(tutor.id).then(setDetail).catch(e => setError(e.message))
  useEffect(() => { loadDetail() }, [tutor.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key, fn) => {
    setBusy(key); setError('')
    try { await fn(); onChange?.() } catch (e) { setError(e.message) }
    setBusy('')
  }
  const toggleInclude = () => run('include', async () => {
    const enabled = !t.can_include_subject
    await adminSetTutorIncludeSubject(t.id, enabled)
    setT(x => ({ ...x, can_include_subject: enabled }))
  })
  const toggleExempt = () => run('exempt', async () => {
    const exempt = !t.billing_exempt
    await adminSetTutorBillingExempt(t.id, exempt)
    setT(x => ({ ...x, billing_exempt: exempt, plan_active: exempt || ['active', 'trialing', 'past_due'].includes(x.plan_status) }))
  })
  const removePlanSubject = (name) => {
    if (!window.confirm(`Take ${name} off ${t.display_name || 'this tutor'}'s plan? They can then use another subject in its place.`)) return
    run('plan', async () => {
      const { plan_subjects } = await adminRemoveTutorPlanSubject(t.id, name)
      setT(x => ({ ...x, plan_subjects }))
    })
  }
  const changeLink = (fn) => run('link', async () => { await fn(); await loadDetail() })

  const heading = { fontSize: 13, fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }
  const row = (first) => ({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: first ? 'none' : '1px solid var(--t-border)' })
  const sw = (on, key) => ({ flexShrink: 0, minWidth: 48, padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 800, fontFamily: FONT_B, cursor: busy ? 'default' : 'pointer',
    border: on ? 'none' : '1px solid var(--t-border)', background: on ? 'var(--t-success)' : 'var(--t-bgCard)', color: on ? '#fff' : 'var(--t-textMuted)', opacity: busy === key ? 0.6 : 1 })
  const linkBtn = (color = 'var(--t-textSub)') => ({ padding: 0, border: 'none', background: 'none', color, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B })
  const roster = detail?.roster || []
  const open = (detail?.assignments || []).filter(a => a.status !== 'completed')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div style={{ fontSize: 12.5, color: 'var(--t-danger)' }}>{error}</div>}

      <div>
        <div style={heading}>Tutor plan</div>
        <div style={row(true)}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--t-text)' }}>Free tutor portal</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--t-textMuted)' }}>{tutorPlanLabel(t)}. On: no plan needed and no student limit.</span>
          </span>
          <button type="button" role="switch" aria-checked={!!t.billing_exempt} disabled={!!busy} onClick={toggleExempt} style={sw(t.billing_exempt, 'exempt')}>{t.billing_exempt ? 'On' : 'Off'}</button>
        </div>
        <div style={row(false)}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--t-text)' }}>Include free subjects</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--t-textMuted)' }}>Their students get the subjects they tutor them in, free, while on their roster.</span>
          </span>
          <button type="button" role="switch" aria-checked={!!t.can_include_subject} disabled={!!busy} onClick={toggleInclude} style={sw(t.can_include_subject, 'include')}>{t.can_include_subject ? 'On' : 'Off'}</button>
        </div>
        {t.plan_subjects?.length > 0 && (
          <div style={row(false)}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--t-text)' }}>Plan subjects</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {t.plan_subjects.map(name => (
                  <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 6px 3px 10px', borderRadius: 999, border: '1px solid var(--t-border)', fontSize: 12, color: 'var(--t-textSub)' }}>
                    {name}
                    <button type="button" onClick={() => removePlanSubject(name)} disabled={!!busy} aria-label={`Take ${name} off the plan`} style={{ border: 'none', background: 'none', padding: '0 2px', color: 'var(--t-textMuted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </span>
            </span>
          </div>
        )}
      </div>

      <div>
        <div style={heading}>Students <span style={{ fontWeight: 500, color: 'var(--t-textFaint)' }}>· {detail ? roster.length : t.roster_size}</span></div>
        {!detail ? (
          <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', padding: '6px 0' }}>Loading…</div>
        ) : roster.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', padding: '6px 0' }}>No students on their roster yet.</div>
        ) : roster.map((s, i) => (
          <div key={s.student_id} style={row(i === 0)}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--t-text)' }}>{s.display_name || s.email || 'Unnamed'}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--t-textMuted)' }}>
                {s.accuracy == null ? 'No answers yet' : `${s.accuracy}% correct`} · added {fmtDate(s.invited_at)}
              </span>
            </span>
            <button type="button" onClick={() => changeLink(() => adminUnlinkTutor(t.id, s.student_id))} disabled={!!busy} style={linkBtn('var(--t-danger)')}>Unassign</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <select value={addStudentId} onChange={e => setAddStudentId(e.target.value)} disabled={!!busy} aria-label="Assign a student"
            style={{ flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 9, border: '1px solid var(--t-border)', background: 'var(--t-bgInput)', color: 'var(--t-text)', fontSize: 12.5, fontFamily: FONT_B }}>
            <option value="">Assign a student…</option>
            {(students || []).filter(st => st.id !== t.id && !roster.some(r => r.student_id === st.id))
              .map(st => <option key={st.id} value={st.id}>{st.display_name || st.email}</option>)}
          </select>
          <button type="button" disabled={!addStudentId || !!busy}
            onClick={() => changeLink(async () => { await adminLinkTutor(t.id, addStudentId); setAddStudentId('') })}
            style={{ padding: '7px 13px', borderRadius: 9, border: 'none', background: 'var(--t-accent)', color: '#0c1037', fontSize: 12.5, fontWeight: 800, fontFamily: FONT_B, cursor: 'pointer', opacity: !addStudentId || busy ? 0.5 : 1 }}>
            Assign
          </button>
        </div>
      </div>

      <div>
        <div style={heading}>Work they've set <span style={{ fontWeight: 500, color: 'var(--t-textFaint)' }}>· {t.assignments_total} total, {t.assignments_overdue} overdue</span></div>
        {!detail ? null : open.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', padding: '6px 0' }}>Nothing open.</div>
        ) : open.slice(0, 6).map((a, i) => (
          <div key={a.id} style={row(i === 0)}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--t-text)' }}>{a.type} · {a.student_name || 'Student'}</span>
              <span style={{ display: 'block', fontSize: 12, color: a.status === 'overdue' ? 'var(--t-danger)' : 'var(--t-textMuted)' }}>
                {a.status === 'overdue' ? 'Overdue' : 'Due'} {fmtDate(a.due_date)}{a.subject ? ` · ${a.subject}` : ''}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
