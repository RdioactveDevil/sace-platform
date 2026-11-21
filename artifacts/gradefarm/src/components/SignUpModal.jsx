import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { UserPlus } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { fetchIncludableSubjects, inviteStudent } from '../lib/db'
import { signUpDefaults } from '../lib/signUp'
import { InviteSubjectsSection } from './InviteSubjects'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Invite a prospect to join, straight from their finished consultation diagnostic.
 * Same fields as the Students tab's invite form (email, "send to a parent" with the
 * child's name, subjects included free), prefilled from the diagnostic.
 *
 *   row     the diagnostic row { id, curriculum_id, prospect_email, parent_email, student_name, submitted_by_name }
 *   onDone  called after the invite is saved; the caller reloads
 */
export default function SignUpModal({ row, theme, onClose, onDone }) {
  const t = THEMES[theme]
  const dark = theme === 'dark'

  const [includable, setIncludable] = useState(null) // null while loading
  const [toParent, setToParent] = useState(false)
  const [studentEmail, setStudentEmail] = useState(row.prospect_email || '')
  const [parentEmail, setParentEmail] = useState('')
  const [childName, setChildName] = useState('')
  const [subjects, setSubjects] = useState([])
  const [scope, setScope] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false) // invite saved, but its email didn't go out
  const [error, setError] = useState('')
  const emailRef = useRef(null)
  const openerRef = useRef(typeof document !== 'undefined' ? document.activeElement : null)
  const defaultsRef = useRef(signUpDefaults(row, {}))

  useEffect(() => {
    let cancelled = false
    fetchIncludableSubjects()
      .then(r => { if (!cancelled) setIncludable({ canInclude: !!r?.canInclude, subjects: r?.subjects || [] }) })
      .catch(() => { if (!cancelled) setIncludable({ canInclude: false, subjects: [] }) })
    return () => { cancelled = true }
  }, [])
  // Tick the diagnostic's own subject once we know what can be included.
  useEffect(() => {
    if (!includable) return
    setSubjects(signUpDefaults(row, { canInclude: includable.canInclude, includableIds: includable.subjects.map(s => s.id) }).curriculumIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includable])

  useEffect(() => {
    emailRef.current?.focus()
    const opener = openerRef.current
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); setTimeout(() => opener?.focus?.(), 0) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chooseRecipient = (parent) => {
    setToParent(parent); setError('')
    if (parent) {
      const d = defaultsRef.current
      if (!parentEmail && d.parentEmail) setParentEmail(d.parentEmail)
      if (!childName) setChildName(d.childName)
    }
  }

  const sourceId = row.curriculum_id
  const sourceKnown = !!includable && !!sourceId
  const sourceTicked = subjects.includes(sourceId)
  const carryWarning = sourceKnown && !sourceTicked
  const email = (toParent ? parentEmail : studentEmail).trim()
  const ready = !!includable && !saving && !saved

  const submit = async (e) => {
    e.preventDefault()
    if (!ready) return
    const child = childName.trim()
    if (!EMAIL_RE.test(email)) { setError(toParent ? "Enter the parent's email address." : "Enter the student's email address."); return }
    if (toParent && !child) { setError("Enter the child's first name."); return }
    setError(''); setSaving(true)
    try {
      const picked = Object.fromEntries(subjects.filter(id => scope[id]?.length).map(id => [id, scope[id]]))
      const res = await inviteStudent(email, includable.canInclude ? subjects : undefined, includable.canInclude ? picked : undefined,
        { parent: toParent, childName: child }, row.id)
      await onDone()
      if (res.emailSent) { onClose(); return }
      setSaved(true)
      setError(`Invite saved, but the email didn't send: ${String(res.emailError || 'unknown error').replace(/\.+$/, '')}. Resend it from the Students tab.`)
    } catch (err) {
      setError(err.message || "That didn't work. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`,
    background: dark ? 'var(--t-bgSubtle)' : t.bgCard,
    color: t.text, fontFamily: FONT_B, fontSize: 14, boxSizing: 'border-box', outline: 'none',
  }
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 6, fontFamily: FONT_B }
  const chipStyle = (active) => ({ padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? t.text : t.border}`, background: active ? t.text : t.bgCard, color: active ? t.bg : t.textMuted, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, whiteSpace: 'nowrap' })
  const who = row.submitted_by_name || row.student_name || row.prospect_email || 'this prospect'
  const busy = !ready
  const ids = useMemo(() => ({ email: `su-email-${row.id}`, child: `su-child-${row.id}` }), [row.id])

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16, overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="su-title" style={{ background: t.bgCard, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, borderRadius: 12, padding: 32, width: '100%', maxWidth: 520, fontFamily: FONT_B, margin: 'auto', backdropFilter: 'blur(16px)' }}>
        <h2 id="su-title" style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserPlus size={17} aria-hidden="true" />Sign them up
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: t.textMuted }}>
          Invite {who} to join your roster. They keep their consultation diagnostic when the subject below is included.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div role="radiogroup" aria-label="Send the invite to" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, marginRight: 4 }}>Send the invite to</span>
            {[[false, 'The student'], [true, 'A parent']].map(([v, label]) => (
              <button key={label} type="button" role="radio" aria-checked={toParent === v} onClick={() => chooseRecipient(v)} style={chipStyle(toParent === v)}>{label}</button>
            ))}
          </div>

          {toParent && (
            <div>
              <label htmlFor={ids.child} style={labelStyle}>Child's first name</label>
              <input id={ids.child} className="td-input-gold" value={childName} maxLength={40} autoComplete="off"
                onChange={e => { setChildName(e.target.value); setError('') }} style={inputStyle} />
            </div>
          )}
          <div>
            <label htmlFor={ids.email} style={labelStyle}>{toParent ? "Parent's email" : "Student's email"}</label>
            <input id={ids.email} ref={emailRef} className="td-input-gold" type="email" required autoCapitalize="none" spellCheck={false}
              value={toParent ? parentEmail : studentEmail} placeholder={toParent ? 'parent@email.com' : 'student@email.com'}
              onChange={e => { (toParent ? setParentEmail : setStudentEmail)(e.target.value); setError('') }} style={inputStyle} />
          </div>

          {!includable ? (
            <div style={{ fontSize: 13, color: t.textMuted }}>Loading your subjects…</div>
          ) : includable.canInclude && includable.subjects.length > 0 && (
            <InviteSubjectsSection subjects={includable.subjects} selected={subjects} scope={scope} theme={theme}
              onToggle={id => setSubjects(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))}
              onScope={(id, v) => setScope(prev => ({ ...prev, [id]: v }))}>
              {carryWarning && <div role="status" style={{ marginTop: 8, fontSize: 12, color: t.goldText, fontWeight: 600 }}>Their consultation diagnostic won't carry across without this subject.</div>}
            </InviteSubjectsSection>
          )}
          {includable && !includable.canInclude && sourceKnown && (
            <div role="status" style={{ fontSize: 12, color: t.goldText, fontWeight: 600 }}>Their consultation diagnostic won't carry across without this subject.</div>
          )}

          {error && <p role="alert" style={{ color: t.danger, fontSize: 13, margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 20px', borderRadius: 9, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, background: dark ? 'var(--t-bgSubtle)' : 'transparent', color: t.textMuted, fontFamily: FONT_B, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {saved ? 'Close' : 'Cancel'}
            </button>
            <button type="submit" disabled={busy} className={busy ? '' : 'btn-gold-shimmer'} style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: busy ? (dark ? 'var(--t-bgSubtle)' : t.border) : 'var(--t-accent)', color: busy ? t.textMuted : 'var(--t-onAccent)', fontFamily: FONT_B, fontSize: 13, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>
              {saving ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
