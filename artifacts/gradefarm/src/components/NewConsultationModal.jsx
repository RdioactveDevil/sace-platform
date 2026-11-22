import { useState, useEffect, useRef } from 'react'
import { CalendarPlus } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { confirmDialog } from '../lib/dialog'
import InfinityLoader from './InfinityLoader'
import ReminderEditor from './ReminderEditor'
import DialogFrame, { DialogButtons } from './DialogFrame'
import { TimeChooser, useConsultationTimes } from './ConsultationTimes'
import { TestBuilder } from './TestBuilder'
import { QuestionnaireSection } from './QuestionnaireBlocks'
import { createNewConsultation, fetchQuestionnaire } from '../lib/db'
import { formatWhen } from '../lib/bookingFormat'
import { blocksImplicitSubmit } from '../lib/implicitSubmit'
import { emptyNewConsultation, newConsultationBody, newConsultationError, recipientsError } from '../lib/newConsultation'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

/**
 * Book a consultation first, then say who gets it and what goes with it: the
 * student, the parent or both; the questionnaire; a diagnostic test (generated
 * and previewed here, as on the Diagnostic tab). One email per ticked
 * recipient, with the call details.
 *
 *   onDone(result)   { diagnosticId, sessionId, start, emailed } after it's booked; the caller refreshes
 *   onOpenSettings() shown when no weekly hours are set yet
 */
export default function NewConsultationModal({ theme, onClose, onDone, onOpenSettings }) {
  const t = THEMES[theme]
  const dark = theme === 'dark'
  const times = useConsultationTimes({ always: true })
  const { loading, zone, zoneReady, startIso, defaultReminders } = times

  const [form, setForm] = useState(emptyNewConsultation)
  const [touched, setTouched] = useState({ student: false, parent: false }) // a tick the tutor set by hand stays as set
  const [master, setMaster] = useState(null)
  const [masterError, setMasterError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const nameRef = useRef(null)

  const set = (patch) => { setForm(f => ({ ...f, ...patch })); setError('') }

  // The tutor's own questionnaire, for the summary and "Edit for this student".
  useEffect(() => {
    let cancelled = false
    fetchQuestionnaire()
      .then(r => { if (!cancelled) { setMaster(r.questionnaire); setMasterError(false) } })
      .catch(() => { if (!cancelled) setMasterError(true) })
    return () => { cancelled = true }
  }, [])

  // The name field renders once the open times have loaded; focus it then.
  useEffect(() => { if (!loading) nameRef.current?.focus() }, [loading])

  const reminders = form.reminderMinutes ?? defaultReminders
  const full = { ...form, startIso: startIso || '', reminderMinutes: reminders }
  const blocker = zoneReady ? newConsultationError(full) : 'Still loading your time zone.'
  const recipientsProblem = recipientsError(form)
  const dirty = !!(form.studentName || form.studentEmail || form.parentEmail || form.test || form.tailored || startIso)

  // Both ticks go on once an address is typed, unless the tutor has set that tick by hand.
  const typeEmail = (which, value) => {
    const key = which === 'student' ? 'studentEmail' : 'parentEmail'
    const tick = which === 'student' ? 'sendToStudent' : 'sendToParent'
    const wasEmpty = !String(form[key]).trim()
    set({ [key]: value, ...(wasEmpty && value.trim() && !touched[which] ? { [tick]: true } : {}) })
  }
  const tick = (which, on) => {
    setTouched(x => ({ ...x, [which]: true }))
    set({ [which === 'student' ? 'sendToStudent' : 'sendToParent']: on })
  }

  // Resolves true when it is fine to leave: nothing entered, or the tutor confirmed the discard.
  const confirmLeave = async () => {
    if (saving) return false
    if (dirty && !(await confirmDialog("Discard this consultation? Nothing has been booked or sent.", { confirm: 'Discard', cancel: 'Keep editing', danger: true }))) return false
    return true
  }
  const requestClose = async () => { if (await confirmLeave()) onClose() }
  const openSettings = async () => { if (await confirmLeave()) onOpenSettings?.() }

  const submit = async (e) => {
    e.preventDefault()
    if (blocker || saving) { if (blocker) setError(blocker); return }
    setError('')
    setSaving(true)
    let result
    try {
      result = await createNewConsultation(newConsultationBody(full))
    } catch (err) {
      const when = err?.status === 409 && err.body?.booking?.start ? ` Booked for ${formatWhen(err.body.booking.start, zone)}.` : ''
      setError(`${err.message || "That didn't work. Please try again."}${when}`)
      setSaving(false)
      return
    }
    // It's booked. A failed refresh of the list must not read as a failed booking.
    try { await onDone(result) } catch { /* the list refreshes on its next load */ }
    onClose()
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`,
    background: dark ? 'var(--t-bgSubtle)' : t.bgCard,
    color: t.text, fontFamily: FONT_B, fontSize: 14, boxSizing: 'border-box', outline: 'none',
  }
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 6, fontFamily: FONT_B }
  const sectionTitle = { fontSize: 12, fontWeight: 800, color: t.text, margin: 0, letterSpacing: '0.02em', textTransform: 'uppercase' }
  const section = { display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 16, borderTop: '1px solid var(--t-border)' }
  const tickRow = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: t.text, cursor: 'pointer', fontFamily: FONT_B }
  const tickBox = { width: 16, height: 16, accentColor: 'var(--t-accent)', cursor: 'pointer', flexShrink: 0 }
  const hint = { fontSize: 11, color: t.textFaint, marginTop: 4 }

  const onlyParent = form.sendToParent && !form.sendToStudent

  return (
    <DialogFrame theme={theme} title="New consultation" icon={<CalendarPlus size={17} aria-hidden="true" />} maxWidth={640}
      intro="Book the call first, then choose who gets the details and what goes with them."
      onRequestClose={requestClose}>
      {loading ? (
        <div style={{ color: t.textMuted, textAlign: 'center', padding: '24px 0', fontSize: 14 }}>
          <InfinityLoader size={40} label={null} style={{ margin: '0 auto 10px' }} />
          Loading your open times…
        </div>
      ) : (
        <form onSubmit={submit} onKeyDown={e => { if (blocksImplicitSubmit(e)) e.preventDefault() }} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Who */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={sectionTitle}>Who</h3>
            <div>
              <label htmlFor="nc-name" style={labelStyle}>Student's name</label>
              <input id="nc-name" ref={nameRef} className="td-input-gold" value={form.studentName} maxLength={100} autoComplete="off"
                onChange={e => set({ studentName: e.target.value })} placeholder="e.g. Sarah Jones" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div>
                <label htmlFor="nc-student-email" style={labelStyle}>Student's email</label>
                <input id="nc-student-email" className="td-input-gold" type="email" autoCapitalize="none" spellCheck={false} value={form.studentEmail}
                  onChange={e => typeEmail('student', e.target.value)} placeholder="e.g. sarah@example.com" style={inputStyle} />
                <label style={{ ...tickRow, marginTop: 8 }}>
                  <input type="checkbox" style={tickBox} checked={form.sendToStudent} onChange={e => tick('student', e.target.checked)} />
                  Send to student
                </label>
              </div>
              <div>
                <label htmlFor="nc-parent-email" style={labelStyle}>Parent's email</label>
                <input id="nc-parent-email" className="td-input-gold" type="email" autoCapitalize="none" spellCheck={false} value={form.parentEmail}
                  onChange={e => typeEmail('parent', e.target.value)} placeholder="e.g. parent@example.com" style={inputStyle} />
                <label style={{ ...tickRow, marginTop: 8 }}>
                  <input type="checkbox" style={tickBox} checked={form.sendToParent} onChange={e => tick('parent', e.target.checked)} />
                  Send to parent
                </label>
              </div>
            </div>
            <div style={{ fontSize: 12, color: recipientsProblem && (form.studentEmail || form.parentEmail || form.sendToStudent || form.sendToParent) ? t.danger : t.textMuted }} role={recipientsProblem && (form.sendToStudent || form.sendToParent) ? 'status' : undefined}>
              {recipientsProblem && (form.studentEmail || form.parentEmail || form.sendToStudent || form.sendToParent)
                ? recipientsProblem
                : onlyParent
                  ? "Goes to the parent only. Their email names the student and asks them to pass the test and questionnaire on."
                  : form.sendToStudent && form.sendToParent
                    ? 'The student gets the email, and the parent gets a copy.'
                    : 'Each ticked person gets one email with the call details.'}
            </div>
          </div>

          {/* When */}
          <div style={section}>
            <h3 style={sectionTitle}>When</h3>
            <TimeChooser times={times} theme={theme} formatWhen={formatWhen} onOpenSettings={openSettings} showNoHours labelStyle={labelStyle} inputStyle={inputStyle} />
            {reminders && (
              <div>
                <div style={labelStyle}>Reminders before the call</div>
                <ReminderEditor value={reminders} onChange={v => set({ reminderMinutes: v })} theme={theme} />
                <div style={hint}>Your defaults. Change them for this call only.</div>
              </div>
            )}
          </div>

          {/* What */}
          <div style={section}>
            <h3 style={sectionTitle}>What to send</h3>
            <div style={{ fontSize: 13, color: t.text, padding: '10px 14px', borderRadius: 8, background: 'var(--t-bgSubtle)', border: '1px solid var(--t-border)' }}>
              <span style={{ fontWeight: 700 }}>Meeting details</span> are always included: the time, the join link and the calendar invite.
            </div>

            <div>
              <label style={tickRow}>
                <input type="checkbox" style={tickBox} checked={form.sendQuestionnaire} onChange={e => set({ sendQuestionnaire: e.target.checked })} />
                Pre-call questionnaire
              </label>
              {form.sendQuestionnaire && (
                <div style={{ marginTop: 10 }}>
                  <QuestionnaireSection master={master} masterError={masterError} tailored={form.tailored} onTailor={q => set({ tailored: q })}
                    theme={theme} labelStyle={labelStyle} label={null} hint="Edit your own in the &quot;Pre-call questionnaire&quot; tab of Diagnostics." />
                </div>
              )}
            </div>

            <div>
              <label style={tickRow}>
                <input type="checkbox" style={tickBox} checked={form.sendTest} onChange={e => set({ sendTest: e.target.checked })} />
                Diagnostic test
              </label>
              {form.sendTest ? (
                <div style={{ marginTop: 12 }}>
                  <TestBuilder theme={theme} value={form.test} onChange={v => set({ test: v })} idPrefix="nc-test" labelStyle={labelStyle} inputStyle={inputStyle} disabled={saving} />
                </div>
              ) : (
                <div style={hint}>No test goes out now. You can send one later from Sent diagnostics.</div>
              )}
            </div>
          </div>

          {error && <p role="alert" style={{ color: t.danger, fontSize: 13, margin: 0 }}>{error}</p>}

          <DialogButtons theme={theme} onCancel={requestClose} submitLabel={saving ? 'Sending…' : 'Book and send'} busy={saving} disabled={!!blocker}
            hint={blocker && !error ? blocker : null} />
        </form>
      )}
    </DialogFrame>
  )
}
